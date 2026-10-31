'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{mkdtempSync,rmSync}=require('node:fs'),os=require('node:os'),path=require('node:path');
const geo=require('../client/geometry'),csv=require('../client/csv'),engine=require('../node-server/engine'),{DatabaseSync}=require('node:sqlite'),{createApp}=require('../node-server/app');
const concave=[[78,17],[78.04,17],[78.04,17.01],[78.01,17.01],[78.01,17.03],[78.04,17.03],[78.04,17.04],[78,17.04]].map(([lng,lat])=>({lat,lng}));
test('concave outline gets a strictly interior rounded representative point; area and GeoJSON round trip',()=>{
 assert.equal(geo.isSimpleRing(concave),true);assert.equal(geo.pointInside(geo.polygonCentroid(concave),concave),false);let p=geo.representativePoint(concave);assert.equal(p.method,'interior');assert.equal(geo.pointInside(p,concave),true);assert.deepEqual(geo.fromGeoJSON(geo.toGeoJSON(concave)),concave);assert.ok(geo.mapArea(concave)>1);
 for(const bad of [[],[{lat:17,lng:78},{lat:17.01,lng:78.01},{lat:17,lng:78.01},{lat:17.01,lng:78}],Array(101).fill({lat:17,lng:78}),[{lat:17,lng:179.9},{lat:17,lng:-179.9},{lat:17.1,lng:179.9}]])assert.equal(geo.isSimpleRing(bad),false);
 assert.equal(geo.fromGeoJSON({type:'Polygon',coordinates:[[[78,17],[78.01,17],[78.01,17.01]]]}),null);
});
test('CSV quotes delimiters and mitigates spreadsheet formulas',()=>{
 for(const value of ['=1+1',' +SUM(A1:A2)','@cmd','-1','\tfoo','\rfoo'])assert.match(csv.cell(value),/^"'/);
 assert.equal(csv.cell('a,"b"'), '"a,""b"""');assert.match(csv.serialize([['a','b'],['x','y']]),/\r\n/);
});
test('additive report field migration, server recomputation, rejection, ownership and restart',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'terra-audit-')),file=path.join(dir,'d.db');const db=new DatabaseSync(file);db.exec('CREATE TABLE reports (id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,title TEXT NOT NULL,profile_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)');db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?)').run('old','old-owner','old report','{}','{}','old','old');db.close();
 let app;try{
  app=createApp({dbPath:file,logger:{log(){},error(){}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.server.address().port}`,key='a'.repeat(64),other='b'.repeat(64),pt=geo.representativePoint(concave),profile={...engine.EXAMPLES[0].profile,latitude:pt.lat,longitude:pt.lng};const call=(route,method='GET',body,keyArg=key)=>fetch(url+route,{method,headers:{'X-Workspace-Key':keyArg,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(app.db.prepare('SELECT title FROM reports WHERE id=?').get('old').title,'old report');
  let r=await call('/api/reports','POST',{profile,field:{geometry:geo.toGeoJSON(concave),area_m2:999999999}});assert.equal(r.status,201);let j=await r.json();assert.ok(Math.abs(j.field.area_m2-geo.mapArea(concave))<0.0001);const id=j.id;
  r=await call('/api/reports/'+id,'GET',null,other);assert.equal(r.status,404);r=await call('/api/reports/'+id,'GET',null,'bad');assert.equal(r.status,401);
  r=await call('/api/reports','POST',{profile:{...profile,latitude:1},field:{geometry:geo.toGeoJSON(concave)}});assert.equal(r.status,422);
  r=await call('/api/reports','POST',{profile,field:{geometry:{type:'Polygon',coordinates:[[[0,0],[1,1],[0,1],[1,0],[0,0]]]}}});assert.equal(r.status,422);
  await new Promise(r=>app.server.close(r));app=createApp({dbPath:file,logger:{log(){},error(){}}});assert.deepEqual(JSON.parse(app.db.prepare('SELECT field_json FROM reports WHERE id=?').get(id).field_json).geometry,geo.toGeoJSON(concave));assert.equal(app.db.prepare('SELECT field_json FROM reports WHERE id=?').get('old').field_json,null);app.closeDb();app=null;
 }finally{if(app?.server.listening)await new Promise(r=>app.server.close(r));else app?.closeDb();rmSync(dir,{recursive:true,force:true});}
});
test('stream import cannot overwrite an existing ID with an incomplete record',()=>{
 const {spawnSync}=require('node:child_process'),fs=require('node:fs'),dir=mkdtempSync(path.join(os.tmpdir(),'terra-safe-import-')),file=path.join(dir,'d.db'),input=path.join(dir,'i.ndjson');let app;
 try{app=createApp({dbPath:file,logger:{log(){},error(){}}});let row=app.db.prepare('SELECT id,data_json FROM catalogue_plants LIMIT 1').get();const original=JSON.parse(row.data_json);app.closeDb();app=null;const replacement={id:row.id,name:'Incomplete overwrite',scientific_name:'Incomplete overwrite',source_url:'https://example.org/',license:'example'};fs.writeFileSync(input,JSON.stringify(replacement)+'\n');const r=spawnSync(process.execPath,[path.join(__dirname,'../tools/import-catalogue.js'),input],{env:{...process.env,DATABASE_PATH:file},encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).skipped_existing_id,1);const db=new DatabaseSync(file,{readOnly:true});assert.deepEqual(JSON.parse(db.prepare('SELECT data_json FROM catalogue_plants WHERE id=?').get(row.id).data_json),original);db.close();}finally{app?.closeDb();rmSync(dir,{recursive:true,force:true});}
});
