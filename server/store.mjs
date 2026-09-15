import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive=promisify(scrypt);
export const defaults={base:100,rate:80,waitRate:5,nightPercent:10,appName:'ADVANCE MEETER TAXI',receiptName:'AMT OFFICIAL RECEIPT',logo:null};
export const digest=s=>createHash('sha256').update(s).digest('hex');
export async function passwordHash(password,salt=randomBytes(16).toString('hex')) { return salt+':'+(await derive(password,salt,64)).toString('hex'); }
export async function passwordMatches(password,stored) {const [salt,hash]=stored.split(':');const actual=(await passwordHash(password,salt)).split(':')[1];return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(hash,'hex'));}
export function openStore(file) {
 if(file!==':memory:')mkdirSync(dirname(file),{recursive:true,mode:0o700});
 const db=new DatabaseSync(file);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','driver')), active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS states(user_id INTEGER PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,event TEXT NOT NULL,time INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shares(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,data TEXT NOT NULL,time INTEGER NOT NULL);`);return db;
}
export function emptyState(){return {settings:JSON.stringify(defaults),rides:'[]',fuel_logs:'[]',repair_logs:'[]',amt_schedules:'[]',system_logs:'[]',local_backups:'[]'};}
export async function addUser(db,username,password,role='driver') {
 if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||!['admin','driver'].includes(role)||typeof password!=='string'||password.length<12||password.length>128)throw Error('Use a 3–40 character username, admin/driver role, and 12–128 character password.');
 const hash=await passwordHash(password);const result=db.prepare('INSERT INTO users(username,password,role) VALUES(?,?,?)').run(username.toLowerCase(),hash,role);
 db.prepare('INSERT INTO states(user_id,data) VALUES(?,?)').run(result.lastInsertRowid,JSON.stringify(emptyState()));return Number(result.lastInsertRowid);
}
export function validateState(state,previous,role,{historicalImport=false}={}) {
 if(!state||Array.isArray(state)||typeof state!=='object')throw Error('Invalid state');
 const allowed=new Set(['settings','rides','fuel_logs','repair_logs','amt_schedules','system_logs','local_backups','amt_ride_state','amt_pending_payment','auto_backup_pref']);
 for(const [key,value] of Object.entries(state)) {
  if(!allowed.has(key)&&!/^cnt_\d{4}$/.test(key))throw Error('Unknown data key');
  if(typeof value!=='string')throw Error('Invalid stored value');
 }
 const settings=JSON.parse(state.settings);const before=JSON.parse(previous.settings);
 if(!settings||typeof settings!=='object'||['base','rate','waitRate','nightPercent'].some(k=>!Number.isFinite(settings[k])||settings[k]<0||settings[k]>1000000))throw Error('Invalid tariff');
 if('password' in settings)throw Error('Passwords must not be stored in app settings');
 if(role!=='admin'&&JSON.stringify(settings)!==JSON.stringify(before))throw Error('Only an administrator may change settings');
 for(const key of ['appName','receiptName'])if(typeof settings[key]!=='string'||settings[key].length>120)throw Error('Invalid settings name');
 const cleanText=value=>{if(typeof value==='string'&&value.length>10000)throw Error('Text too long');if(value&&typeof value==='object')Object.values(value).forEach(cleanText);};
 for(const key of ['rides','fuel_logs','repair_logs','amt_schedules','system_logs','local_backups']) {
  const rows=JSON.parse(state[key]||'[]');if(!Array.isArray(rows)||rows.length>50000)throw Error('Invalid list');cleanText(rows);
 }
 const rides=JSON.parse(state.rides), old=new Map(JSON.parse(previous.rides).map(r=>[r.id,r]));const ids=new Set();
 for(const ride of rides){
  if(!ride||typeof ride.id!=='string'||ride.id.length>100||ids.has(ride.id)||!Number.isFinite(ride.km)||ride.km<0||ride.km>10000||!Number.isFinite(ride.fare)||ride.fare<0||!Number.isFinite(ride.time))throw Error('Invalid ride');
  ids.add(ride.id);
  if(old.has(ride.id)){if(JSON.stringify(old.get(ride.id))!==JSON.stringify(ride))throw Error('Paid receipts cannot be modified');continue;}
  if(historicalImport && role==='admin'){ride.imported=true;continue;}
  const {wait=0,disc=0,manualFare=0}=ride;if([wait,disc,manualFare].some(n=>!Number.isFinite(n)||n<0)||wait>120)throw Error('Invalid billing inputs');
  let amount=(manualFare>0?manualFare:settings.base+Math.max(0,ride.km-1)*settings.rate)+wait*settings.waitRate-disc;
  if(ride.nightUsed&&manualFare===0)amount*=1+settings.nightPercent/100;
  if(ride.fare!==Math.max(0,Math.round(amount)))throw Error('Fare does not match server tariff');
  ride.tariff={...settings};
 }
 for(const id of old.keys())if(!ids.has(id))throw Error('Paid receipts cannot be deleted');
 for(const [key,fields] of [['fuel_logs',['liters','price','total']],['repair_logs',['cost']]])for(const r of JSON.parse(state[key]||'[]'))if(!r||!Number.isFinite(r.id)||!Number.isFinite(Date.parse(r.date))||fields.some(k=>!Number.isFinite(r[k])||r[k]<0))throw Error('Invalid expense');
 for(const r of JSON.parse(state.amt_schedules||'[]'))if(!r||!Number.isFinite(r.id)||!Number.isFinite(Date.parse(r.datetime))||['name','phone','start','end','notes'].some(k=>r[k]!=null&&typeof r[k]!=='string')||['km','manualFare'].some(k=>r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0)))throw Error('Invalid booking');
 state.rides=JSON.stringify(rides);return state;
}
