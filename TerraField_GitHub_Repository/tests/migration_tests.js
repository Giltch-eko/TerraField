'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {spawnSync}=require('node:child_process');const {DatabaseSync}=require('node:sqlite');const {createApp}=require('../node-server/app');
test('additive catalogue migration retains a preexisting report and survives restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terra-migration-')),file=path.join(dir,'data.db');
 try{const db=new DatabaseSync(file);db.exec(`CREATE TABLE reports (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL,title TEXT NOT NULL,profile_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?)').run('old','hash','Keep me','{}','{}','2026','2026');db.close();
  let app=createApp({dbPath:file,logger:{log(){},error(){}}});assert.equal(app.db.prepare('SELECT title FROM reports WHERE id=?').get('old').title,'Keep me');assert.equal(app.db.prepare('SELECT count(*) n FROM catalogue_plants').get().n,2302);app.closeDb();
  app=createApp({dbPath:file,logger:{log(){},error(){}}});assert.equal(app.db.prepare('SELECT count(*) n FROM catalogue_plants').get().n,2302);assert.equal(app.db.prepare('SELECT title FROM reports WHERE id=?').get('old').title,'Keep me');app.closeDb();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('stream importer reports duplicates and invalid source without inflating catalogue on rerun',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terra-import-')),file=path.join(dir,'data.db'),input=path.join(dir,'records.ndjson');
 const row={id:'trial-1',name:'Benchmark record',scientific_name:'Benchmark exemplar',source_url:'https://example.org/not-real',license:'test only',uses:[]};
 fs.writeFileSync(input,[JSON.stringify(row),JSON.stringify({...row,id:'trial-2'}),JSON.stringify({...row,id:'trial-3',scientific_name:'Benchmark other',source_url:'javascript:bad'})].join('\n'));
 try{for(let i=0;i<2;i++){const r=spawnSync(process.execPath,[path.join(__dirname,'../tools/import-catalogue.js'),input],{env:{...process.env,DATABASE_PATH:file},encoding:'utf8',timeout:30000});assert.equal(r.status,2,r.stderr);assert.match(r.stdout,/"duplicates":1/);assert.match(r.stdout,/"rejected":1/);}const db=new DatabaseSync(file);assert.equal(db.prepare('SELECT count(*) n FROM catalogue_plants').get().n,2303);db.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
