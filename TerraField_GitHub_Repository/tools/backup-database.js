'use strict';
// Online SQLite backup, including WAL content; refuses to overwrite existing files.
// Usage: node tools/backup-database.js source.db destination.db
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync,backup}=require('node:sqlite');
(async()=>{const [src,dst]=process.argv.slice(2);if(!src||!dst||path.resolve(src)===path.resolve(dst))throw Error('Usage: node tools/backup-database.js source.db NEW-destination.db');if(!fs.existsSync(src))throw Error('Source database does not exist');const out=path.resolve(dst),fd=fs.openSync(out,'wx',0o600);fs.closeSync(fd);let db;
 try{db=new DatabaseSync(path.resolve(src),{readOnly:true});await backup(db,out);console.log('Backup created:',out);}catch(e){try{fs.unlinkSync(out)}catch(_){}throw e;}finally{db?.close();}
})().catch(e=>{console.error('Backup failed:',e.message);process.exitCode=1;});
