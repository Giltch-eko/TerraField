'use strict';
// TerraField Windows/local edition: no Python and no third-party npm packages.
// Node 24's built-in HTTP, SQLite and fetch power the local REST API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const engine = require('./engine');
const catalogue = require('./catalogue');
const advisor = require('./advisor');
const organic = require('./organic');
const geometry = require('../client/geometry');
const {ExternalError,validCoordinates,validDepth,createAdapters} = require('./external');

const ROOT=path.resolve(__dirname,'..');
const CLIENT=path.join(ROOT,'client');
const DEFAULT_DB=path.join(ROOT,'server','terra.db');
// Informational catalogue only; the separate engine.CROPS array remains the
// sole recommendation set. Loaded once and served offline from the bundle.
const PLANT_LIBRARY=JSON.parse(fs.readFileSync(path.join(ROOT,'server','data','plant-library.json'),'utf8'));
const MAX_BODY=32768;
const CSP="default-src 'self'; img-src 'self' data: https://tiles.maps.eox.at; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'";
class ApiError extends Error { constructor(status,message,fields) { super(message);this.status=status;this.fields=fields; } }
const utcnow=()=>new Date().toISOString().replace(/\.\d{3}Z$/,'Z');

function initDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)),{recursive:true});
  const db=new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL;');
    db.exec(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, title TEXT NOT NULL,
      profile_json TEXT NOT NULL, result_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS reports_owner_created ON reports(owner_hash, created_at DESC);
      CREATE TABLE IF NOT EXISTS soil_cache (key TEXT PRIMARY KEY, data_json TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS farm_plans (owner_hash TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    if(!db.prepare('PRAGMA table_info(reports)').all().some(c=>c.name==='field_json')) db.exec('ALTER TABLE reports ADD COLUMN field_json TEXT');
    return db;
  } catch(e) { db.close(); throw e; }
}
function ownerKey(header) {
  if (typeof header!=='string' || !/^[A-Fa-f0-9]{64}$/.test(header)) throw new ApiError(401,'A valid browser workspace key is required.');
  return crypto.createHash('sha256').update(header).digest('hex');
}
function getOwned(db,id,owner) {
  const row=db.prepare('SELECT * FROM reports WHERE id=? AND owner_hash=?').get(id,owner);
  if(!row) throw new ApiError(404,'Report not found.');
  return row;
}
function readReport(row) {
  return {id:row.id,title:row.title,profile:JSON.parse(row.profile_json),result:JSON.parse(row.result_json),field:row.field_json?JSON.parse(row.field_json):null,created_at:row.created_at,updated_at:row.updated_at};
}
function sendJson(res,status,data) {
  const raw = data === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(data),'utf8');
  const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store','Content-Length':raw.length};
  if(data!==undefined) headers['Content-Type']='application/json; charset=utf-8';
  res.writeHead(status,headers);res.end(raw);
}
async function readBody(req) {
  const declared=req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) { req.resume(); throw new ApiError(400,'Invalid Content-Length.'); }
  if (declared !== undefined && Number(declared)>MAX_BODY) { req.resume(); throw new ApiError(413,'Request body is too large.'); }
  if (!String(req.headers['content-type']||'').toLowerCase().includes('application/json')) { req.resume(); throw new ApiError(415,'Content-Type must be application/json.'); }
  const raw=await new Promise((resolve,reject)=>{
    const chunks=[];let size=0, rejected=false;
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size>MAX_BODY) { if(!rejected){rejected=true;reject(new ApiError(413,'Request body is too large.'));} }
      else if(!rejected) chunks.push(chunk);
    });
    req.on('end',()=>{if(!rejected) resolve(Buffer.concat(chunks));});
    req.on('error',err=>{if(!rejected) reject(err);});
  });
  if(!raw.length) throw new ApiError(400,'A JSON request body is required.');
  let val;
  try { val=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)); }
  catch (_) { throw new ApiError(400,'Malformed JSON.'); }
  if(!val || typeof val!=='object' || Array.isArray(val)) throw new ApiError(400,'Request body must be an object.');
  return val;
}
function serveStatic(req,res,urlPath) {
  let requested;
  try { requested=decodeURIComponent(urlPath); } catch (_) { throw new ApiError(400,'Invalid URL.'); }
  if(requested==='' || requested==='/') requested='/index.html';
  if(requested.includes('\0')) throw new ApiError(404,'Page or file not found.');
  const file=path.resolve(CLIENT,'.'+requested), root=fs.realpathSync(CLIENT);
  if(!file.startsWith(CLIENT+path.sep)) throw new ApiError(404,'Page or file not found.');
  let real,stat;
  try { real=fs.realpathSync(file);stat=fs.statSync(real); }
  catch (_) { throw new ApiError(404,'Page or file not found.'); }
  if(!real.startsWith(root+path.sep) || !stat.isFile()) throw new ApiError(404,'Page or file not found.');
  const ext=path.extname(real).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
    '.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
  const raw=fs.readFileSync(real);
  res.writeHead(200,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
    'Content-Type':types[ext]||'application/octet-stream','Content-Length':raw.length,'Content-Security-Policy':CSP,
    'Cache-Control':['.html','.js','.css'].includes(ext)?'no-cache':'public, max-age=86400'});
  res.end(req.method==='HEAD'?undefined:raw);
}
function createApp({dbPath=DEFAULT_DB, adapters=createAdapters(), logger=console}={}) {
  const db=initDb(dbPath);
  try { catalogue.init(db); catalogue.seed(db,PLANT_LIBRARY.plants); } catch(err) { db.close(); throw err; }
  const pendingSoil=new Map();
  const known=new Set(['/api/health','/api/crops','/api/plants','/api/examples','/api/regions','/api/location/search','/api/weather','/api/soil','/api/recommendations','/api/reports','/api/catalogue','/api/catalogue/filters','/api/advisor/guide','/api/irrigation/calculate','/api/farm-costs/calculate','/api/crop-health/diagnose','/api/advisor/ask','/api/farm-plan','/api/crop-calendar','/api/advisor/organic-practices']);
  async function route(req,res) {
    let url;
    try { url=new URL(req.url,'http://127.0.0.1'); } catch(_) { throw new ApiError(400,'Invalid URL.'); }
    let pathname;
    try { pathname=decodeURIComponent(url.pathname); } catch (_) { throw new ApiError(400,'Invalid URL.'); }
    const method=req.method;
    if(!pathname.startsWith('/api/')) {
      if(method!=='GET' && method!=='HEAD') throw new ApiError(405,'Method not allowed.');
      return serveStatic(req,res,url.pathname);
    }
    if(pathname==='/api/health' && method==='GET') {
      db.prepare('SELECT 1').get();return sendJson(res,200,{status:'ok',database:'sqlite',method_version:'1.0',crop_count:engine.CROPS.length,plant_reference_count:PLANT_LIBRARY.plants.length});
    }
    if(pathname==='/api/crops' && method==='GET') return sendJson(res,200,{crops:engine.CROPS});
    if(pathname==='/api/plants' && method==='GET') return sendJson(res,200,PLANT_LIBRARY);
    if(pathname==='/api/catalogue' && method==='GET') {try{return sendJson(res,200,catalogue.listing(db,url.searchParams));}catch(e){if(e.status===400)throw new ApiError(400,e.message);throw e;}}
    if(pathname==='/api/catalogue/filters' && method==='GET') return sendJson(res,200,catalogue.filters(db));
    const catalogueMatch=pathname.match(/^\/api\/catalogue\/([A-Za-z0-9._:-]{1,120})$/);
    if(catalogueMatch && method==='GET') {const p=catalogue.detail(db,catalogueMatch[1]);if(!p)throw new ApiError(404,'Plant record not found.');return sendJson(res,200,p);}
    const cropMatch=pathname.match(/^\/api\/catalogue-crop\/([a-z0-9-]+)$/);
    if(cropMatch && method==='GET') {const p=catalogue.forCrop(db,cropMatch[1]);if(!p)throw new ApiError(404,'No linked plant record.');return sendJson(res,200,p);}
    if(pathname==='/api/examples' && method==='GET') return sendJson(res,200,{examples:engine.EXAMPLES,notice:'Synthetic demonstration inputs, not measurements.'});
    if(pathname==='/api/regions' && method==='GET') return sendJson(res,200,{regions:engine.REGIONS,notice:'Modelled point snapshots, not regional averages or laboratory readings.'});
    if(pathname==='/api/location/search' && method==='GET') return sendJson(res,200,await adapters.geocode(url.searchParams.get('q')||''));
    if(pathname==='/api/weather' && method==='GET') return sendJson(res,200,await adapters.weather(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(pathname==='/api/soil' && method==='GET') {
      const [lat,lon]=validCoordinates(url.searchParams.get('lat'),url.searchParams.get('lon'));
      const depth=validDepth(url.searchParams.get('depth'));
      // Include the layer and response version so an older 0–5 cm cache entry
      // cannot be mistaken for a different depth or for uncertainty data.
      const key=`v2:${lat.toFixed(6)},${lon.toFixed(6)}:${depth}`, now=Math.floor(Date.now()/1000);
      const row=db.prepare('SELECT data_json FROM soil_cache WHERE key=? AND expires_at>?').get(key,now);
      if(row) return sendJson(res,200,{...JSON.parse(row.data_json),cache:'cached'});
      // Coalesce simultaneous requests for the same point and depth.
      let pending=pendingSoil.get(key);
      if(!pending) {
        pending=Promise.resolve().then(()=>adapters.soil(lat,lon,depth));
        pendingSoil.set(key,pending);
      }
      let data;
      try { data=await pending; }
      finally { if(pendingSoil.get(key)===pending) pendingSoil.delete(key); }
      const ttl=data.lookup_method==='wcs_fallback'?600:86400;
      db.prepare('INSERT OR REPLACE INTO soil_cache(key,data_json,expires_at) VALUES(?,?,?)').run(key,JSON.stringify(data),Math.floor(Date.now()/1000)+ttl);
      return sendJson(res,200,{...data,cache:'live'});
    }
    if(pathname==='/api/advisor/organic-practices' && method==='GET') return sendJson(res,200,organic.guidance());
    if(pathname==='/api/advisor/guide' && method==='POST') return sendJson(res,200,advisor.guide(await readBody(req)));
    if(pathname==='/api/irrigation/calculate' && method==='POST') return sendJson(res,200,advisor.irrigation(await readBody(req)));
    if(pathname==='/api/farm-costs/calculate' && method==='POST') return sendJson(res,200,advisor.costs(await readBody(req)));
    if(pathname==='/api/crop-health/diagnose' && method==='POST') return sendJson(res,200,advisor.health(await readBody(req)));
    if(pathname==='/api/crop-calendar' && method==='POST') return sendJson(res,200,advisor.calendar(await readBody(req)));
    if(pathname==='/api/advisor/ask' && method==='POST') return sendJson(res,200,advisor.ask(await readBody(req)));
    if(pathname==='/api/farm-plan' && method==='GET') {const owner=ownerKey(req.headers['x-workspace-key']);const row=db.prepare('SELECT data_json,updated_at FROM farm_plans WHERE owner_hash=?').get(owner);return sendJson(res,200,row?{plan:JSON.parse(row.data_json),updated_at:row.updated_at}:{plan:null,updated_at:null});}
    if(pathname==='/api/farm-plan' && method==='PUT') {const owner=ownerKey(req.headers['x-workspace-key']),plan=advisor.plan(await readBody(req)),now=utcnow();db.prepare('INSERT INTO farm_plans(owner_hash,data_json,updated_at) VALUES(?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at').run(owner,JSON.stringify(plan),now);return sendJson(res,200,{plan,updated_at:now});}
    if(pathname==='/api/recommendations' && method==='POST') {
      const data=await readBody(req);return sendJson(res,200,engine.calculate(data.profile));
    }
    if(pathname==='/api/reports' && method==='GET') {
      const owner=ownerKey(req.headers['x-workspace-key']);
      const rows=db.prepare('SELECT * FROM reports WHERE owner_hash=? ORDER BY created_at DESC LIMIT 200').all(owner);
      const reports=rows.map(row=>{
        const result=JSON.parse(row.result_json), best=result.rankings[0]||null;
        return {id:row.id,title:row.title,created_at:row.created_at,updated_at:row.updated_at,top_crop:best?.name??null,top_score:best?.score??null,profile:JSON.parse(row.profile_json)};
      });
      return sendJson(res,200,{reports});
    }
    if(pathname==='/api/reports' && method==='POST') {
      const owner=ownerKey(req.headers['x-workspace-key']), data=await readBody(req);
      const result=engine.calculate(data.profile), profile=result.profile;
      let field=null;
      if(data.field!==undefined && data.field!==null) {
        const points=geometry.fromGeoJSON(data.field.geometry), pt=points&&geometry.representativePoint(points);
        if(!pt || profile.latitude===null || profile.longitude===null || Math.abs(profile.latitude-pt.lat)>0.000001 || Math.abs(profile.longitude-pt.lng)>0.000001) throw new ApiError(422,'Field outline is invalid or does not match the profile location.');
        field={geometry:geometry.toGeoJSON(points),area_m2:geometry.mapArea(points),representative_point:{latitude:pt.lat,longitude:pt.lng},method:pt.method,source:'User-drawn outline; approximate, not a survey'};
      }
      const title=data.title || profile.name || 'Untitled field';
      if(typeof title!=='string' || !title.trim() || [...title.trim()].length>80) throw new ApiError(422,'Report title must be 1–80 characters.');
      const rid=crypto.randomUUID().replace(/-/g,''), now=utcnow();
      db.prepare('INSERT INTO reports(id,owner_hash,title,profile_json,result_json,created_at,updated_at,field_json) VALUES(?,?,?,?,?,?,?,?)').run(rid,owner,title.trim(),JSON.stringify(profile),JSON.stringify(result),now,now,field?JSON.stringify(field):null);
      return sendJson(res,201,{id:rid,title:title.trim(),created_at:now,result,field});
    }
    const match=pathname.match(/^\/api\/reports\/([a-f0-9]{32})$/);
    if(match) {
      const owner=ownerKey(req.headers['x-workspace-key']), rid=match[1];
      if(method==='GET') return sendJson(res,200,readReport(getOwned(db,rid,owner)));
      if(method==='PATCH') {
        const data=await readBody(req), title=data.title;
        if(typeof title!=='string' || !title.trim() || [...title.trim()].length>80) throw new ApiError(422,'Report title must be 1–80 characters.');
        getOwned(db,rid,owner);
        db.prepare('UPDATE reports SET title=?,updated_at=? WHERE id=? AND owner_hash=?').run(title.trim(),utcnow(),rid,owner);
        return sendJson(res,200,readReport(getOwned(db,rid,owner)));
      }
      if(method==='DELETE') {
        getOwned(db,rid,owner);db.prepare('DELETE FROM reports WHERE id=? AND owner_hash=?').run(rid,owner);
        return sendJson(res,204);
      }
      throw new ApiError(405,'Method not allowed.');
    }
    throw new ApiError(known.has(pathname)?405:404,known.has(pathname)?'Method not allowed.':'Endpoint not found.');
  }
  const server=http.createServer((req,res)=>{
    // Do not log query strings: they can contain coordinates.
    res.on('finish',()=>{
      const barePath=(req.url||'').split('?')[0];
      logger.log(`${req.socket.remoteAddress} - ${req.method} ${barePath} - ${res.statusCode}`);
    });
    route(req,res).catch(err=>{
      if(res.headersSent || res.destroyed) return;
      if(err instanceof engine.ValidationError) return sendJson(res,422,{error:err.message,fields:err.fields});
      if(err instanceof ExternalError || err instanceof ApiError || err instanceof advisor.AdvisoryError) {
        const data={error:err.message};if(err.fields)data.fields=err.fields;
        return sendJson(res,err.status,data);
      }
      logger.error(`Unhandled server error: ${err.name}: ${err.message}`);
      return sendJson(res,500,{error:'Something went wrong on the server.'});
    });
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  let closed=false;
  const closeDb=()=>{if(!closed){closed=true;db.close();}};
  server.on('close',closeDb);
  return {server,db,closeDb};
}
function openBrowser(url) {
  if(process.env.TERRAFIELD_NO_BROWSER==='1') return;
  let child;
  try {
    if(process.platform==='win32') child=spawn('cmd.exe',['/d','/c','start','',url],{detached:true,windowsHide:true,stdio:'ignore'});
    else if(process.platform==='darwin') child=spawn('open',[url],{detached:true,stdio:'ignore'});
    else child=spawn('xdg-open',[url],{detached:true,stdio:'ignore'});
    child.on('error',()=>console.log(`If the browser did not open, go to ${url} yourself.`));child.unref();
  } catch (_) { console.log(`If the browser did not open, go to ${url} yourself.`); }
}
function main() {
  const portString=process.env.TERRAFIELD_PORT||process.env.PORT||'8000';
  if(!/^\d+$/.test(portString) || Number(portString)<1 || Number(portString)>65535) {
    console.error('TERRAFIELD_PORT or PORT must be a whole number between 1 and 65535.');process.exitCode=1;return;
  }
  const port=Number(portString), dbPath=process.env.DATABASE_PATH||DEFAULT_DB;
  let application;
  try { application=createApp({dbPath}); }
  catch(err) {
    console.error('Could not open the local database. Extract the complete folder to a writable location such as Documents.');
    console.error(`Details: ${err.message}`);process.exitCode=1;return;
  }
  const {server,closeDb}=application;
  server.on('error',err=>{
    console.error(`Could not start TerraField on port ${port}: ${err.message}`);
    console.error('Close the other app using that port, or set TERRAFIELD_PORT to a free port (see READ_ME_FIRST.txt).');
    closeDb();process.exitCode=1;
  });
  const host=process.env.TERRAFIELD_HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
  server.listen(port,host,()=>{
    const url=`http://localhost:${port}`;
    console.log('\nTerraField is ready on this computer.');console.log(`Open: ${url}`);
    console.log(`Database: ${path.resolve(dbPath)}`);
    console.log('Keep this window open while using the app. Press Ctrl+C or close it to stop.\n');
    openBrowser(url);
  });
  const stop=()=>server.close(()=>console.log('\nTerraField stopped. Your saved reports remain in the local database.'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module) main();
module.exports={createApp,initDb,main,ApiError,DEFAULT_DB};
