'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const {createApp}=require('../node-server/app');const cat=require('../node-server/catalogue');
test('catalogue seeds source records and supports indexed search, filters, pages and crop links',async()=>{
 const a=createApp({dbPath:':memory:',logger:{log(){},error(){}}});
 await new Promise(r=>a.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${a.server.address().port}`;
 async function get(path){const r=await fetch(base+path);return [r.status,await r.json()];}
 try{
  let [status,all]=await get('/api/catalogue?weeds=include');assert.equal(status,200);assert.equal(all.overall,2302);assert.equal(all.total,2302);assert.equal(all.records.length,24);assert.equal(all.pages,96);
  const [,second]=await get('/api/catalogue?weeds=include&page=2');assert.notEqual(second.records[0].id,all.records[0].id);
  let [,rice]=await get('/api/catalogue?q=Oryza%20sativa&weeds=include');assert.ok(rice.records.some(p=>p.scientific_name==='Oryza sativa'));
  let [,crop]=await get('/api/catalogue-crop/maize');assert.equal(crop.scientific_name,'Zea mays');
  let [,maize]=await get('/api/catalogue?q=makki&weeds=include');assert.ok(maize.records.some(p=>p.scientific_name==='Zea mays'));
  const synonym=a.db.prepare("SELECT data_json FROM catalogue_plants WHERE json_array_length(data_json,'$.synonyms')>0 LIMIT 1").get();const plant=JSON.parse(synonym.data_json);const term=plant.synonyms[0];let [,syn]=await get('/api/catalogue?q='+encodeURIComponent(term)+'&weeds=include');assert.ok(syn.total>=1);
  let [,screened]=await get('/api/catalogue?screened=yes&weeds=include');assert.equal(screened.total,21);assert.ok(screened.records.every(p=>p.screened_crop_id));
  let [,trees]=await get('/api/catalogue?type=tree&weeds=include');assert.ok(trees.total>0);assert.ok(trees.records.every(p=>p.life_forms.includes('tree')));
  let [,food]=await get('/api/catalogue?use=food&weeds=include');assert.ok(food.total>0);assert.ok(food.records.every(p=>p.purposes.includes('food')));
  let [,region]=await get('/api/catalogue?region=India&weeds=include');assert.equal(region.total,0);
  const [,filters]=await get('/api/catalogue/filters');assert.ok(filters.category.length);assert.ok(filters.type.length);assert.deepEqual(filters.region,[]);
  assert.equal((await get('/api/catalogue/does-not-exist'))[0],404);assert.equal((await get('/api/catalogue?page=0'))[0],400);assert.equal((await get('/api/catalogue?q='+encodeURIComponent('a'.repeat(121))))[0],400);
  const [,special]=await get('/api/catalogue?q='+encodeURIComponent("' OR 1=1 --"));assert.equal(special.total,0);
 }finally{await new Promise(r=>a.server.close(r));}
});
test('import validation, idempotence and name collision protection',()=>{
 const db=new DatabaseSync(':memory:');cat.init(db);const sample={id:'test-1',name:'Example',scientific_name:'Example plant',source_url:'https://example.org/plant/1',license:'CC BY 4.0',uses:[],life_forms:[],purposes:[],categories:[]};
 try{assert.equal(cat.store(db,sample).status,'imported');assert.equal(cat.store(db,sample).status,'imported');assert.equal(cat.store(db,{...sample,id:'test-2',scientific_name:'example plant'}).status,'duplicate');assert.equal(db.prepare('SELECT count(*) n FROM catalogue_plants').get().n,1);assert.throws(()=>cat.store(db,{...sample,id:'x',source_url:'javascript:alert(1)'}));assert.throws(()=>cat.store(db,{...sample,id:'x',license:''}));}finally{db.close();}
});
test('catalogue pagination works with 20,000 synthetic benchmark rows (not a dataset)',()=>{
 const db=new DatabaseSync(':memory:');cat.init(db);db.exec('BEGIN');
 try{for(let i=0;i<20000;i++)cat.store(db,{id:'bench-'+i,name:'Benchmark '+String(i).padStart(5,'0'),scientific_name:'Synthetic species '+i,source_url:'https://example.org/benchmark',license:'benchmark only',aliases:[],synonyms:[],life_forms:['herb'],categories:['benchmark'],purposes:['other'],uses:[]});db.exec('COMMIT');
  const start=performance.now();const p=cat.listing(db,new URLSearchParams('page=500&weeds=include'));assert.equal(p.total,20000);assert.equal(p.records.length,24);assert.equal(cat.listing(db,new URLSearchParams('q=Benchmark%2001999&weeds=include')).total,1);console.log(`Two SQLite benchmark queries over 20,000 synthetic rows: ${(performance.now()-start).toFixed(1)} ms (local, non-production)`);
 }finally{db.close();}
});
