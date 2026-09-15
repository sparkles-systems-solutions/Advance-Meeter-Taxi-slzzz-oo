import { readFileSync } from 'node:fs';
import { openStore,validateState } from './store.mjs';
const [username,file]=process.argv.slice(2);const db=openStore(process.env.AMT_DATABASE||'./data/taxi.sqlite');
try{
 const user=db.prepare('SELECT id FROM users WHERE username=?').get(username?.toLowerCase());if(!user)throw Error('Account not found');
 const backup=JSON.parse(readFileSync(file,'utf8'));const row=db.prepare('SELECT * FROM states WHERE user_id=?').get(user.id),previous=JSON.parse(row.data);
 if(!Array.isArray(backup.rides)||!Array.isArray(backup.fuel)||!Array.isArray(backup.repairs))throw Error('Expected a legacy JSON backup');
 const merge=(oldRows,newRows)=>{const rows=new Map(oldRows.map(r=>[r.id,r]));for(const r of newRows){if(rows.has(r.id))continue;rows.set(r.id,r);}return [...rows.values()];};
 const next={...previous,rides:JSON.stringify(merge(JSON.parse(previous.rides),backup.rides)),fuel_logs:JSON.stringify(merge(JSON.parse(previous.fuel_logs||'[]'),backup.fuel)),repair_logs:JSON.stringify(merge(JSON.parse(previous.repair_logs||'[]'),backup.repairs)),amt_schedules:JSON.stringify(merge(JSON.parse(previous.amt_schedules||'[]'),backup.schedules||[]))};
 validateState(next,previous,'admin',{historicalImport:true});
 db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO snapshots(user_id,data,time) VALUES(?,?,?)').run(user.id,row.data,Date.now());db.prepare('UPDATE states SET data=?,version=version+1 WHERE user_id=?').run(JSON.stringify(next),user.id);db.prepare('INSERT INTO audit(user_id,event,time) VALUES(?,?,?)').run(user.id,'historical_import',Date.now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 console.log('Historical records merged; existing IDs kept. Old app passwords and tariffs were not imported.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
