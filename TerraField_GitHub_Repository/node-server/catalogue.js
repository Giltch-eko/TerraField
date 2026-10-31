'use strict';
// An additive SQLite catalogue. ECOCROP is historical reference data, not an
// authoritative current accepted-name register or proof of local cultivation.
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
function init(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS catalogue_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalogue_plants (
  id TEXT PRIMARY KEY, scientific_name TEXT NOT NULL, scientific_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL, sort_name TEXT NOT NULL, source_url TEXT NOT NULL, license TEXT NOT NULL,
  weed INTEGER NOT NULL DEFAULT 0 CHECK (weed IN (0,1)), screened_crop_id TEXT, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS catalogue_name_order ON catalogue_plants(sort_name,id);
  CREATE TABLE IF NOT EXISTS catalogue_tags (plant_id TEXT NOT NULL REFERENCES catalogue_plants(id) ON DELETE CASCADE, kind TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(plant_id,kind,value));
  CREATE INDEX IF NOT EXISTS catalogue_tags_lookup ON catalogue_tags(kind,value,plant_id);
  CREATE VIRTUAL TABLE IF NOT EXISTS catalogue_search USING fts5(id UNINDEXED, search_text, tokenize='trigram');`);
 if(!db.prepare('PRAGMA table_info(catalogue_plants)').all().some(x=>x.name==='screened_crop_id'))db.exec('ALTER TABLE catalogue_plants ADD COLUMN screened_crop_id TEXT');
 db.exec('CREATE INDEX IF NOT EXISTS catalogue_crop_link ON catalogue_plants(screened_crop_id)');
}
function validate(p){
 if(!p || typeof p!=='object' || Array.isArray(p))throw Error('Record must be an object');
 if(typeof p.id!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/.test(p.id))throw Error('Invalid source record id');
 for(const k of ['name','scientific_name','source_url'])if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>500)throw Error(`Missing or invalid ${k}`);
 if(!/^https:\/\//i.test(p.source_url))throw Error('Source URL must be HTTPS');
 if(p.license!==undefined && (typeof p.license!=='string'||!p.license.trim()||p.license.length>200))throw Error('Invalid licence');
 for(const k of ['aliases','synonyms','life_forms','categories','purposes','uses','cultivation_regions'])if(p[k]!==undefined && !Array.isArray(p[k]))throw Error(`${k} must be an array`);
 if(p.uses?.some(u=>!u || typeof u!=='object' || Array.isArray(u)))throw Error('Each use must be an object');
 return p;
}
function store(db,p,defaultLicense){
 validate(p);const licence=p.license||defaultLicense;if(!licence)throw Error('Missing dataset licence');
 // Same-source reruns are idempotent; conflicts between distinct identifiers
 // are not silently merged without taxonomic review.
 const existing=db.prepare('SELECT id FROM catalogue_plants WHERE scientific_key=?').get(normalize(p.scientific_name));
 if(existing&&existing.id!==p.id)return {status:'duplicate',id:p.id,conflicts_with:existing.id};
 const fields=['aliases','synonyms','life_forms','categories','purposes','uses','cultivation_regions'];
 p={...p,license:licence};for(const k of fields)if(!Array.isArray(p[k]))p[k]=[];
 const search=normalize([p.name,p.scientific_name,p.accepted_name,...p.aliases,...p.synonyms,...p.categories,...p.life_forms,...p.uses.flatMap(u=>[u.use,u.detail])].filter(x=>typeof x==='string').join(' '));
 db.prepare(`INSERT INTO catalogue_plants(id,scientific_name,scientific_key,display_name,sort_name,source_url,license,weed,screened_crop_id,data_json,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET scientific_name=excluded.scientific_name,scientific_key=excluded.scientific_key,display_name=excluded.display_name,sort_name=excluded.sort_name,source_url=excluded.source_url,license=excluded.license,weed=excluded.weed,screened_crop_id=excluded.screened_crop_id,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(p.id,p.scientific_name,normalize(p.scientific_name),p.name,normalize(p.name),p.source_url,licence,p.source_weed_label===true?1:0,typeof p.screened_crop_id==='string'?p.screened_crop_id:null,JSON.stringify(p),new Date().toISOString());
 db.prepare('DELETE FROM catalogue_tags WHERE plant_id=?').run(p.id);db.prepare('DELETE FROM catalogue_search WHERE id=?').run(p.id);
 const insert=db.prepare('INSERT OR IGNORE INTO catalogue_tags(plant_id,kind,value) VALUES(?,?,?)');
 for(const [kind,values] of [['category',p.categories],['type',p.life_forms],['use',p.purposes],['region',p.cultivation_regions]]) for(const value of values) if(typeof value==='string'&&value.trim())insert.run(p.id,kind,value.trim());
 db.prepare('INSERT INTO catalogue_search(id,search_text) VALUES(?,?)').run(p.id,search);
 return {status:'imported',id:p.id};
}
function seed(db,plants){
 const key='ecocrop-useful-2026-10-29';if(db.prepare('SELECT 1 FROM catalogue_migrations WHERE name=?').get(key))return;
 db.exec('BEGIN');try{for(const p of plants){if(db.prepare('SELECT 1 FROM catalogue_plants WHERE id=? OR scientific_key=?').get(p.id,normalize(p.scientific_name)))continue;store(db,p,'CC BY 4.0 (FAO ECOCROP catalogue)');}db.prepare('INSERT INTO catalogue_migrations VALUES(?,?)').run(key,new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
function listing(db,params){
 const q=normalize(params.get('q')||'');if(q.length>120)throw Object.assign(new Error('Search must be 120 characters or fewer.'),{status:400});
 const pageText=params.get('page')||'1';if(!/^\d{1,6}$/.test(pageText)||Number(pageText)<1)throw Object.assign(new Error('Page must be a positive integer.'),{status:400});
 const page=Number(pageText),limit=24,where=[],args=[];
 if(q.length>=3){where.push('p.id IN (SELECT id FROM catalogue_search WHERE catalogue_search MATCH ?)');args.push('"'+q.replace(/"/g,'""')+'"');}
 else if(q){where.push('p.id IN (SELECT id FROM catalogue_search WHERE search_text LIKE ? ESCAPE \'\\\')');args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
 for(const kind of ['category','type','use','region']){const value=params.get(kind)||'';if(value.length>120)throw Object.assign(new Error('Invalid filter.'),{status:400});if(value){where.push('EXISTS (SELECT 1 FROM catalogue_tags t WHERE t.plant_id=p.id AND t.kind=? AND t.value=?)');args.push(kind,value);}}
 const screened=params.get('screened')||'';if(screened&&!['yes','no'].includes(screened))throw Object.assign(new Error('Invalid screening filter.'),{status:400});if(screened)where.push(screened==='yes'?'p.screened_crop_id IS NOT NULL':'p.screened_crop_id IS NULL');
 if(params.get('weeds')!=='include')where.push('p.weed=0');
 const clause=where.length?' WHERE '+where.join(' AND '):'';
 const total=db.prepare('SELECT COUNT(*) AS n FROM catalogue_plants p'+clause).get(...args).n;
 const rows=db.prepare('SELECT data_json FROM catalogue_plants p'+clause+' ORDER BY p.sort_name,p.id LIMIT ? OFFSET ?').all(...args,limit,(page-1)*limit);
 const records=rows.map(r=>JSON.parse(r.data_json));
 const overall=db.prepare('SELECT COUNT(*) AS n FROM catalogue_plants').get().n;
 return {records,total,overall,page,page_size:limit,pages:Math.ceil(total/limit),notice:'Historical sourced records, not independently verified accepted taxa or evidence of local cultivation.'};
}
function filters(db){const rows=db.prepare('SELECT kind,value,COUNT(*) AS count FROM catalogue_tags GROUP BY kind,value ORDER BY kind,value COLLATE NOCASE').all();const data={category:[],type:[],use:[],region:[]};for(const r of rows)if(data[r.kind])data[r.kind].push({value:r.value,count:r.count});return data;}
function detail(db,id){const row=db.prepare('SELECT data_json FROM catalogue_plants WHERE id=?').get(id);return row?JSON.parse(row.data_json):null;}
function forCrop(db,cropId){const row=db.prepare('SELECT data_json FROM catalogue_plants WHERE screened_crop_id=? LIMIT 1').get(cropId);return row?JSON.parse(row.data_json):null;}
module.exports={init,seed,store,validate,listing,filters,detail,forCrop,normalize};
