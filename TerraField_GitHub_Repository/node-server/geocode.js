'use strict';
// Interactive, user-initiated place search only; no bulk queries or autocomplete.
// Open-Meteo uses GeoNames; Photon uses OpenStreetMap. Both public services may
// be unavailable. The included GeoNames subset remains searchable offline.
const {performance}=require('node:perf_hooks');
const {normalize,searchOffline}=require('./place-index');
const PHOTON='https://photon.komoot.io/api/';
const METEO='https://geocoding-api.open-meteo.com/v1/search';

function numericPoint(lat,lon) {
  if(typeof lat==='boolean' || typeof lon==='boolean' || lat===null || lon===null || lat==='' || lon==='')return null;
  const a=Number(lat),b=Number(lon);
  return Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180?[a,b]:null;
}
function labelKind(type,osmValue='') {
  const t=String(osmValue||type||'').toLowerCase();
  if(['country','pcli','pcld','pclix'].includes(t))return 'country';
  if(['state','region','province','adm1'].includes(t))return 'region';
  if(['county','district','borough','adm2'].includes(t))return 'district';
  if(['city','town','village','hamlet','municipality','ppl','ppla','ppla2','ppla3','ppla4','pplc'].includes(t))return 'city / town / village';
  if(['house','building','street','road'].includes(t))return 'address / feature';
  return 'place';
}
function parsePhoton(data) {
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Invalid Photon response');
  const results=[];
  for(const f of data.features) {
    if(f?.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates))continue;
    const [lon,lat]=f.geometry.coordinates,point=numericPoint(lat,lon),p=f.properties||{};
    const name=typeof p.name==='string'&&p.name.trim()?p.name.trim():typeof p.street==='string'?p.street.trim():typeof p.city==='string'?p.city.trim():'';
    if(!point||!name)continue;
    const string=k=>typeof p[k]==='string'?p[k]:'';
    results.push({name,region:string('state'),county:string('county')||string('district')||(string('city')!==name?string('city'):''),
      country:string('country')===name?'':string('country'),country_code:string('countrycode').toUpperCase(),
      latitude:point[0],longitude:point[1],kind:labelKind(p.type,p.osm_key==='place'?p.osm_value:''),source:'OpenStreetMap via Photon'});
  }
  return results;
}
function parseMeteo(data) {
  if(!data || typeof data!=='object' || (data.results!==undefined&&!Array.isArray(data.results)))throw new Error('Invalid Open-Meteo response');
  const results=[];
  for(const r of data.results||[]) {
    const point=numericPoint(r?.latitude,r?.longitude);
    if(typeof r?.name!=='string'||!r.name.trim()||!point)continue;
    const str=k=>typeof r[k]==='string'?r[k]:'';
    results.push({name:r.name,region:str('admin1'),county:str('admin2'),country:str('country'),country_code:str('country_code').toUpperCase(),
      latitude:point[0],longitude:point[1],kind:labelKind(r.feature_code),source:'GeoNames via Open-Meteo',population:Number(r.population)||0});
  }
  return results;
}
function family(kind) {
  if(kind==='country')return 'country';
  if(kind==='region')return 'region';
  if(kind==='district')return 'district';
  if(kind==='capital'||kind.includes('city')||kind.includes('town')||kind.includes('village'))return 'settlement';
  return kind;
}
function scoreOnline(r,query,position) {
  const term=normalize(query.split(',')[0]),name=normalize(r.name);
  let score=name===term?1000:name.startsWith(term)?760:720;
  if(name===term)score+=r.kind==='country'?30:r.kind==='region'?20:r.kind==='district'?10:0;
  if(r.kind==='address / feature')score-=170;
  // Prefer the current OSM place result over an older offline exact-name
  // snapshot when both are available; still expose distinct coordinates.
  else if(r.source==='OpenStreetMap via Photon')score+=40;
  score+=Math.min(35,Math.log10((r.population||0)+1)*5);
  return score-Math.min(position,30)*0.5;
}
function mergeResults(groups,query,limit=30) {
  const candidates=[];
  for(const group of groups) for(let i=0;i<group.length;i++) {
    const x=group[i],point=numericPoint(x?.latitude,x?.longitude);
    if(!point||typeof x.name!=='string'||!x.name.trim())continue;
    const kind=typeof x.kind==='string'?x.kind:'place';
    const score=typeof x._score==='number'?x._score:scoreOnline({...x,kind},query,i);
    candidates.push({...x,latitude:point[0],longitude:point[1],kind,_score:score});
  }
  candidates.sort((a,b)=>b._score-a._score);
  const unique=[];
  for(const item of candidates) {
    const name=normalize(item.name),cc=String(item.country_code||'').toUpperCase();
    const dupe=unique.find(existing=>{
      if(normalize(existing.name)!==name || family(existing.kind)!==family(item.kind))return false;
      const other=String(existing.country_code||'').toUpperCase();
      if(cc&&other&&cc!==other)return false;
      const dlon=Math.abs(existing.longitude-item.longitude);
      return Math.abs(existing.latitude-item.latitude)<.03 && Math.min(dlon,360-dlon)<.03;
    });
    if(dupe) {
      dupe.also_sources=[...new Set([...(dupe.also_sources||[]),item.source])].filter(s=>s&&s!==dupe.source);
      continue;
    }
    const {_score,population,...clean}=item;unique.push(clean);
    if(unique.length>=limit)break;
  }
  return unique;
}
function createGeocoder({request,clock=()=>performance.now(),offline=searchOffline}={}) {
  if(typeof request!=='function')throw new TypeError('A JSON request function is required');
  const cache=new Map(),pending=new Map();
  const lastCall={photon:-Infinity,openmeteo:-Infinity};
  async function provider(name,url,parse) {
    const now=clock();
    // Public geocoders are shared services. Skip bursts rather than queueing
    // bulk requests. A multi-user hosted app would need a shared limiter.
    if(now-lastCall[name]<1100)return {state:'throttled',results:[]};
    lastCall[name]=now;
    try{return {state:'available',results:parse(await request(url,6500))};}
    catch(_){return {state:'unavailable',results:[]};}
  }
  async function run(query) {
    let local=[],offlineState='available';
    try{local=offline(query,40);}catch(_){offlineState='unavailable';}
    const p=new URLSearchParams({q:query,limit:'25',lang:'en'});
    const m=new URLSearchParams({name:query,count:'30',language:'en',format:'json'});
    const photon=provider('photon',`${PHOTON}?${p}`,parsePhoton);
    // Open-Meteo does not return one-character searches; Photon/offline may.
    const meteo=[...query].length>=2?provider('openmeteo',`${METEO}?${m}`,parseMeteo):Promise.resolve({state:'not_supported',results:[]});
    const [a,b]=await Promise.all([photon,meteo]);
    const ok=[a,b].filter(x=>x.state==='available').length;
    const results=mergeResults([local,a.results,b.results],query);
    let status=ok===0?'offline':a.state==='available'&&(b.state==='available'||b.state==='not_supported')?'online':'partial';
    if(offlineState!=='available' && status==='online')status='partial';
    return {results,source:'GeoNames offline; OpenStreetMap via Photon; Open-Meteo',search_status:status,
      providers:{offline:offlineState,photon:a.state,open_meteo:b.state},
      notice:'Place coordinates are reference points and can be approximate. Select the actual field before requesting soil data.'};
  }
  async function search(query) {
    const key=normalize(query),now=clock(),found=cache.get(key);
    if(found&&found.expires>now)return {...found.data,cache:'cached'};
    if(pending.has(key))return pending.get(key);
    const job=(async()=>{
      const data=await run(query);
      // Partial/offline results are retried soon; empty online responses are
      // not presented as complete coverage and are cached only briefly.
      const ttl=data.search_status==='online' && data.results.length?24*60*60*1000:30*1000;
      if(cache.size>=200)cache.delete(cache.keys().next().value);
      cache.set(key,{data,expires:clock()+ttl});
      return {...data,cache:'live'};
    })();
    pending.set(key,job);
    try{return await job;}finally{if(pending.get(key)===job)pending.delete(key);}
  }
  return {search};
}
module.exports={numericPoint,labelKind,parsePhoton,parseMeteo,mergeResults,createGeocoder};
