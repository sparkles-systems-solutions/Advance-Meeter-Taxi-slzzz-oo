import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openStore, passwordMatches, passwordHash, digest, validateState, addUser } from './store.mjs';
export function createApp({dbFile=process.env.AMT_DATABASE||'./data/taxi.sqlite',origin=process.env.AMT_ORIGIN||'http://localhost:5055',root=resolve('.') }={}) {
 const db=openStore(dbFile), attempts=new Map();const dummy=passwordHash(randomBytes(32).toString('hex'));
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Cache-Control','no-store');res.setHeader('Permissions-Policy','geolocation=(self), microphone=(self), camera=()');
  if(process.env.NODE_ENV==='production')res.setHeader('Strict-Transport-Security','max-age=31536000');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try {
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.headers.origin&&req.headers.origin!==origin){send(403,{error:'Origin not allowed'});return;}
   if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,If-Match');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');}
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   async function body(){
    if(!(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(Error('JSON required'),{status:415});
    let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw Object.assign(Error('Request too large'),{status:413});parts.push(chunk);}
    try{return JSON.parse(Buffer.concat(parts).toString())}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}
   }
   if(path==='/api/health'&&req.method==='GET'){send(200,{ok:true});return;}
   if(path==='/api/login'&&req.method==='POST'){
    const data=await body();const username=String(data.username||'').toLowerCase();const password=String(data.password||'');
    if(username.length>40||password.length>128){send(400,{error:'Invalid credentials'});return;}
    const now=Date.now(), key=req.socket.remoteAddress, count=attempts.get(key)||{n:0,reset:now+900000};
    if(count.reset<now){count.n=0;count.reset=now+900000;}if(count.n>=20){send(429,{error:'Too many attempts. Try again in 15 minutes.'});return;}count.n++;attempts.set(key,count);
    const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);const valid=await passwordMatches(password,user?.password||await dummy);
    if(!valid||!user?.active){send(401,{error:'Invalid username or password'});return;}
    const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,now+12*3600000);
    db.prepare('INSERT INTO audit(user_id,event,time) VALUES(?,?,?)').run(user.id,'login',now);
    send(200,{token,user:{username:user.username,role:user.role}});return;
   }
   const shareMatch=path.match(/^\/api\/track\/([a-f0-9]{64})$/);
   if(shareMatch&&req.method==='GET'){
    const record=db.prepare('SELECT payload FROM shares WHERE token_hash=? AND expires>?').get(digest(shareMatch[1]),Date.now());
    if(!record){send(404,{error:'Tracking link unavailable or expired'});return;}send(200,JSON.parse(record.payload));return;
   }
   if(path.startsWith('/api/')){
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    const user=db.prepare('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').get(digest(token),Date.now());
    if(!user){send(401,{error:'Please sign in'});return;}
    if(path==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));send(200,{ok:true});return;}
    if(path==='/api/state'&&req.method==='GET'){const row=db.prepare('SELECT * FROM states WHERE user_id=?').get(user.id);send(200,{version:row.version,data:JSON.parse(row.data)});return;}
    if(path==='/api/state'&&req.method==='PUT'){
     const next=await body();const row=db.prepare('SELECT * FROM states WHERE user_id=?').get(user.id);
     if(req.headers['if-match']!==String(row.version)){send(409,{error:'Another session changed these records. Export unsaved work and reload.'});return;}
     let validated;try{validated=validateState(next,JSON.parse(row.data),user.role)}catch(e){send(422,{error:e.message});return;}
     db.exec('BEGIN IMMEDIATE');try{
      const update=db.prepare('UPDATE states SET data=?,version=version+1 WHERE user_id=? AND version=?').run(JSON.stringify(validated),user.id,row.version);if(update.changes!==1)throw Error('Concurrent update');
      db.prepare('INSERT INTO snapshots(user_id,data,time) VALUES(?,?,?)').run(user.id,row.data,Date.now());
      db.prepare('DELETE FROM snapshots WHERE user_id=? AND id NOT IN (SELECT id FROM snapshots WHERE user_id=? ORDER BY id DESC LIMIT 5)').run(user.id,user.id);
      db.prepare('INSERT INTO audit(user_id,event,time) VALUES(?,?,?)').run(user.id,'state_saved',Date.now());db.exec('COMMIT');
     }catch(e){db.exec('ROLLBACK');throw e;}
     send(200,{version:row.version+1});return;
    }
    if(path==='/api/admin/users'&&req.method==='GET'){
     if(user.role!=='admin'){send(403,{error:'Administrator required'});return;}
     const after=Math.max(0,Number(new URL(req.url,'http://localhost').searchParams.get('after'))||0);
     const users=db.prepare('SELECT id,username,role,active FROM users WHERE id>? ORDER BY id LIMIT 100').all(after);
     send(200,{users,next:users.length===100?users.at(-1).id:null});return;
    }
    const report=path.match(/^\/api\/admin\/users\/([1-9][0-9]*)\/reports$/);
    if(report&&req.method==='GET'){
     if(user.role!=='admin'){send(403,{error:'Administrator required'});return;}
     const row=db.prepare('SELECT data FROM states WHERE user_id=?').get(Number(report[1]));if(!row){send(404,{error:'User not found'});return;}
     const data=JSON.parse(row.data);send(200,{rides:JSON.parse(data.rides||'[]'),fuel:JSON.parse(data.fuel_logs||'[]'),repairs:JSON.parse(data.repair_logs||'[]')});return;
    }
    if(path==='/api/admin/users'&&req.method==='POST'){
     if(user.role!=='admin'){send(403,{error:'Administrator required'});return;}
     const data=await body(),accessKey=randomBytes(32).toString('hex');
     if(typeof data.username!=='string'||!/^[a-zA-Z0-9_.-]{3,40}$/.test(data.username)||!['driver','admin'].includes(data.role)){send(400,{error:'Invalid account'});return;}
     if(db.prepare('SELECT id FROM users WHERE username=?').get(data.username.toLowerCase())){send(409,{error:'Username already exists'});return;}
     await addUser(db,data.username,accessKey,data.role);send(201,{username:data.username.toLowerCase(),accessKey});return;
    }
    const account=path.match(/^\/api\/admin\/users\/([1-9][0-9]*)\/(enable|disable|password)$/);
    if(account&&req.method==='POST'){
     if(user.role!=='admin'){send(403,{error:'Administrator required'});return;}
     const id=Number(account[1]);if(!db.prepare('SELECT id FROM users WHERE id=?').get(id)){send(404,{error:'User not found'});return;}
     if(id===user.id&&account[2]==='disable'){send(400,{error:'You cannot disable your own account'});return;}
     const accessKey=account[2]==='password'?randomBytes(32).toString('hex'):undefined;
     const hashed=accessKey?await passwordHash(accessKey):null;
     db.exec('BEGIN IMMEDIATE');try{
      if(hashed)db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed,id);else db.prepare('UPDATE users SET active=? WHERE id=?').run(account[2]==='enable'?1:0,id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM shares WHERE user_id=?').run(id);
      db.prepare('INSERT INTO audit(user_id,event,time) VALUES(?,?,?)').run(user.id,'account_'+account[2]+':'+id,Date.now());db.exec('COMMIT');
     }catch(e){db.exec('ROLLBACK');throw e;}
     send(200,{ok:true,...(accessKey?{accessKey}:{})});return;
    }
    if(path==='/api/track'&&req.method==='POST'){
     db.prepare('DELETE FROM shares WHERE expires<? OR user_id=?').run(Date.now(),user.id);
     const share=randomBytes(32).toString('hex');db.prepare('INSERT INTO shares VALUES(?,?,?,?)').run(digest(share),user.id,Date.now()+6*3600000,JSON.stringify({status:'waiting'}));send(201,{token:share});return;
    }
    if(shareMatch&&(req.method==='PUT'||req.method==='DELETE')){
     const hash=digest(shareMatch[1]);const owned=db.prepare('SELECT * FROM shares WHERE token_hash=? AND user_id=? AND expires>?').get(hash,user.id,Date.now());if(!owned){send(404,{error:'Share not found'});return;}
     if(req.method==='DELETE'){db.prepare('DELETE FROM shares WHERE token_hash=?').run(hash);send(200,{ok:true});return;}
     if(JSON.parse(owned.payload).status==='completed'){send(409,{error:'Ride tracking is completed'});return;}
     const p=await body();if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!Number.isFinite(p.currentFare)||p.currentFare<0||!['active','completed'].includes(p.status)){send(422,{error:'Invalid tracking update'});return;}
     const safe={id:shareMatch[1],lat:p.lat,lng:p.lng,currentFare:p.currentFare,distanceTraveled:String(p.distanceTraveled).slice(0,20),status:p.status,mode:String(p.mode||'').slice(0,20),timestamp:Date.now()};
     db.prepare('UPDATE shares SET payload=?,expires=? WHERE token_hash=?').run(JSON.stringify(safe),p.status==='completed'?Date.now()+900000:owned.expires,hash);send(200,{ok:true});return;
    }
    send(404,{error:'Not found'});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){send(405,{error:'Method not allowed'});return;}
   const publicPath=path==='/'?'/index.html':path;
   if(!/^\/(index\.html|manifest\.json|assets\/[a-zA-Z0-9_./-]+)$/.test(publicPath)||publicPath.includes('..')){send(404,{error:'Not found'});return;}
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
   try{const content=await readFile(resolve(root,'.'+publicPath));res.writeHead(200,{'Content-Type':types[extname(publicPath)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);}catch{send(404,{error:'Not found'});}
  } catch(e) {if(!res.headersSent)send(e.status||500,{error:e.status?e.message:'Server request failed'});else res.end();}
 });
 server.on('close',()=>db.close());return {server,db};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const port=Number(process.env.PORT||5055);createApp().server.listen(port,'127.0.0.1',()=>console.log(`Taxi server: http://localhost:${port}`));}
