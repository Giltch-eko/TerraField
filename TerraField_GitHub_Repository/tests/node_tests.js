'use strict';
// Offline regression suite for the Node-only Windows edition. Run:
// node --test tests/node_tests.js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync,rmSync} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const engine = require('../node-server/engine');
const external = require('../node-server/external');
const {createApp} = require('../node-server/app');

const sample=()=>structuredClone(engine.EXAMPLES[0].profile);
const profileFor=changes=>Object.assign(sample(),changes);
const expected={
  monsoon:[['Arabica coffee',100],['Rice',100],['Sugarcane',100]],
  'cool-loam':[['Barley',100],['Canola',100],['Chickpea',100]],
  dryland:[['Pearl millet',100],['Sorghum',96],['Cowpea',94]],
  'acid-highland':[['Maize',97],['Potato',96],['Common bean',93]],
  'warm-heavy':[['Cotton',100],['Cowpea',96],['Okra',95]]
};

test('five example profiles return expected rankings',()=>{
  for(const item of engine.EXAMPLES) {
    const result=engine.calculate(item.profile);
    assert.deepEqual(result.rankings.slice(0,3).map(x=>[x.name,x.score]),expected[item.id]);
    assert.equal(result.profile.illustrative,true);
  }
});
test('Python-compatible tie-to-even rounding and interpolation',()=>{
  for(const [n,d,want] of [[2.5,0,2],[3.5,0,4],[-2.5,0,-2],[2.675,2,2.67],[1.235,2,1.24]]) assert.equal(engine.pyRound(n,d),want);
  const band={optimal:[10,20],absolute:[0,30]};
  assert.deepEqual(engine.rangeScore(15,band),[1,false]);
  assert.deepEqual(engine.rangeScore(5,band),[.5,false]);
  assert.deepEqual(engine.rangeScore(25,band),[.5,false]);
  assert.deepEqual(engine.rangeScore(31,band),[0,true]);
});
test('validates required, finite, boolean, enumerated and paired inputs',()=>{
  assert.throws(()=>engine.validateProfile({soil_type:'bogus',season:'wet',ph:NaN,rainfall:-1,temperature:true}),err=>{
    assert.ok(['soil_type','ph','rainfall','temperature'].every(k=>Object.hasOwn(err.fields,k)));return true;
  });
  for(const val of [null,'',-1,14.1,'not-a-number',Infinity,true,{},[]]) assert.throws(()=>engine.validateProfile(profileFor({ph:val})),engine.ValidationError);
  for(const val of ['__proto__',[],{},null]) assert.throws(()=>engine.validateProfile(profileFor({soil_type:val})),engine.ValidationError);
  assert.throws(()=>engine.validateProfile(profileFor({latitude:17})),engine.ValidationError);
  assert.throws(()=>engine.validateProfile(profileFor({latitude:17,longitude:181})),engine.ValidationError);
  assert.equal(engine.validateProfile(profileFor({latitude:'17.1234567',longitude:'78'})).latitude,17.123457);
});
test('optional nutrients do not change scores; missing humidity and season renormalize',()=>{
  const original=engine.calculate(sample());
  const result=engine.calculate(profileFor({nitrogen:35,phosphorus:20,potassium:120}));
  assert.deepEqual(original.rankings.map(x=>[x.id,x.score]),result.rankings.map(x=>[x.id,x.score]));
  assert.equal(result.profile.potassium,120);assert.match(result.missing_information.join(' '),/not scored/);
  const noOptional=engine.calculate(profileFor({humidity:null,season:'unknown'}));
  const maize=noOptional.rankings.find(x=>x.id==='maize');
  assert.equal(maize.weighted_factors_used,80);assert.deepEqual(maize.missing_crop_data,['texture']);
  assert.match(noOptional.missing_information.join(' '),/excluded/);
});
test('absolute cap, texture, and conservative provenance warnings',()=>{
  const rice=engine.calculate(profileFor({ph:13,temperature:27,rainfall:1700})).rankings.find(x=>x.id==='rice');
  assert.equal(rice.capped,true);assert.ok(rice.score<=50);
  assert.equal(rice.factors.find(x=>x.key==='ph').outside_absolute,true);
  assert.equal(engine.broadTexture({clay:45,sand:30}),'clayey');
  assert.equal(engine.broadTexture({clay:10,sand:75}),'sandy');
  assert.equal(engine.broadTexture({clay:25,sand:40}),'loamy');
  assert.equal(engine.broadTexture({clay:null,sand:40}),null);
  const result=engine.calculate(profileFor({source:'soilgrids_snapshot',illustrative:true,weather_source:'open_meteo_current',weather_time:'2026-10-28T12:00'}));
  for(const word of ['illustrative','SoilGrids','Open-Meteo']) assert.match(result.missing_information.join(' '),new RegExp(word));
});
test('global snapshots have unique coordinates, source, units and valid soil properties',()=>{
  assert.equal(engine.REGIONS.length,12);
  assert.equal(new Set(engine.REGIONS.map(point=>point.country)).size,12);
  assert.deepEqual([...new Set(engine.REGIONS.map(point=>point.continent))].sort(),['Africa','Asia','Europe','North America','Oceania','South America']);
  const ids=new Set();
  for(const point of engine.REGIONS) {
    assert.ok(!ids.has(point.id));ids.add(point.id);
    assert.ok(point.latitude>=-90 && point.latitude<=90 && point.longitude>=-180 && point.longitude<=180);
    assert.equal(point.depth_cm,'0–5');assert.equal(point.resolution_m,250);
    assert.match(point.source,/SoilGrids/);assert.match(point.source_url,/isric\.org/);
    assert.ok(Number.isFinite(Date.parse(point.retrieved_at)));
    assert.ok(Number.isFinite(point.values.phh2o) && point.values.phh2o>=0 && point.values.phh2o<=14);
    for(const key of ['sand','silt','clay']) if(point.values[key]!==null) assert.ok(Number.isFinite(point.values[key]) && point.values[key]>=0 && point.values[key]<=100);
  }
});
test('adapter converts ISRIC factors; null values stay null',async()=>{
  const layer=(name,mean,divisor)=>({name,unit_measure:{d_factor:divisor},depths:[{values:{mean}}]});
  const request=async()=>({properties:{layers:[layer('phh2o',74,10),layer('sand',372,10),layer('clay',369,10),layer('nitrogen',183,100),layer('soc',141,10)]}});
  const result=await external.createAdapters({request}).soil(17.68,78.18);
  assert.equal(result.values.phh2o,7.4);assert.equal(result.values.nitrogen,1.83);
  assert.equal(result.values.cec,null);assert.equal(result.texture_estimate,'loamy');assert.match(result.notice,/not plant-available/);
});
test('adapter handles missing data and enforces fair-use limit',async()=>{
  const empty=external.createAdapters({request:async()=>({properties:{layers:[{name:'phh2o',unit_measure:{d_factor:10},depths:[{values:{mean:null}}]}]}})});
  await assert.rejects(()=>empty.soil(17,78),err=>err.status===404);
  let now=0;
  const valid=external.createAdapters({clock:()=>now,request:async()=>({properties:{layers:[{name:'phh2o',unit_measure:{d_factor:10},depths:[{values:{mean:65}}]}]}})});
  for(let i=0;i<5;i++) await valid.soil(17,78);
  await assert.rejects(()=>valid.soil(17,78),err=>err.status===429);
  now=60001;assert.equal((await valid.soil(17,78)).values.phh2o,6.5);
});
function mockWeather() {return {
  latitude:17.4,longitude:78.45,timezone:'Asia/Kolkata',utc_offset_seconds:19800,
  current_units:{time:'iso8601',interval:'seconds',temperature_2m:'°C',relative_humidity_2m:'%',precipitation:'mm',wind_speed_10m:'km/h',wind_direction_10m:'°',wind_gusts_10m:'km/h'},
  current:{time:'2026-10-29T19:15',interval:900,temperature_2m:26.7,relative_humidity_2m:63,precipitation:0,wind_speed_10m:4,wind_direction_10m:360,wind_gusts_10m:11.2}
};}
function mockAir() {return {
  latitude:17.4,longitude:78.5,timezone:'Asia/Kolkata',utc_offset_seconds:19800,
  current_units:{time:'iso8601',interval:'seconds',us_aqi:'USAQI',pm2_5:'μg/m³',pm10:'μg/m³'},
  current:{time:'2026-10-29T18:30',interval:3600,us_aqi:59,pm2_5:16.2,pm10:16.3}
};}
const weatherNow=Date.parse('2026-10-29T13:46:00Z');
const weatherProvider=(weather=mockWeather(),air=mockAir())=>async url=>url.includes('air-quality-api')?structuredClone(air):structuredClone(weather);

test('weather and air preserve independent units, grid points, time zones and intervals',async()=>{
  const urls=[];const request=async url=>{urls.push(url);return weatherProvider()(url);};
  const a=external.createAdapters({request,wallClock:()=>weatherNow});
  const w=await a.weather(17.385,78.4867);
  assert.equal(w.status,'ok');assert.equal(w.temperature,26.7);assert.equal(w.humidity,63);
  assert.equal(w.weather.values.precipitation,0);assert.equal(w.weather.values.wind_direction_10m,360);
  assert.equal(w.weather.interval_seconds,900);assert.equal(w.air_quality.interval_seconds,3600);
  assert.equal(w.weather.time_utc,'2026-10-29T13:45:00.000Z');assert.equal(w.air_quality.time_utc,'2026-10-29T13:00:00.000Z');
  assert.equal(w.weather.model_longitude,78.45);assert.equal(w.air_quality.model_longitude,78.5);
  assert.equal(w.weather.freshness,'recent');assert.equal(w.air_quality.age_seconds,2760);
  assert.equal(w.weather.units.precipitation,'mm');assert.equal(w.air_quality.units.pm2_5,'μg/m³');
  assert.match(w.notice,/not growing-season averages/);assert.equal(w.rainfall,undefined);
  assert.equal(urls.length,2);const forecast=new URL(urls.find(x=>x.includes('/v1/forecast'))),air=new URL(urls.find(x=>x.includes('/v1/air-quality')));
  assert.equal(forecast.searchParams.get('precipitation_unit'),'mm');assert.match(forecast.searchParams.get('current'),/wind_gusts_10m/);
  assert.match(air.searchParams.get('current'),/us_aqi,pm2_5,pm10/);
  for(const [lat,lon] of [[null,1],[91,2],[1,181],['nan',2],[true,3]]) assert.throws(()=>external.validCoordinates(lat,lon),err=>err.status===400);
});
test('partial model outages preserve the other feed and never fabricate missing values',async()=>{
  const failWeather=external.createAdapters({wallClock:()=>weatherNow,request:async url=>{
    if(url.includes('/v1/forecast'))throw new Error('weather offline');return mockAir();}});
  let w=await failWeather.weather(17,78);
  assert.equal(w.status,'partial');assert.equal(w.weather.status,'unavailable');assert.equal(w.temperature,null);
  assert.equal(w.air_quality.values.us_aqi,59);assert.equal(w.air_quality.status,'ok');
  const badAir=mockAir();badAir.current.us_aqi=760;badAir.current.pm2_5=-1;badAir.current_units.pm10='mg/m³';
  const partial=external.createAdapters({wallClock:()=>weatherNow,request:weatherProvider(mockWeather(),badAir)});
  w=await partial.weather(17,78);assert.equal(w.air_quality.status,'partial');assert.equal(w.air_quality.values.us_aqi,760);
  assert.equal(w.air_quality.values.pm2_5,null);assert.equal(w.air_quality.values.pm10,null);
  assert.match(w.air_quality.issues.join(' '),/invalid value/);assert.match(w.air_quality.issues.join(' '),/unexpected/);
  const badWeather=mockWeather();badWeather.current.temperature_2m=null;badWeather.current.relative_humidity_2m=101;badWeather.current.precipitation=-.1;
  w=await external.createAdapters({wallClock:()=>weatherNow,request:weatherProvider(badWeather,mockAir())}).weather(17,78);
  assert.equal(w.weather.status,'partial');assert.equal(w.temperature,null);assert.equal(w.humidity,null);assert.equal(w.weather.values.precipitation,null);
  assert.equal(w.weather.values.wind_speed_10m,4);assert.equal(w.air_quality.values.us_aqi,59);
  await assert.rejects(()=>external.createAdapters({request:async()=>{throw new Error('offline');}}).weather(17,78),err=>err.status===502);
  await assert.rejects(()=>external.createAdapters({request:async()=>{throw new external.ExternalError('limited',429);}}).weather(17,78),err=>err.status===429);
});
test('malformed timestamps, intervals or unknown units cannot masquerade as valid weather',async()=>{
  for(const change of [
    x=>x.current.time='2026-02-30T12:00',x=>x.current.time='not-a-date',
    x=>x.current.interval=0,x=>x.utc_offset_seconds=99999,x=>x.current_units.time='bogus'
  ]) {
    const bad=mockWeather();change(bad);
    const a=external.createAdapters({wallClock:()=>weatherNow,request:weatherProvider(bad,mockAir())});
    const result=await a.weather(17,78);assert.equal(result.weather.status,'unavailable');assert.equal(result.air_quality.status,'ok');
  }
  const bad=mockWeather();bad.current_units.temperature_2m='°F';bad.current.wind_speed_10m=Infinity;bad.current_units.relative_humidity_2m=null;
  const w=await external.createAdapters({wallClock:()=>weatherNow,request:weatherProvider(bad,mockAir())}).weather(17,78);
  assert.equal(w.weather.status,'partial');assert.equal(w.temperature,null);assert.equal(w.humidity,null);assert.equal(w.weather.values.wind_speed_10m,null);
  assert.ok(w.weather.issues.length>=3);
});
test('freshness marks stale and future times; simultaneous requests coalesce and cache expires',async()=>{
  let now=weatherNow,calls=0;
  const request=async url=>{calls++;await new Promise(r=>setTimeout(r,5));return weatherProvider()(url);};
  const a=external.createAdapters({request,wallClock:()=>now});
  const [a1,a2]=await Promise.all([a.weather(17,78),a.weather(17,78)]);
  assert.equal(calls,2);assert.equal(a1.cache,'live');assert.equal(a2.cache,'live');
  assert.equal((await a.weather(17,78)).cache,'cached');assert.equal(calls,2);
  now+=61000;assert.equal((await a.weather(17,78)).cache,'live');assert.equal(calls,4);
  now=weatherNow+7*3600*1000;let w=await a.weather(17,78);assert.equal(w.weather.freshness,'stale');assert.equal(w.air_quality.freshness,'stale');
  now=weatherNow-20*60*1000;const future=external.createAdapters({wallClock:()=>now,request:weatherProvider()});w=await future.weather(17,78);
  assert.equal(w.weather.freshness,'future');assert.equal(w.air_quality.freshness,'recent');
});

test('partial weather cache retries promptly and recovers the missing feed',async()=>{
  let now=weatherNow,calls=0,airOnline=false;
  const adapter=external.createAdapters({wallClock:()=>now,request:async url=>{
    calls++;
    if(url.includes('air-quality-api')) {if(!airOnline)throw new Error('air offline');return mockAir();}
    return mockWeather();
  }});
  let result=await adapter.weather(17,78);assert.equal(result.status,'partial');assert.equal(calls,2);
  airOnline=true;now+=14000;result=await adapter.weather(17,78);assert.equal(result.cache,'cached');assert.equal(result.air_quality.status,'unavailable');assert.equal(calls,2);
  now+=1001;result=await adapter.weather(17,78);assert.equal(result.status,'ok');assert.equal(result.air_quality.values.us_aqi,59);assert.equal(calls,4);
});
test('useful plant reference is sourced, filtered, distinct from the 21 scored crops',()=>{
  const {metadata,plants}=require('../server/data/plant-library.json');
  assert.equal(plants.length,2302);assert.equal(metadata.count,plants.length);assert.equal(metadata.tree_count,1057);
  assert.equal(metadata.default_count,2173);assert.equal(metadata.default_tree_count,1016);assert.equal(metadata.source_weed_with_use_count,129);
  assert.deepEqual(metadata.exclusions,{source_records:2568,weed_environment_only:1,no_documented_use:260,poison_only:5,category_only:1});
  assert.equal(metadata.scored_count,engine.CROPS.length);assert.match(metadata.license,/CC BY/);
  assert.equal(new Set(plants.map(p=>p.ecocrop_id)).size,plants.length);
  for(const p of plants) {
    assert.ok(p.name&&p.scientific_name&&p.purposes.length&&p.uses.length,`${p.id} lacks documented use`);
    assert.doesNotMatch(p.name,/[<>]/,`${p.id} displays source markup as a common name`);
    assert.equal(p.source_weed_label,p.categories.some(c=>c.toLowerCase()==='weed'));
    if(p.source_weed_label)assert.ok(p.purposes.some(k=>['food','feed','materials','fuel','medicine'].includes(k)),`${p.id} lacks a direct documented use`);
    assert.match(p.source_url,/^https:\/\/ecocrop\.apps\.fao\.org\/ecocrop\/srv\/en\/dataSheet\?id=\d+$/);
    assert.ok(['use_table','crop_category'].includes(p.evidence));
    for(const value of Object.values(p.ranges)) if(value) {
      assert.ok(value.absolute[0]<=value.optimal[0]&&value.optimal[0]<=value.optimal[1]&&value.optimal[1]<=value.absolute[1]);
    }
  }
  const screened=plants.filter(p=>p.screened_crop_id);
  assert.deepEqual(new Set(screened.map(p=>p.screened_crop_id)),new Set(engine.CROPS.map(c=>c.id)));
  assert.ok(plants.find(p=>p.scientific_name==='Mangifera indica'&&p.life_forms.includes('tree')&&p.purposes.includes('food')));
  assert.ok(plants.find(p=>p.scientific_name==='Tectona grandis'&&p.life_forms.includes('tree')&&p.purposes.includes('materials')));
  assert.ok(plants.find(p=>p.scientific_name==='Passiflora edulis'&&p.evidence==='crop_category'));
  assert.equal(plants.find(p=>p.scientific_name==='Myristica fragrans').name,'nutmeg');
  assert.ok(!plants.some(p=>p.scientific_name==='Chromolaena odorata'));
  assert.ok(plants.some(p=>p.scientific_name==='Ocimum basilicum'&&p.source_weed_label&&p.purposes.includes('food')));
  assert.ok(plants.some(p=>p.scientific_name==='Psidium guajava'&&p.source_weed_label&&p.purposes.includes('food')));
  assert.equal(plants.filter(p=>!p.source_weed_label).length,metadata.default_count);
});
test('plant library can be rebuilt byte-for-byte from pinned, checksummed sources without Python',()=>{
  const root=path.join(__dirname,'..');
  const out=spawnSync(process.execPath,[path.join(root,'tools','build-plant-library.js'),'--check'],{cwd:root,encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(out.status,0,`${out.stdout}\n${out.stderr}`);assert.match(out.stdout,/Verified 2302 records/);
});

const quiet={log(){},error(){}};
async function start(dbPath,adapters) {
  const app=createApp({dbPath,adapters,logger:quiet});
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function req(method,endpoint,{body,key,contentType='application/json'}={}) {
    const headers={};let input;
    if(body!==undefined) {input=typeof body==='string'?body:JSON.stringify(body);headers['Content-Type']=contentType;}
    if(key) headers['X-Workspace-Key']=key;
    const r=await fetch(base+endpoint,{method,headers,body:input});
    const text=await r.text();let result=null;
    if(text) {try{result=JSON.parse(text);}catch(_){result=text;}}
    return {status:r.status,headers:r.headers,body:result};
  }
  async function close() { app.server.closeAllConnections();await new Promise((resolve,reject)=>app.server.close(err=>err?reject(err):resolve())); }
  return {req,close,db:app.db};
}
test('REST weather serves independently validated partial data with no annual rainfall',async()=>{
  const adapters=external.createAdapters({wallClock:()=>weatherNow,request:async url=>{
    if(url.includes('air-quality-api'))throw new external.ExternalError('limited',429);return mockWeather();
  }});
  const app=await start(':memory:',adapters);
  try {
    const r=await app.req('GET','/api/weather?lat=17.385&lon=78.4867');
    assert.equal(r.status,200);assert.equal(r.body.status,'partial');assert.equal(r.body.weather.values.precipitation,0);
    assert.equal(r.body.weather.interval_seconds,900);assert.equal(r.body.air_quality.status,'unavailable');
    assert.equal(r.body.air_quality.values.pm2_5,null);assert.equal(r.body.rainfall,undefined);
    assert.match(r.body.air_quality.issues[0],/rate limit/);
  } finally {await app.close();}
});

test('health, reference endpoints, static assets, methods, and malformed requests',async()=>{
  const app=await start(':memory:');
  try {
    let r=await app.req('GET','/api/health');assert.equal(r.status,200);assert.equal(r.body.database,'sqlite');assert.equal(r.body.crop_count,21);assert.equal(r.body.plant_reference_count,2302);
    r=await app.req('GET','/api/plants');assert.equal(r.status,200);assert.equal(r.body.plants.length,2302);assert.equal(r.body.metadata.scored_count,21);
    assert.equal((await app.req('POST','/api/plants',{body:{}})).status,405);
    assert.equal((await app.req('GET','/api/examples')).body.examples.length,5);
    const regions=(await app.req('GET','/api/regions')).body.regions;
    assert.equal(regions.length,engine.REGIONS.length);assert.ok(regions.length>=5);
    r=await app.req('GET','/');assert.equal(r.status,200);assert.match(r.body,/TerraField/);assert.match(r.headers.get('content-security-policy'),/default-src 'self'/);
    assert.equal((await app.req('GET','/%2e%2e/server/app.py')).status,404);
    assert.equal((await app.req('GET','/api/recommendations')).status,405);
    assert.equal((await app.req('GET','/api/not-found')).status,404);
    assert.equal((await app.req('GET','/api/soil?lat=100&lon=0')).status,400);
    assert.equal((await app.req('GET','/api/weather?lat=x&lon=0')).status,400);
    assert.equal((await app.req('GET','/api/location/search?q=')).status,400);
    assert.equal((await app.req('POST','/api/recommendations',{body:'bad-json'})).status,400);
    assert.equal((await app.req('POST','/api/recommendations',{body:'{}',contentType:'text/plain'})).status,415);
    assert.equal((await app.req('POST','/api/recommendations',{body:'x'.repeat(33000)})).status,413);
    assert.equal((await app.req('POST','/api/recommendations',{body:{profile:{}}})).status,422);
    r=await app.req('POST','/api/recommendations',{body:{profile:sample()}});
    assert.equal(r.status,200);assert.equal(r.body.rankings[0].name,'Arabica coffee');
  } finally {await app.close();}
});
test('report CRUD, owner isolation, recomputation, and real restart persistence',async()=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'terra-node-test-')), db=path.join(tmp,'reports.sqlite');
  const key='a'.repeat(64), other='b'.repeat(64);let app=await start(db), id;
  try {
    assert.equal((await app.req('GET','/api/reports')).status,401);
    assert.equal((await app.req('POST','/api/reports',{key,body:{profile:sample(),title:'  '}})).status,422);
    let r=await app.req('POST','/api/reports',{key,body:{profile:engine.EXAMPLES[1].profile,title:'Test field',result:{rankings:[{name:'fake'}]}}});
    assert.equal(r.status,201);id=r.body.id;assert.equal(r.body.result.rankings[0].name,'Barley');
    assert.equal((await app.req('GET','/api/reports',{key})).body.reports.length,1);
    assert.equal((await app.req('GET','/api/reports',{key:other})).body.reports.length,0);
    assert.equal((await app.req('GET','/api/reports/'+id,{key:other})).status,404);
    assert.equal((await app.req('PATCH','/api/reports/'+id,{key,body:{title:'New name'}})).status,200);
    await app.close();app=await start(db);
    r=await app.req('GET','/api/reports/'+id,{key});assert.equal(r.body.title,'New name');
    assert.equal((await app.req('DELETE','/api/reports/'+id,{key:other})).status,404);
    assert.equal((await app.req('DELETE','/api/reports/'+id,{key})).status,204);
    assert.equal((await app.req('GET','/api/reports/'+id,{key})).status,404);
  } finally {await app.close();rmSync(tmp,{recursive:true,force:true});}
});
test('successful soil results use SQLite cache',async()=>{
  let count=0;
  const adapters={
    soil:async(lat,lon)=>{count++;return {latitude:lat,longitude:lon,values:{phh2o:7.4}};},
    geocode:async()=>({results:[]}),weather:async()=>({})
  };
  const app=await start(':memory:',adapters);
  try {
    let r=await app.req('GET','/api/soil?lat=17.68&lon=78.18');assert.equal(r.body.cache,'live');
    r=await app.req('GET','/api/soil?lat=17.68&lon=78.18');assert.equal(r.body.cache,'cached');assert.equal(count,1);
  } finally {await app.close();}
});
test('launcher rejects invalid port with a helpful message',()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'..','node-server','app.js')],{
    env:{...process.env,TERRAFIELD_PORT:'abc',TERRAFIELD_NO_BROWSER:'1'},encoding:'utf8',timeout:5000
  });
  assert.equal(result.status,1);assert.match(result.stderr,/whole number between 1 and 65535/);
});

test('all six soil depths are validated and survive report provenance',()=>{
  for(const depth of ['0-5cm','5-15cm','15-30cm','30-60cm','60-100cm','100-200cm']) {
    assert.equal(external.validDepth(depth),depth);
    const p=profileFor({source:'soilgrids_live',soil_depth:depth});
    const r=engine.calculate(p);
    assert.equal(r.profile.soil_depth,depth);
    assert.match(r.missing_information.join(' '),new RegExp(depth.replace('cm','').replace('-','–')+' cm'));
    assert.match(r.missing_information.join(' '),/uncertainty intervals are not used/);
  }
  assert.equal(external.validDepth(null),'0-5cm');
  assert.throws(()=>external.validDepth('5-10cm'),err=>err.status===400);
  assert.throws(()=>engine.validateProfile(profileFor({source:'soilgrids_live',soil_depth:'0-10cm'})),engine.ValidationError);
  assert.equal(engine.validateProfile(profileFor({source:'soilgrids_live'})).soil_depth,'0-5cm');
  assert.equal(engine.validateProfile(profileFor({source:'manual'})).soil_depth,'');
});

test('REST queries request verified mean and 5th/95th quantiles with correct per-property units',async()=>{
  let received;
  const layer=(name,mean,low,high,divisor)=>({name,unit_measure:{d_factor:divisor},depths:[{label:'15-30cm',values:{mean,'Q0.05':low,'Q0.95':high}}]});
  const request=async url=>{
    received=new URL(url);
    return {properties:{layers:[layer('phh2o',74,56,88,10),layer('nitrogen',183,50,500,100),layer('sand',372,112,730,10),layer('clay',369,null,793,10)]}};
  };
  const s=await external.createAdapters({request}).soil(17.68,78.18,'15-30cm');
  assert.equal(received.searchParams.get('depth'),'15-30cm');
  assert.deepEqual(received.searchParams.getAll('value'),['mean','Q0.05','Q0.95']);
  assert.equal(received.searchParams.getAll('property').length,8);
  assert.equal(s.values.phh2o,7.4);assert.deepEqual(s.intervals_90.phh2o,{lower:5.6,upper:8.8});
  assert.deepEqual(s.intervals_90.nitrogen,{lower:.5,upper:5});assert.equal(s.intervals_90.clay,null);
  assert.equal(s.depth,'15-30cm');assert.equal(s.depth_cm,'15–30');assert.equal(s.lookup_method,'rest');
  // An absent or reversed interval must never be invented from its mean.
  const reversed={properties:{layers:[layer('phh2o',74,88,56,10)]}};
  const parsed=external.parseSoil(reversed,'15-30cm');assert.equal(parsed.vals.phh2o,7.4);assert.equal(parsed.intervals.phh2o,null);
  assert.throws(()=>external.parseSoil(reversed,'0-5cm'),err=>err.status===502);
  assert.throws(()=>external.parseSoil({properties:{layers:[layer('phh2o',1400,1,2,10)]}},'15-30cm'),err=>err.status===502);
});

test('strict WCS GeoTIFF reader uses the requested point and respects nodata',()=>{
  const {readFileSync}=require('node:fs');
  const {readGeoTiffPoint,coverageUrl}=require('../node-server/soil-wcs');
  const fixture=readFileSync(path.join(__dirname,'fixtures','isric_ph_telangana_0-5cm.tif'));
  assert.equal(readGeoTiffPoint(fixture,17.68,78.18),74);
  assert.equal(readGeoTiffPoint(fixture,17.68,78.182),null);
  assert.throws(()=>readGeoTiffPoint(fixture,18,78.18),/does not contain/);
  assert.throws(()=>readGeoTiffPoint(Buffer.from('<error/>'),17.68,78.18));
  const u=new URL(coverageUrl('phh2o','15-30cm',17.68,78.18));
  assert.equal(u.hostname,'maps.isric.org');assert.equal(u.searchParams.get('COVERAGEID'),'phh2o_15-30cm_mean');
  assert.equal(u.searchParams.getAll('SUBSET').length,2);
  assert.throws(()=>coverageUrl('phh2o','0-5cm',90,0),/coordinate boundary/);
});

test('official WCS fallback is honest about partial values, intervals, errors, and total rate limit',async()=>{
  const {readFileSync}=require('node:fs');
  const fixture=readFileSync(path.join(__dirname,'fixtures','isric_ph_telangana_0-5cm.tif'));
  let urls=[],now=0;
  const a=external.createAdapters({clock:()=>now,request:async()=>{throw new external.ExternalError('REST unavailable',502);},
    wcsRequest:async url=>{urls.push(new URL(url));if(url.includes('clay'))throw new Error('layer unavailable');return fixture;}});
  const r=await a.soil(17.68,78.18,'0-5cm');
  assert.equal(r.lookup_method,'wcs_fallback');assert.equal(r.values.phh2o,7.4);assert.equal(r.values.clay,null);
  assert.equal(r.values.sand,7.4);assert.equal(r.values.soc,null);assert.equal(r.texture_estimate,null);
  assert.equal(r.intervals_90.phh2o,null);assert.match(r.notice,/uncertainty intervals are unavailable/);
  assert.match(r.notice,/Some requested fallback layers/);assert.equal(urls.length,3);
  assert.deepEqual(urls.map(u=>u.searchParams.get('COVERAGEID')),['phh2o_0-5cm_mean','clay_0-5cm_mean','sand_0-5cm_mean']);
  // The first lookup consumed one REST + three WCS calls. The next REST call
  // is the fifth; it must not bypass fair use by issuing further WCS calls.
  await assert.rejects(()=>a.soil(17.68,78.18),err=>err.status===429);
  assert.equal(urls.length,3);now=60001;assert.equal((await a.soil(17.68,78.18)).lookup_method,'wcs_fallback');
  let called=false;
  const rate=external.createAdapters({request:async()=>{throw new external.ExternalError('upstream rate limit',429);},wcsRequest:async()=>{called=true;return fixture;}});
  await assert.rejects(()=>rate.soil(17.68,78.18),err=>err.status===429);assert.equal(called,false);
  const masked=external.createAdapters({request:async()=>{throw new external.ExternalError('down',502);},wcsRequest:async()=>fixture});
  await assert.rejects(()=>masked.soil(17.68,78.182),err=>err.status===404);
  const failed=external.createAdapters({request:async()=>{throw new external.ExternalError('down',502);},wcsRequest:async()=>{throw new Error('down');}});
  await assert.rejects(()=>failed.soil(17.68,78.18),err=>err.status===502);
});

test('soil cache keys isolate depth, coalesce concurrent lookups, and give fallback a short TTL',async()=>{
  let count=0;
  const adapters={soil:async(lat,lon,depth)=>{count++;await new Promise(resolve=>setTimeout(resolve,25));return {latitude:lat,longitude:lon,depth,values:{phh2o:7},lookup_method:depth==='15-30cm'?'wcs_fallback':'rest'};},
    geocode:async()=>({results:[]}),weather:async()=>({})};
  const app=await start(':memory:',adapters);
  try {
    const [a,b]=await Promise.all([app.req('GET','/api/soil?lat=17.68&lon=78.18'),app.req('GET','/api/soil?lat=17.68&lon=78.18')]);
    assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(count,1);assert.equal(a.body.depth,'0-5cm');
    let deep=await app.req('GET','/api/soil?lat=17.68&lon=78.18&depth=15-30cm');assert.equal(deep.body.cache,'live');assert.equal(count,2);
    deep=await app.req('GET','/api/soil?lat=17.68&lon=78.18&depth=15-30cm');assert.equal(deep.body.cache,'cached');
    assert.equal((await app.req('GET','/api/soil?lat=17.68&lon=78.18&depth=0-10cm')).status,400);assert.equal(count,2);
    const now=Math.floor(Date.now()/1000), rows=app.db.prepare('SELECT key,expires_at FROM soil_cache').all();
    assert.ok(rows.find(x=>x.key.endsWith(':0-5cm')).expires_at-now>=86390);
    assert.ok(rows.find(x=>x.key.endsWith(':15-30cm')).expires_at-now<=600);
  } finally {await app.close();}
});

test('pH prediction interval and WCS provenance survive profile cleaning and saved reports',async()=>{
  const original=profileFor({source:'soilgrids_live',soil_depth:'15-30cm',soil_method:'rest',soil_ph_interval_90:{lower:5.5,upper:7.9}});
  const r=engine.calculate(original);
  assert.deepEqual(r.profile.soil_ph_interval_90,{lower:5.5,upper:7.9});
  assert.match(r.missing_information.join(' '),/original SoilGrids pH 90% prediction interval was 5\.5–7\.9/);
  const w=engine.calculate(profileFor({source:'soilgrids_live',soil_method:'wcs_fallback'}));
  assert.match(w.missing_information.join(' '),/limited official WCS fallback/);assert.equal(w.profile.soil_ph_interval_90,null);
  for(const interval of [{lower:8,upper:5},{lower:-1,upper:10},{lower:1,upper:15},{lower:'bad',upper:7},'bad',[]]) {
    assert.throws(()=>engine.validateProfile(profileFor({soil_ph_interval_90:interval})),engine.ValidationError);
  }
  assert.throws(()=>engine.validateProfile(profileFor({soil_method:'other'})),engine.ValidationError);
  const app=await start(':memory:');const key='c'.repeat(64);
  try {
    let saved=await app.req('POST','/api/reports',{key,body:{profile:original,title:'Test pH interval'}});
    assert.equal(saved.status,201);let loaded=await app.req('GET','/api/reports/'+saved.body.id,{key});
    assert.deepEqual(loaded.body.profile.soil_ph_interval_90,{lower:5.5,upper:7.9});
    assert.equal(loaded.body.profile.soil_depth,'15-30cm');assert.equal(loaded.body.profile.soil_method,'rest');
    assert.match(loaded.body.result.missing_information.join(' '),/5\.5–7\.9/);
  } finally {await app.close();}
});

test('bundled GeoNames index searches countries, regions, cities and multilingual names offline',()=>{
  const info=require('../server/data/place-dataset-info.json');const {searchOffline}=require('../node-server/place-index');
  assert.ok(info.counts.city500>=200000);assert.ok(info.counts.country>=240);assert.ok(info.counts.ADM1>=3000);assert.ok(info.counts.ADM2>=40000);
  const examples=[
    ['Secunderabad',r=>r.name==='Secunderabad'&&r.country==='India'],
    ['Telangana',r=>r.name==='Telangana'&&r.kind==='region'&&r.country==='India'],
    ['Bharat',r=>r.name==='India'&&r.kind==='country'],
    ['भारत',r=>r.name==='India'&&r.kind==='country'],
    ['日本',r=>r.name==='Japan'&&r.kind==='country'],
    ['東京',r=>r.name==='Tokyo'&&r.country==='Japan'],
    ['Siddipet',r=>r.name==='Siddipet'&&r.country==='India'],
    ['Springfield, Illinois',r=>r.name==='Springfield'&&r.region==='Illinois'&&r.country==='United States'],
    ['New South Wales',r=>r.name==='New South Wales'&&r.kind==='region'&&r.country==='Australia'],
    ['Aotearoa',r=>r.name==='New Zealand'&&r.kind==='country']
  ];
  for(const [q,predicate] of examples) {
    const results=searchOffline(q,30);assert.ok(results.some(predicate),`No valid offline match for ${q}`);
    assert.ok(results.every(x=>x.source==='GeoNames offline'&&x.latitude>=-90&&x.latitude<=90&&x.longitude>=-180&&x.longitude<=180));
  }
  assert.deepEqual(searchOffline('zzzzzqwertyuiop999999',10),[]);
  assert.ok(searchOffline('Netherlands Antilles',10).some(x=>x.kind==='historical country / territory'));
});

test('geocoder parses world providers, protects rate limits, merges duplicates and caches queries',async()=>{
  const {createGeocoder,parsePhoton,parseMeteo,mergeResults}=require('../node-server/geocode');
  const pho={type:'FeatureCollection',features:[
    {type:'Feature',geometry:{type:'Point',coordinates:[78.18,17.68]},properties:{name:'Example',country:'India',countrycode:'IN',state:'Telangana',osm_key:'place',osm_value:'town',type:'city'}},
    {type:'Feature',geometry:{type:'Point',coordinates:[500,0]},properties:{name:'Invalid'}}]};
  const met={results:[{name:'Example',country:'India',country_code:'IN',admin1:'Telangana',feature_code:'PPL',latitude:17.6801,longitude:78.1801},
    {name:'Missing',latitude:null,longitude:0}]};
  assert.equal(parsePhoton(pho).length,1);assert.equal(parsePhoton(pho)[0].latitude,17.68);
  assert.equal(parseMeteo(met).length,1);assert.throws(()=>parsePhoton({features:[]}));
  const merged=mergeResults([parsePhoton(pho),parseMeteo(met)],'Example');assert.equal(merged.length,1);
  assert.deepEqual(merged[0].also_sources,['GeoNames via Open-Meteo']);
  let now=0,calls=[];
  const offline=q=>q==='Example'?[{name:'Example',latitude:17.68,longitude:78.18,region:'Telangana',country:'India',country_code:'IN',kind:'city / town / village',source:'GeoNames offline',_score:1010}]:[];
  const request=async url=>{calls.push(new URL(url));return url.startsWith('https://photon.')?pho:met;};
  const g=createGeocoder({request,clock:()=>now,offline});
  const r=await g.search('Example');assert.equal(r.search_status,'online');assert.equal(r.results.length,1);assert.equal(r.results[0].source,'OpenStreetMap via Photon');assert.equal(calls.length,2);
  assert.equal((await g.search('Example')).cache,'cached');assert.equal(calls.length,2);
  // A burst for another query must not hit public services again inside 1.1s.
  const burst=await g.search('Second');assert.equal(calls.length,2);assert.equal(burst.search_status,'offline');assert.equal(burst.results.length,0);
  now=1200;const next=await g.search('Third');assert.equal(calls.length,4);assert.equal(next.search_status,'online');
  assert.ok(calls.some(u=>u.hostname==='photon.komoot.io'&&u.searchParams.get('q')==='Example'));
  assert.ok(calls.some(u=>u.hostname==='geocoding-api.open-meteo.com'&&u.searchParams.get('count')==='30'));
});

test('geocoder handles provider outages, empty results, in-flight coalescing and user-entered coordinates',async()=>{
  const {createGeocoder}=require('../node-server/geocode');
  const failed=createGeocoder({request:async()=>{throw Error('offline');},offline:()=>[]});
  const empty=await failed.search('not-an-invented-place');assert.equal(empty.search_status,'offline');assert.deepEqual(empty.results,[]);
  const partial=createGeocoder({offline:()=>[],request:async url=>url.startsWith('https://photon.')?{type:'FeatureCollection',features:[]}:(()=>{throw Error('down');})()});
  assert.equal((await partial.search('Example')).search_status,'partial');
  let count=0;
  const g=createGeocoder({offline:()=>[],request:async url=>{count++;await new Promise(resolve=>setTimeout(resolve,20));return url.startsWith('https://photon.')?{type:'FeatureCollection',features:[]}:{results:[]};}});
  const [a,b]=await Promise.all([g.search('Simultaneous'),g.search('Simultaneous')]);assert.equal(count,2);assert.equal(a.search_status,'online');assert.deepEqual(a,b);
  const adapters=external.createAdapters({offlinePlaces:()=>{throw Error('not needed');},request:async()=>{throw Error('not needed');}});
  const point=await adapters.geocode('17.385, 78.4867');assert.equal(point.search_status,'coordinates');assert.equal(point.results[0].latitude,17.385);assert.equal(point.results[0].longitude,78.4867);
  assert.equal(point.results[0].source,'Coordinates you entered');
  await assert.rejects(()=>adapters.geocode('91, 0'),err=>err.status===400);
  for(const q of ['', '***','a'.repeat(121)])await assert.rejects(()=>adapters.geocode(q),err=>err.status===400);
  const single=external.createAdapters({offlinePlaces:q=>q==='Y'?[{name:'Y',latitude:50,longitude:2,source:'GeoNames offline',kind:'place'}]:[],request:async()=>{throw Error('offline');}});
  assert.equal((await single.geocode('Y')).results[0].name,'Y');
});
