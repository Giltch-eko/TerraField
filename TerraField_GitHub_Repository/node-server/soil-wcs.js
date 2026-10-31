'use strict';
// Minimal, deliberately strict reader for the small signed 16-bit GeoTIFFs
// returned by ISRIC's public WCS. No npm package or Python is needed.
const {inflateSync} = require('node:zlib');
const WCS_ENDPOINT='https://maps.isric.org/mapserv';
const WGS84='http://www.opengis.net/def/crs/EPSG/0/4326';

function coverageUrl(property,depth,lat,lon) {
  // A tiny, symmetric WGS84 window. The reader uses the returned geo-transform
  // to find the requested coordinate, not an arbitrary pixel or average.
  if (Math.abs(lat)>89.997 || Math.abs(lon)>179.997) throw new Error('WCS window crosses a coordinate boundary');
  const span=.003;
  const params=new URLSearchParams({map:`/map/${property}.map`,SERVICE:'WCS',VERSION:'2.0.1',REQUEST:'GetCoverage',
    COVERAGEID:`${property}_${depth}_mean`,FORMAT:'GEOTIFF_INT16',SUBSETTINGCRS:WGS84,OUTPUTCRS:WGS84});
  params.append('SUBSET',`X(${(lon-span).toFixed(6)},${(lon+span).toFixed(6)})`);
  params.append('SUBSET',`Y(${(lat-span).toFixed(6)},${(lat+span).toFixed(6)})`);
  return `${WCS_ENDPOINT}?${params}`;
}

function readGeoTiffPoint(buffer,lat,lon) {
  if (!Buffer.isBuffer(buffer) || buffer.length<16 || buffer.length>1_000_000) throw new Error('Invalid WCS raster');
  const endian=buffer.toString('ascii',0,2);
  if (endian!=='II' && endian!=='MM') throw new Error('WCS did not return a TIFF');
  const le=endian==='II';
  const ensure=(offset,length)=>{
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset<0 || length<0 || offset+length>buffer.length) throw new Error('Invalid TIFF bounds');
  };
  const u16=offset=>{ensure(offset,2);return le?buffer.readUInt16LE(offset):buffer.readUInt16BE(offset);};
  const u32=offset=>{ensure(offset,4);return le?buffer.readUInt32LE(offset):buffer.readUInt32BE(offset);};
  const f64=offset=>{ensure(offset,8);return le?buffer.readDoubleLE(offset):buffer.readDoubleBE(offset);};
  if(u16(2)!==42) throw new Error('Unsupported TIFF version');
  const ifd=u32(4), count=u16(ifd);
  if(count>128) throw new Error('Unexpected TIFF directory');
  ensure(ifd+2,count*12+4);
  const tags=new Map(), sizes={1:1,2:1,3:2,4:4,12:8};
  for(let i=0;i<count;i++) {
    const pos=ifd+2+i*12, tag=u16(pos), type=u16(pos+2), n=u32(pos+4), size=sizes[type];
    if(!size || n>10000) continue;
    const bytes=n*size, start=bytes<=4?pos+8:u32(pos+8);
    ensure(start,bytes);
    let values;
    if(type===2) values=buffer.toString('ascii',start,start+bytes).replace(/\0+$/,'');
    else {
      values=[];
      for(let j=0;j<n;j++) values.push(type===12?f64(start+j*size):type===4?u32(start+j*size):type===3?u16(start+j*size):buffer[start+j]);
    }
    tags.set(tag,values);
  }
  const one=(tag,fallback)=>tags.has(tag)?tags.get(tag)[0]:fallback;
  const width=one(256),height=one(257),bits=one(258),compression=one(259,1),samples=one(277,1),predictor=one(317,1),sampleFormat=one(339,1);
  const tileWidth=one(322),tileHeight=one(323),offsets=tags.get(324),byteCounts=tags.get(325);
  const scales=tags.get(33550),tie=tags.get(33922),geo=tags.get(34735);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>256||height>256 ||
      bits!==16 || samples!==1 || ![1,2].includes(sampleFormat) || ![1,8,32946].includes(compression) || ![1,2].includes(predictor) ||
      !Number.isInteger(tileWidth)||!Number.isInteger(tileHeight)||tileWidth<width||tileHeight<height||tileWidth>512||tileHeight>512 ||
      !offsets||offsets.length!==1||!byteCounts||byteCounts.length!==1 || !scales||scales.length<2||!tie||tie.length<6 || !geo||geo.length<8) {
    throw new Error('Unsupported WCS raster format');
  }
  let epsg4326=false;
  for(let i=4;i+3<geo.length;i+=4) if(geo[i]===2048 && geo[i+1]===0 && geo[i+3]===4326) epsg4326=true;
  if(!epsg4326 || !Number.isFinite(scales[0]) || scales[0]<=0 || !Number.isFinite(scales[1]) || scales[1]<=0) throw new Error('Unexpected WCS coordinate system');
  const col=Math.floor((lon-tie[3])/scales[0]+tie[0]);
  const row=Math.floor((tie[4]-lat)/scales[1]+tie[1]);
  if(!Number.isSafeInteger(col)||!Number.isSafeInteger(row)||col<0||col>=width||row<0||row>=height) throw new Error('WCS raster does not contain the requested point');
  const bytes=tileWidth*tileHeight*2;
  ensure(offsets[0],byteCounts[0]);
  const encoded=buffer.subarray(offsets[0],offsets[0]+byteCounts[0]);
  const data=compression===1?encoded:inflateSync(encoded,{maxOutputLength:bytes});
  if(data.length!==bytes) throw new Error('Incomplete WCS raster');
  let raw=0;
  // TIFF horizontal differencing is applied independently to each tile row.
  for(let x=0;x<=col;x++) {
    const pos=(row*tileWidth+x)*2, next=le?data.readUInt16LE(pos):data.readUInt16BE(pos);
    raw=predictor===2?(raw+next)&0xffff:next;
  }
  if(sampleFormat===2 && raw>=32768) raw-=65536;
  const nodata=tags.get(42113);
  // ISRIC's WGS84 GeoTIFF output uses zero for empty cells. Zero could also
  // be a legitimate fraction, so it is conservatively reported as missing.
  if(raw===0 || raw===-32768 || (typeof nodata==='string' && Number(nodata)===raw)) return null;
  return raw;
}
module.exports={coverageUrl,readGeoTiffPoint};
