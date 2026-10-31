'use strict';
// Offline, attributed GeoNames place index. Online providers can find additional
// villages, names, addresses and features that this deliberately limited dump
// does not contain. This file uses only Node built-ins and works without Python.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const DATA=path.join(__dirname,'..','server','data');
let index;

function normalize(value) {
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .normalize('NFC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'')
    .replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/gu,' ').trim();
}
function kindOf(code) {
  if(code==='PCLH')return 'historical country / territory';
  if(code==='PPLH')return 'historical populated place';
  if(code==='PPLQ')return 'abandoned populated place';
  if(code==='PPLW')return 'destroyed populated place';
  if(code.startsWith('PCL') || code==='TERR') return 'country';
  if(code==='ADM1')return 'region';
  if(code==='ADM2')return 'district';
  if(code==='PPLC')return 'capital';
  if(code.startsWith('PPLA'))return 'city / administrative seat';
  if(code.startsWith('PPL'))return 'city / town / village';
  return 'place';
}
function load() {
  if(index)return index;
  const meta=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA,'place-meta.json.gz'))).toString('utf8'));
  const lines=zlib.gunzipSync(fs.readFileSync(path.join(DATA,'world-places.tsv.gz'))).toString('utf8').split('\n');
  const records=[];
  for(const line of lines) {
    if(!line)continue;
    const f=line.split('\t');if(f.length<11)continue;
    const [id,rawName,ascii,alts,lat,lon,code,cc,admin1,admin2,pop]=f;
    const latitude=Number(lat),longitude=Number(lon);
    if(!rawName || !Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<-90||latitude>90||longitude<-180||longitude>180)continue;
    const countryInfo=meta.countries[cc]||{},isCountry=code.startsWith('PCL')||code==='TERR';
    const region=meta.admin1[`${cc}.${admin1}`]||'';
    const county=meta.admin2[`${cc}.${admin1}.${admin2}`]||'';
    // Use GeoNames' short country name for display when available, keeping the
    // formal feature name as another searchable alias.
    const name=isCountry && countryInfo.name?countryInfo.name:code==='ADM1' && region?region:code==='ADM2' && county?county:rawName;
    const primary=normalize(name),asciiKey=normalize(ascii),rawKey=normalize(rawName);
    const aliases=new Set([asciiKey,rawKey]);
    for(const a of alts.split(',')){const n=normalize(a);if(n)aliases.add(n);}
    if(isCountry){if(cc)aliases.add(normalize(cc));if(countryInfo.iso3)aliases.add(normalize(countryInfo.iso3));}
    records.push({id,name,primary,aliases:'|'+[...aliases].filter(Boolean).join('|')+'|',
      latitude,longitude,code,cc,admin1,admin2,population:Number(pop)||0,
      region,county,country:countryInfo.name||'',iso3:countryInfo.iso3||''});
  }
  index={records};return index;
}
function matchScore(r,term,whole) {
  if(!term)return 0;
  const alias=r.aliases, key=r.primary;
  let score=0;
  if(key===term)score=1000;
  else if(alias.includes(`|${term}|`))score=975;
  else if(term.length>=2 && key.startsWith(term))score=760;
  else if(term.length>=2 && alias.includes(`|${term}`))score=720;
  else if(term.length>=3 && (` ${key}`).includes(` ${term}`))score=620;
  else if(term.length>=3 && whole && term.startsWith(key+' ')) {
    const context=normalize([r.region,r.county,r.country,r.cc,r.iso3].join(' '));
    if(context.includes(term.slice(key.length+1)))score=880;
  }
  if(!score)return 0;
  if(score>=950)score+=r.code.startsWith('PCL')?30:r.code==='ADM1'?20:r.code==='ADM2'?10:0;
  if(['PCLH','PPLH','PPLQ','PPLW'].includes(r.code))score-=120;
  score+=Math.min(35,Math.log10(r.population+1)*5);
  return score;
}
function searchOffline(query,limit=30) {
  const parts=query.split(',').map(normalize).filter(Boolean);
  const term=parts.shift()||'';if(!term)return [];
  const qualifiers=parts;
  const candidates=[];
  for(const r of load().records) {
    const score=matchScore(r,term,!qualifiers.length);if(!score)continue;
    if(qualifiers.length) {
      const ctx=normalize([r.region,r.county,r.country,r.cc,r.iso3].join(' '));
      if(!qualifiers.every(q=>ctx.includes(q) || (r.primary===q)))continue;
    }
    candidates.push({r,score});
  }
  candidates.sort((a,b)=>b.score-a.score || b.r.population-a.r.population || a.r.name.localeCompare(b.r.name));
  return candidates.slice(0,limit).map(({r,score})=>({name:r.name,region:r.code==='ADM1'?'':r.region,
    county:r.code==='ADM2'?'':r.county,country:r.code.startsWith('PCL')?'':r.country,country_code:r.cc,
    latitude:r.latitude,longitude:r.longitude,kind:kindOf(r.code),source:'GeoNames offline',_score:score,
    reference:'https://www.geonames.org/'+r.id}));
}
module.exports={normalize,kindOf,searchOffline};
