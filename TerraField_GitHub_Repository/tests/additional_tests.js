'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../node-server/app');
const engine=require('../node-server/engine');
const sample=()=>structuredClone(engine.EXAMPLES[0].profile);
test('required measurements, validation limits and nutrient limits',()=>{
  for(const field of ['ph','rainfall','temperature','soil_type','season']) assert.throws(()=>engine.calculate({...sample(),[field]:null}),engine.ValidationError);
  for(const [field,values] of Object.entries({ph:[-0.01,14.01],rainfall:[-1,10001],temperature:[-31,61],nitrogen:[-1,5001],phosphorus:[-1,5001],potassium:[-1,5001]})) for(const value of values) assert.throws(()=>engine.validateProfile({...sample(),[field]:value}),engine.ValidationError);
  for(const [field,values] of Object.entries({ph:[0,14],rainfall:[0,10000],temperature:[-30,60],nitrogen:[0,5000]})) for(const value of values) assert.equal(engine.validateProfile({...sample(),[field]:value})[field],value);
});
test('range boundaries and outside conditions are distinct',()=>{
 const band={absolute:[0,30],optimal:[10,20]};
 for(const x of [10,20])assert.deepEqual(engine.rangeScore(x,band),[1,false]);
 for(const x of [0,30])assert.deepEqual(engine.rangeScore(x,band),[0,false]);
 for(const x of [-1,31])assert.deepEqual(engine.rangeScore(x,band),[0,true]);
 assert.deepEqual(engine.rangeScore(5,band),[0.5,false]);
});
test('database errors produce safe JSON',async()=>{
 const logs={log(){},error(){}};const app=createApp({dbPath:':memory:',logger:logs});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{app.db.exec('DROP TABLE reports');const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/reports`,{headers:{'X-Workspace-Key':'a'.repeat(64)}});assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'Something went wrong on the server.'});}
 finally{await new Promise(r=>app.server.close(r));}
});
