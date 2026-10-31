'use strict';
// Stream UTF-8 newline-delimited JSON; one fully sourced plant object per line.
// Usage: DATABASE_PATH=server/terra.db node tools/import-catalogue.js records.ndjson
// Back up SQLite before importing. Review source, licence and taxon identity first.
const fs=require('node:fs'),readline=require('node:readline');
const {DatabaseSync}=require('node:sqlite');
const catalogue=require('../node-server/catalogue');
(async()=>{
 const file=process.argv[2], dbPath=process.env.DATABASE_PATH||'server/terra.db';
 if(!file)throw Error('Usage: node tools/import-catalogue.js <sourced-records.ndjson>');
 const db=new DatabaseSync(dbPath);catalogue.init(db);catalogue.seed(db,require('../server/data/plant-library.json').plants);
 let n=0,imported=0,rejected=0,duplicates=0,skipped_existing_id=0,inBatch=false;
 try{
  for await(const line of readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity})){
   if(!line.trim())continue;n++;
   if(!inBatch){db.exec('BEGIN');inBatch=true;}
   db.exec('SAVEPOINT item');
   try{const p=JSON.parse(line);if(!p.license)throw Error('Each record must include a verified source licence');catalogue.validate(p);if(db.prepare('SELECT 1 FROM catalogue_plants WHERE id=?').get(p.id)){db.exec('RELEASE item');skipped_existing_id++;}else{const result=catalogue.store(db,p);db.exec('RELEASE item');if(result.status==='duplicate'){duplicates++;console.error(`Line ${n}: duplicate scientific name; review ${result.id} / ${result.conflicts_with}`);}else imported++;}}
   catch(e){db.exec('ROLLBACK TO item; RELEASE item');rejected++;console.error(`Line ${n}: rejected: ${e.message}`);}
   if(n%250===0){db.exec('COMMIT');inBatch=false;}
  }
  if(inBatch){db.exec('COMMIT');inBatch=false;}
 }catch(e){if(inBatch)db.exec('ROLLBACK');throw e;}finally{db.close();}
 console.log(JSON.stringify({lines:n,imported,duplicates,rejected,skipped_existing_id}));if(rejected||duplicates)process.exitCode=2;
})().catch(e=>{console.error(e.message);process.exitCode=1});
