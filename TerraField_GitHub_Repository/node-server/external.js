'use strict';
// Fixed-host, keyless providers. Do not invent values when a provider is down.
const {performance} = require('node:perf_hooks');
const {broadTexture,pyRound,toNumber,SOIL_DEPTHS,soilDepthLabel} = require('./engine');
const {coverageUrl,readGeoTiffPoint} = require('./soil-wcs');
const {createGeocoder} = require('./geocode');
const SOIL_ENDPOINT = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const AIR_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const PROPERTIES = ['phh2o','clay','sand','silt','soc','nitrogen','cec','bdod'];
// Reject values with unknown units or implausible ranges instead of making a
// silent unit conversion or pretending that a missing value is zero. AQI has
// no 500 ceiling; extremely high values remain visible.
const WEATHER_FIELDS = Object.freeze({
  temperature_2m:{label:'Temperature',units:['°C'],min:-100,max:70},
  relative_humidity_2m:{label:'Relative humidity',units:['%'],min:0,max:100},
  precipitation:{label:'Precipitation',units:['mm'],min:0,max:10000},
  wind_speed_10m:{label:'Wind speed',units:['km/h'],min:0,max:1000},
  wind_direction_10m:{label:'Wind direction',units:['°'],min:0,max:360},
  wind_gusts_10m:{label:'Wind gust',units:['km/h'],min:0,max:1000}
});
const AIR_FIELDS = Object.freeze({
  us_aqi:{label:'US AQI',units:['USAQI'],min:0,max:1000000},
  pm2_5:{label:'PM2.5',units:['μg/m³','µg/m³'],min:0,max:1000000},
  pm10:{label:'PM10',units:['μg/m³','µg/m³'],min:0,max:1000000}
});
class ExternalError extends Error {
  constructor(message,status=502) { super(message); this.status=status; }
}
function validCoordinates(lat,lon) {
  lat=toNumber(lat); lon=toNumber(lon);
  if (lat===null || lon===null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new ExternalError('Enter a valid latitude (−90 to 90) and longitude (−180 to 180).',400);
  }
  return [pyRound(lat,6),pyRound(lon,6)];
}
function validDepth(depth) {
  if(depth===null || depth===undefined || depth==='') return '0-5cm';
  if(!SOIL_DEPTHS.includes(depth)) throw new ExternalError('Choose a supported SoilGrids depth.',400);
  return depth;
}
async function fetchBytes(url,timeout=18000,accept='image/tiff') {
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{
      Accept:accept,'User-Agent':'TerraField-Hackathon/1.0 (non-commercial prototype)'
    }});
    if(response.status===429) throw new ExternalError('The external provider is rate-limiting requests. Try again later.',429);
    if(!response.ok || !response.body) throw new Error('Provider unavailable');
    let size=0; const chunks=[];
    for await(const chunk of response.body) {
      size+=chunk.length;
      if(size>1_000_000) throw new ExternalError('The data provider returned an unexpectedly large response.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch(err) {
    if(err instanceof ExternalError) throw err;
    throw new ExternalError('The external data provider is unavailable. Try again later or enter values manually.',502);
  }
}
async function fetchJson(url,timeout=18000) {
  try { return JSON.parse((await fetchBytes(url,timeout,'application/json')).toString('utf8')); }
  catch(err) {
    if(err instanceof ExternalError) throw err;
    throw new ExternalError('The external data provider returned an unexpected response. Try again later or enter values manually.',502);
  }
}
function emptyValues() { return Object.fromEntries(PROPERTIES.map(p=>[p,null])); }
function noData() { return new ExternalError('No SoilGrids estimates at this point. Urban areas, water and other masked locations can be unavailable; try a nearby field.',404); }
function validMean(property,value) {
  if(value===null) return true;
  if(property==='phh2o') return value>=0 && value<=14;
  if(['clay','sand','silt'].includes(property)) return value>=0 && value<=100;
  return value>=0;
}
function parseSoil(body,depth) {
  const vals=emptyValues(),intervals=emptyValues();
  try {
    if(!Array.isArray(body?.properties?.layers)) throw new Error('Missing layers');
    for(const layer of body.properties.layers) {
      if(!layer || !Object.hasOwn(vals,layer.name)) continue;
      if(!Array.isArray(layer.depths)) throw new Error('Missing depths');
      const selected=layer.depths.find(d=>d?.label===depth) || (layer.depths.length===1 && !layer.depths[0]?.label?layer.depths[0]:null);
      if(!selected || !selected.values || typeof selected.values!=='object') throw new Error('Missing requested depth');
      const divisor=toNumber(layer.unit_measure?.d_factor), raw=selected.values;
      if([raw.mean,raw['Q0.05'],raw['Q0.95']].some(v=>v!=null) && (divisor===null || divisor<=0)) throw new Error('Invalid factor');
      if(raw.mean!=null) {
        const number=toNumber(raw.mean);
        if(number===null) throw new Error('Invalid mean');
        const converted=pyRound(number/divisor,2);
        if(!validMean(layer.name,converted)) throw new Error('Invalid mean');
        vals[layer.name]=converted;
      }
      const lo=toNumber(raw['Q0.05']),hi=toNumber(raw['Q0.95']);
      if(lo!==null && hi!==null && divisor!==null && divisor>0 && lo<=hi) {
        const lower=pyRound(lo/divisor,2),upper=pyRound(hi/divisor,2);
        if(validMean(layer.name,lower) && validMean(layer.name,upper)) intervals[layer.name]={lower,upper};
      }
    }
  } catch (_) {
    throw new ExternalError('SoilGrids returned an unexpected response. You can enter soil values manually.');
  }
  if(!Object.values(vals).some(v=>v!==null)) throw noData();
  return {vals,intervals};
}
function result(lat,lon,depth,values,intervals,method,extra='') {
  const isWcs=method==='wcs_fallback';
  return {latitude:lat,longitude:lon,values,intervals_90:intervals,texture_estimate:broadTexture(values),
    source:isWcs?'ISRIC SoilGrids 2.0 (official WCS fallback)':'ISRIC SoilGrids 2.0 (live REST predictions)',
    lookup_method:method,depth,depth_cm:soilDepthLabel(depth),resolution_m:250,
    source_url:'https://isric.org/explore/soilgrids',retrieved_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),
    notice:'Modelled point estimates, not field samples. Total nitrogen is not plant-available nitrogen; P and K are not provided.'+
      (isWcs?' The WCS fallback requests only pH, clay and sand; other properties and uncertainty intervals are unavailable in this fallback.':'')+extra};
}
// Open-Meteo returns an ISO local time without an offset. Preserve that local
// value and calculate UTC with the response's own numeric offset. A malformed
// clock/interval means the section is not safely interpretable at all.
function modelTime(body) {
  const local=body?.current?.time, offset=body?.utc_offset_seconds, zone=body?.timezone;
  if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local)) throw new Error('Invalid model time');
  if(typeof zone!=='string'||!zone.trim()||zone.length>100||!Number.isInteger(offset)||offset < -50400||offset > 50400) throw new Error('Invalid model timezone');
  const whole=local.length===16?`${local}:00`:local;
  const parsed=new Date(`${whole}Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,19)!==whole) throw new Error('Invalid model date');
  const epoch=parsed.getTime()-offset*1000;
  return {time:local,timezone:zone,utc_offset_seconds:offset,time_utc:new Date(epoch).toISOString()};
}
function parseCurrentModel(body,fields,retrievedAt,source,sourceUrl) {
  const current=body?.current, units=body?.current_units;
  if(!current||typeof current!=='object'||!units||typeof units!=='object'||units.time!=='iso8601'||units.interval!=='seconds') throw new Error('Missing current metadata');
  const interval=current.interval;
  if(!Number.isInteger(interval)||interval<1||interval>86400) throw new Error('Invalid model interval');
  const time=modelTime(body),values={},unitMap={},issues=[];
  let validCount=0;
  for(const [key,spec] of Object.entries(fields)) {
    const raw=current[key];
    unitMap[key]=spec.units[0];values[key]=null;
    if(raw===null||raw===undefined) {issues.push(`${spec.label}: not provided`);continue;}
    if(!spec.units.includes(units[key])) {issues.push(`${spec.label}: unexpected or missing unit`);continue;}
    if(typeof raw!=='number'||!Number.isFinite(raw)||raw<spec.min||raw>spec.max) {issues.push(`${spec.label}: invalid value`);continue;}
    values[key]=raw;validCount++;
  }
  if(!validCount) throw new Error('No usable values');
  const lat=body.latitude,lon=body.longitude;
  const coordsValid=typeof lat==='number'&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&typeof lon==='number'&&Number.isFinite(lon)&&lon>=-180&&lon<=180;
  if(!coordsValid)issues.push('Model grid coordinates not provided');
  return {status:issues.length?'partial':'ok',source,source_url:sourceUrl,...time,
    interval_seconds:interval,retrieved_at:retrievedAt,
    model_latitude:coordsValid?lat:null,model_longitude:coordsValid?lon:null,
    values,units:unitMap,issues};
}
function freshness(section,now,maxAgeSeconds) {
  if(section.status==='unavailable') return {...section,freshness:'unavailable',age_seconds:null};
  const age=Math.round((now-Date.parse(section.time_utc))/1000);
  const status=age < -300 ? 'future' : age > maxAgeSeconds ? 'stale' : 'recent';
  return {...section,freshness:status,age_seconds:age};
}

// The five/minute ISRIC fair-use limiter is process-local. We conservatively
// count BOTH REST and WCS requests, even failed ones. Multi-instance deployment
// would need a shared limiter. The fallback can return partial results.
function createAdapters({request=fetchJson,wcsRequest=fetchBytes,clock=()=>performance.now(),wallClock=()=>Date.now(),offlinePlaces}={}) {
  let calls=[];
  const places=createGeocoder({request,clock,...(offlinePlaces?{offline:offlinePlaces}:{})});
  const weatherCache=new Map(),pendingWeather=new Map();
  function takeToken() {
    const now=clock(); calls=calls.filter(t=>now-t<60000);
    if(calls.length>=5) return false;
    calls.push(now); return true;
  }
  async function fallback(lat,lon,depth) {
    if(Math.abs(lat)>89.997 || Math.abs(lon)>179.997) throw new ExternalError('The SoilGrids fallback is unavailable at this coordinate. Try again later or enter measured values manually.');
    const tasks=[];
    for(const property of ['phh2o','clay','sand']) {
      const url=coverageUrl(property,depth,lat,lon);
      if(!takeToken()) break;
      tasks.push({property,promise:wcsRequest(url,15000)});
    }
    if(!tasks.length) {
      throw new ExternalError('SoilGrids is unavailable or its fair-use limit was reached. Try again shortly or enter values manually.',429);
    }
    const outcomes=await Promise.allSettled(tasks.map(x=>x.promise));
    const vals=emptyValues(),intervals=emptyValues();let failures=0;
    for(let i=0;i<tasks.length;i++) {
      try {
        if(outcomes[i].status!=='fulfilled') throw outcomes[i].reason;
        const raw=readGeoTiffPoint(outcomes[i].value,lat,lon);
        if(raw!==null) {
          const value=pyRound(raw/10,2);
          if(!validMean(tasks[i].property,value)) throw new Error('Invalid WCS value');
          vals[tasks[i].property]=value;
        }
      } catch (_) { failures++; }
    }
    if(!Object.values(vals).some(v=>v!==null)) {
      if(failures || tasks.length<3) throw new ExternalError('SoilGrids live lookup is unavailable. Try again later, use a saved point or enter values manually.');
      throw noData();
    }
    const partial=failures || tasks.length<3 ? ' Some requested fallback layers could not be retrieved or were skipped to respect fair use.' : '';
    return result(lat,lon,depth,vals,intervals,'wcs_fallback',partial);
  }
  async function soil(lat,lon,depth='0-5cm') {
    [lat,lon]=validCoordinates(lat,lon);depth=validDepth(depth);
    if(!takeToken()) throw new ExternalError('SoilGrids fair-use limit reached (5 provider calls per minute). Try again shortly or use a sample point.',429);
    const params=new URLSearchParams({lon:String(lon),lat:String(lat),depth});
    for(const property of PROPERTIES) params.append('property',property);
    for(const value of ['mean','Q0.05','Q0.95']) params.append('value',value);
    try {
      const body=await request(`${SOIL_ENDPOINT}?${params}`,22000);
      const {vals,intervals}=parseSoil(body,depth);
      return result(lat,lon,depth,vals,intervals,'rest');
    } catch(err) {
      // A masked cell or explicit rate limit must not be presented as a valid
      // nearby result, and should not trigger extra requests to the provider.
      if(err instanceof ExternalError && (err.status===404 || err.status===429)) throw err;
      return fallback(lat,lon,depth);
    }
  }
  async function geocode(query) {
    if(typeof query!=='string' || !query.trim() || [...query.trim()].length>120 || !/[\p{L}\p{N}]/u.test(query)) throw new ExternalError('Enter a place name or coordinates, up to 120 characters.',400);
    const q=query.trim();
    // A pair supplied by the user is not attributed to a geocoding provider.
    const pair=q.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[,;]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/u);
    if(pair) {
      const [lat,lon]=validCoordinates(pair[1],pair[2]);
      return {results:[{name:`${lat}, ${lon}`,region:'',country:'',latitude:lat,longitude:lon,kind:'entered coordinates',source:'Coordinates you entered'}],
        source:'Coordinates you entered',search_status:'coordinates',providers:{},notice:'Coordinates are user-entered; check that they identify the intended field.'};
    }
    return places.search(q);
  }
  async function modelRequest(url,fields,source,sourceUrl) {
    try {
      const body=await request(url,12000);
      return parseCurrentModel(body,fields,new Date(wallClock()).toISOString(),source,sourceUrl);
    } catch(err) {
      return {status:'unavailable',source,source_url:sourceUrl,values:Object.fromEntries(Object.keys(fields).map(k=>[k,null])),
        units:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.units[0]])),
        issues:[err instanceof ExternalError&&err.status===429?'Provider rate limit reached. Try again later.':'Provider unavailable or response could not be validated. Try again later.'],
        provider_status:err instanceof ExternalError?err.status:null};
    }
  }
  function weatherResponse(data,cache) {
    const now=wallClock(),weather=freshness(data.weather,now,7200),air=freshness(data.air_quality,now,21600);
    // Top-level fields preserve the previous API for existing clients. They
    // remain null when weather is missing; air data never fills them.
    return {...data,weather,air_quality:air,cache,
      temperature:weather.values.temperature_2m,humidity:weather.values.relative_humidity_2m,
      time:weather.time||'',timezone:weather.timezone||''};
  }
  async function weather(lat,lon) {
    [lat,lon]=validCoordinates(lat,lon);
    const key=`${lat.toFixed(6)},${lon.toFixed(6)}`,cached=weatherCache.get(key);
    if(cached&&cached.expires>wallClock()) return weatherResponse(cached.data,'cached');
    if(cached)weatherCache.delete(key);
    let pending=pendingWeather.get(key);
    if(!pending) {
      pending=(async()=>{
        const coordinates={latitude:String(lat),longitude:String(lon),timezone:'auto'};
        const wp=new URLSearchParams({...coordinates,current:Object.keys(WEATHER_FIELDS).join(','),
          temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm'});
        const ap=new URLSearchParams({...coordinates,current:Object.keys(AIR_FIELDS).join(',')});
        // These are independent providers and model runs: one failed response
        // must not suppress valid results from the other.
        const [weather,air_quality]=await Promise.all([
          modelRequest(`${WEATHER_ENDPOINT}?${wp}`,WEATHER_FIELDS,'Open-Meteo weather forecast','https://open-meteo.com/en/docs'),
          modelRequest(`${AIR_ENDPOINT}?${ap}`,AIR_FIELDS,'Open-Meteo air quality / CAMS','https://open-meteo.com/en/docs/air-quality-api')
        ]);
        if(weather.status==='unavailable'&&air_quality.status==='unavailable') {
          const rateLimited=weather.provider_status===429&&air_quality.provider_status===429;
          throw new ExternalError('Open-Meteo weather and air quality are unavailable or could not be validated. Try again later; enter seasonal climate manually.',rateLimited?429:502);
        }
        const data={latitude:lat,longitude:lon,weather,air_quality,
          status:weather.status==='ok'&&air_quality.status==='ok'?'ok':'partial',source:'Open-Meteo model estimates',
          notice:'Model estimates, not on-site sensor measurements. Current conditions are not growing-season averages, and short-interval precipitation is not annual rainfall. Check local observations and forecasts.'};
        // Short, bounded process-local cache; partial failures retry sooner.
        if(weatherCache.size>=128)weatherCache.delete(weatherCache.keys().next().value);
        weatherCache.set(key,{data,expires:wallClock()+(data.status==='ok'?60000:15000)});
        return data;
      })();
      pendingWeather.set(key,pending);
    }
    try { return weatherResponse(await pending,'live'); }
    finally { if(pendingWeather.get(key)===pending)pendingWeather.delete(key); }
  }
  return {soil,geocode,weather};
}
module.exports={ExternalError,validCoordinates,validDepth,fetchJson,fetchBytes,parseSoil,modelTime,parseCurrentModel,WEATHER_FIELDS,AIR_FIELDS,createAdapters};
