// Cloudflare Worker: requires the DB binding and nodejs_compat.
// No secrets belong in this file. SETUP_TOKEN is a temporary Worker Secret.
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const randomLink = () => randomBytes(18).toString('base64url'); // 144-bit compact passenger capability
// Login keys are 256-bit random secrets, never human-chosen passwords.
// SHA-256 is appropriate here because offline guessing a random 256-bit key is infeasible.
function keyMatches(key, stored) {
 return timingSafeEqual(Buffer.from(digest(key), 'hex'), Buffer.from(stored, 'hex'));
}
const ORIGIN = 'https://sparkles-systems-solutions.github.io';
const MAX_BYTES = 750000; // Headroom below D1's 2 MB row limit, including SQL snapshots.
export function validateState(state,previous,role,{historicalImport=false}={}) {
 if(!state||Array.isArray(state)||typeof state!=='object')throw Error('Invalid state');
 const allowed=new Set(['settings','rides','fuel_logs','repair_logs','amt_schedules','system_logs','local_backups','amt_ride_state','amt_pending_payment','auto_backup_pref']);
 for(const [key,value] of Object.entries(state)) {
  if(!allowed.has(key)&&!/^cnt_\d{4}$/.test(key))throw Error('Unknown data key');
  if(typeof value!=='string')throw Error('Invalid stored value');
 }
 const settings=JSON.parse(state.settings);const before=JSON.parse(previous.settings);
 if(!settings||typeof settings!=='object'||['base','rate','waitRate','nightPercent'].some(k=>!Number.isFinite(settings[k])||settings[k]<0||settings[k]>1000000))throw Error('Invalid tariff');
 for(const name of ['deliveryTariff','scheduleTariff'])if(settings[name]!=null&&(!settings[name]||typeof settings[name]!=='object'||['base','rate','waitRate','nightPercent'].some(k=>!Number.isFinite(settings[name][k])||settings[name][k]<0||settings[name][k]>1000000)))throw Error('Invalid '+name);
 if('password' in settings)throw Error('Passwords must not be stored in app settings');
 // State is scoped to the authenticated user; drivers own their tariff settings.
 const textLimits={appName:120,receiptName:120,address:300,businessMobile:40,email:120,website:200,receiptFooter:300};
 for(const [key,limit] of Object.entries(textLimits))if(typeof (settings[key]??'')!=='string'||(settings[key]||'').length>limit)throw Error('Invalid app configuration');
 if(!['en','bi'].includes(settings.language||'bi')||![7,30,90].includes(Number(settings.linkDays||30)))throw Error('Invalid app preference');
 if(typeof (settings.logoData||'')!=='string'||(settings.logoData||'').length>220000||((settings.logoData||'')&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(settings.logoData)))throw Error('Invalid logo');
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
  const tariff=ride.mode==='Delivery'?(settings.deliveryTariff||settings):ride.mode==='Booked Ride'?(settings.scheduleTariff||settings):settings;
  let amount=(manualFare>0?manualFare:tariff.base+Math.max(0,ride.km-1)*tariff.rate)+wait*tariff.waitRate-disc;
  if(ride.nightUsed)amount*=1+tariff.nightPercent/100;
  if(ride.fare!==Math.max(0,Math.round(amount)))throw Error('Fare does not match server tariff');
  ride.tariff={...Object.fromEntries(['appName','receiptName','address','businessMobile','email','website','receiptFooter','language'].map(k=>[k,settings[k]??''])),...Object.fromEntries(['base','rate','waitRate','nightPercent'].map(k=>[k,tariff[k]??0]))};
 }
 for(const id of old.keys())if(!ids.has(id))throw Error('Paid receipts cannot be deleted');
 for(const [key,fields] of [['fuel_logs',['liters','price','total']],['repair_logs',['cost']]])for(const r of JSON.parse(state[key]||'[]'))if(!r||!Number.isFinite(r.id)||!Number.isFinite(Date.parse(r.date))||fields.some(k=>!Number.isFinite(r[k])||r[k]<0))throw Error('Invalid expense');
 for(const r of JSON.parse(state.amt_schedules||'[]'))if(!r||!Number.isFinite(r.id)||!Number.isFinite(Date.parse(r.datetime))||['name','phone','start','end','notes'].some(k=>r[k]!=null&&typeof r[k]!=='string')||['km','manualFare'].some(k=>r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0)))throw Error('Invalid booking');
 state.rides=JSON.stringify(rides);return state;
}

const setupPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Taxi account setup</title><style>body{font:18px system-ui;max-width:440px;margin:40px auto;padding:20px;background:#101827;color:#fff}label{display:block;margin-top:20px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;font:inherit}button{cursor:pointer}p{line-height:1.5}</style><h1>Create your first account</h1><p>Enter your temporary Cloudflare setup secret and choose your taxi username. A random login key will be shown once; save it in your password manager. Setup closes after the first account is created.</p><form method="post" action="/setup"><label>Setup token<input name="setupToken" type="password" required autocomplete="off" maxlength="256"></label><label>Username<input name="username" required pattern="[a-zA-Z0-9_.-]{3,40}" autocomplete="username"></label><button>Create account</button></form></html>`;
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function usernameFrom(data) {
 if (!data || typeof data.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(data.username)) fail(400, 'Use a 3–40 character username (letters, numbers, dot, dash or underscore).');
 return data.username.toLowerCase();
}
async function readBody(request, limit = MAX_BYTES) {
 const reader = request.body?.getReader();
 if (!reader) fail(400, 'Request body required');
 const chunks=[]; let size=0;
 for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength;
  if(size>limit){await reader.cancel();fail(413,'Data limit reached. Export your records and contact the administrator.');} chunks.push(value); }
 const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
 return new TextDecoder().decode(all);
}
async function jsonBody(request, limit) {
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))fail(415,'JSON required');
 try {return JSON.parse(await readBody(request,limit));}catch(e){if(e.status)throw e;fail(400,'Invalid JSON');}
}
export default {
 async fetch(request, env) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000','Vary':'Origin'};
  const send=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  // Native form POSTs with no-referrer send Origin: null (Fetch Standard).
  // Preserve the setup form's same-origin identity; keep exact Origin checks.
  const html=(status,text)=>new Response(text,{status,headers:{...headers,'Referrer-Policy':'same-origin','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  try {
   const origin=request.headers.get('Origin');
   if(origin && origin!==ORIGIN && !(['/setup','/account'].includes(path)&&origin===url.origin))fail(403,'Origin not allowed');
   if(origin===ORIGIN){headers['Access-Control-Allow-Origin']=ORIGIN;headers['Access-Control-Allow-Headers']='Authorization,Content-Type,If-Match';headers['Access-Control-Allow-Methods']='GET,POST,PUT,DELETE,OPTIONS';}
   if(method==='OPTIONS')return new Response(null,{status:204,headers});
   if(!env.DB)fail(503,'DB binding is missing');
   const db=env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
   const q=(sql,...args)=>db.prepare(sql).bind(...args);
   const now=Date.now();
   let rideLinksReady=false;
   async function ensureRideLinks(){if(rideLinksReady)return;await q('CREATE TABLE IF NOT EXISTS ride_links(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),ride_id TEXT NOT NULL,expires INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,ride_id))').run();rideLinksReady=true;}
   const publicReceipt=(ride,settings={})=>({id:ride.id,time:ride.time,startTime:ride.startTime,km:ride.km,fare:ride.fare,from:String(ride.from||'').slice(0,500),to:String(ride.to||'').slice(0,500),wait:ride.wait||0,disc:ride.disc||0,nightUsed:!!ride.nightUsed,mode:String(ride.mode||'').slice(0,40),stops:Array.isArray(ride.stops)?ride.stops.slice(0,5).map(x=>String(x).slice(0,500)):[],payment:{method:String(ride.payment?.method||'Paid').slice(0,40)},business:{base:settings.base||0,rate:settings.rate||0,waitRate:settings.waitRate||0,nightPercent:settings.nightPercent||0,appName:settings.appName||'Taxi',receiptName:settings.receiptName||'Official Receipt',logoData:settings.logoData||'',address:settings.address||'',businessMobile:settings.businessMobile||'',email:settings.email||'',website:settings.website||'',receiptFooter:settings.receiptFooter||'',language:settings.language||'bi'}});
   const safeRoute=route=>route&&typeof route==='object'?{destination:String(route.destination||'').slice(0,300),stops:Array.isArray(route.stops)?route.stops.slice(0,5).map(x=>String(x).slice(0,300)):[],estimatedRemainingKm:Number.isFinite(route.estimatedRemainingKm)?Math.max(0,route.estimatedRemainingKm):null,revision:Math.max(0,Math.floor(Number(route.revision)||0))}:undefined;
   async function throttle(scope,identity,max) {
    const key=digest(scope+':'+identity);
    const r=await q(`INSERT INTO attempts(key,n,reset) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN reset<=? THEN 1 ELSE n+1 END, reset=CASE WHEN reset<=? THEN excluded.reset ELSE reset END RETURNING n`,key,now+900000,now,now).first();
    if(r.n>max)fail(429,'Too many attempts. Try again in 15 minutes.');
   }
   if(path==='/api/health'&&method==='GET'){
    await q('SELECT version FROM states LIMIT 1').first();
    return send(200,{ok:true,service:'taxi-api',storage:'D1'});
   }
   if(path==='/'&&method==='GET')return send(200,{service:'Taxi API',health:'/api/health',setup:'/setup'});
   if(path==='/setup'){
    if(!env.SETUP_TOKEN || env.SETUP_TOKEN.length<32 || await q('SELECT id FROM users LIMIT 1').first())fail(404,'Setup is closed');
    if(method==='GET')return html(200,setupPage);
    if(method!=='POST')fail(405,'Method not allowed');
    if(origin!==url.origin)fail(403,'Open the setup form on this Worker address');
    await throttle('setup',request.headers.get('CF-Connecting-IP')||'unknown',10);
    if(!(request.headers.get('Content-Type')||'').startsWith('application/x-www-form-urlencoded'))fail(415,'Use the setup form');
    const form=new URLSearchParams(await readBody(request,4096));
    if(!timingSafeEqual(Buffer.from(digest(form.get('setupToken')||''),'hex'),Buffer.from(digest(env.SETUP_TOKEN),'hex')))fail(403,'Invalid setup token');
    const username=usernameFrom(Object.fromEntries(form));
    const accessKey=random(), hashed=digest(accessKey);
    const result=await q("INSERT INTO users(id,username,password,role) SELECT 1,?,?,'admin' WHERE NOT EXISTS(SELECT 1 FROM users)",username,hashed).run();
    if(!result.meta.changes)fail(409,'Setup is already completed');
    return html(201,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:600px;margin:30px auto;padding:20px}code{display:block;overflow-wrap:anywhere;padding:16px;background:#eee}</style><h1>Account created</h1><p>Username: <strong>${username}</strong></p><p>Your login key (shown only now):</p><code>${accessKey}</code><p>Save this key in your password manager before closing this page. Use it in the taxi app login key field. Do not send it in chat or screenshots.</p><p>Remove SETUP_TOKEN from Cloudflare Settings after saving the key.</p>`);
   }
   if(path==='/account'){
    if(method==='GET')return html(200,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Change taxi login key</title><style>body{font:18px system-ui;max-width:480px;margin:30px auto;padding:20px;background:#101827;color:white}label{display:block;margin-top:20px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;font:inherit}p{line-height:1.5}</style><h1>Change login key</h1><p>Enter your username and current login key. A new key will be shown once. Save it before closing the page. Your previous key, sessions and tracking links will stop working.</p><form action="/account" method="post"><label>Username<input name="username" autocomplete="username" required pattern="[a-zA-Z0-9_.-]{3,40}"></label><label>Current login key<input name="currentKey" type="password" autocomplete="current-password" required minlength="64" maxlength="64" pattern="[a-f0-9]{64}"></label><button>Generate new login key</button></form></html>`);
    if(method!=='POST')fail(405,'Method not allowed');
    if(origin!==url.origin)fail(403,'Open the account form on this Worker address');
    if(!(request.headers.get('Content-Type')||'').startsWith('application/x-www-form-urlencoded'))fail(415,'Use the account form');
    const form=new URLSearchParams(await readBody(request,4096));
    const username=usernameFrom(Object.fromEntries(form)),currentKey=form.get('currentKey')||'';
    await throttle('login-ip',request.headers.get('CF-Connecting-IP')||'unknown',20);
    await throttle('login-user',username,20);
    const account=await q('SELECT * FROM users WHERE username=?',username).first();
    if(!keyMatches(currentKey,account?.password||'00'.repeat(32))||!account?.active)fail(401,'Invalid username or login key');
    const accessKey=random(),hash=digest(accessKey);
    // Conditional update and revocation run in one transaction. A stale key cannot win twice.
    const changes=await db.batch([
     q('UPDATE users SET password=? WHERE id=? AND password=? AND active=1',hash,account.id,account.password),
     q('DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)',account.id,account.id,hash),
     q('DELETE FROM shares WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)',account.id,account.id,hash),
     q("INSERT INTO audit(user_id,event,time) SELECT ?,'self_key_rotated',? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)",account.id,now,account.id,hash)
    ]);
    if(!changes[0].meta.changes)fail(409,'This login key was already changed. Use the newest saved key.');
    return html(200,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:600px;margin:30px auto;padding:20px}code{display:block;overflow-wrap:anywhere;padding:16px;background:#eee}</style><h1>Login key changed</h1><p>Username: <strong>${username}</strong></p><p>Your new login key (shown only now):</p><code>${accessKey}</code><p>Save it in your password manager before closing this page. Do not share it in chat or screenshots. Your old key, sessions and tracking links have been revoked.</p>`);
   }
   if(path==='/api/login'&&method==='POST'){
    const data=await jsonBody(request,4096);
    if(!data||typeof data.username!=='string'||typeof data.password!=='string'||data.username.length>40||data.password.length>128)fail(400,'Invalid credentials');
    const username=data.username.toLowerCase();
    await throttle('login-ip',request.headers.get('CF-Connecting-IP')||'unknown',20);
    await throttle('login-user',username,20);
    const user=await q('SELECT * FROM users WHERE username=?',username).first();
    // Compare fixed-length hashes; all credentials are server-generated random keys.
    const valid=keyMatches(data.password,user?.password||'00'.repeat(32));
    if(!valid||!user?.active)fail(401,'Invalid username or login key');
    const token=random();
    const sessionWrite=await db.batch([
     q('DELETE FROM sessions WHERE expires<=?',now),q('DELETE FROM attempts WHERE reset<=?',now),q('DELETE FROM shares WHERE expires<=?',now),
     q('INSERT INTO sessions(token_hash,user_id,expires) SELECT ?,id,? FROM users WHERE id=? AND password=? AND active=1',digest(token),now+12*3600000,user.id,user.password),
     q('INSERT INTO audit(user_id,event,time) VALUES(?,?,?)',user.id,'login',now)
    ]);
    if(!sessionWrite[3].meta.changes)fail(401,'Login key changed. Sign in with your newest key.');
    return send(200,{token,user:{username:user.username,role:user.role}});
   }
   const shareMatch=path.match(/^\/api\/track\/((?:[A-Za-z0-9_-]{24}|[a-f0-9]{64}))$/);
   if(shareMatch&&method==='GET'){
    await ensureRideLinks();
    const row=await q('SELECT payload FROM ride_links WHERE token_hash=? AND expires>?',digest(shareMatch[1]),now).first()||await q('SELECT payload FROM shares WHERE token_hash=? AND expires>?',digest(shareMatch[1]),now).first();
    if(!row)fail(404,'Tracking link unavailable or expired');return send(200,JSON.parse(row.payload));
   }
   if(!path.startsWith('/api/'))fail(404,'Not found');
   const bearer=request.headers.get('Authorization')||'';
   if(!/^Bearer [a-f0-9]{64}$/.test(bearer))fail(401,'Please sign in');
   const tokenHash=digest(bearer.slice(7));
   const user=await q('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1',tokenHash,now).first();
   if(!user)fail(401,'Please sign in');
   if(path==='/api/logout'&&method==='POST'){await q('DELETE FROM sessions WHERE token_hash=?',tokenHash).run();return send(200,{ok:true});}
   if(path==='/api/state'&&method==='GET'){
    const row=await q('SELECT version,data FROM states WHERE user_id=?',user.id).first();return send(200,{version:row.version,data:JSON.parse(row.data)});
   }
   if(path==='/api/state'&&method==='PUT'){
    const next=await jsonBody(request),row=await q('SELECT version,data FROM states WHERE user_id=?',user.id).first();
    if(request.headers.get('If-Match')!==String(row.version))fail(409,'Another session changed these records. Export unsaved work and reload.');
    let validated;try{validated=validateState(next,JSON.parse(row.data),user.role);}catch(e){fail(422,e.message);}
    const serialized=JSON.stringify(validated);if(new TextEncoder().encode(serialized).length>MAX_BYTES)fail(413,'Account data limit reached. Export your records and contact the administrator.');
    // CAS plus SQLite triggers: update, snapshot and audit succeed or roll back together.
    const result=await q('UPDATE states SET data=?,version=version+1 WHERE user_id=? AND version=?',serialized,user.id,row.version).run();
    if(result.meta.changes===0)fail(409,'Another session changed these records. Export unsaved work and reload.');
    return send(200,{version:row.version+1});
   }
   if(path==='/api/track'&&method==='POST'){
    await ensureRideLinks();
    const data=(request.headers.get('Content-Type')||'').startsWith('application/json')?await jsonBody(request,4096):{},rideId=String(data?.rideId||'');
    if(!rideId){const token=randomLink();await q(`INSERT INTO shares(token_hash,user_id,expires,payload) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,payload=excluded.payload`,digest(token),user.id,now+6*3600000,'{"status":"waiting"}').run();return send(201,{token});}
    if(!/^[A-Za-z0-9_.:-]{1,100}$/.test(rideId))fail(400,'Invalid ride ID');
    await q('DELETE FROM ride_links WHERE expires<=?',now).run();
    const token=randomLink();
    try{await q('INSERT INTO ride_links(token_hash,user_id,ride_id,expires,payload) VALUES(?,?,?,?,?)',digest(token),user.id,rideId,now+24*3600000,JSON.stringify({status:'waiting',rideId,timestamp:now})).run();}
    catch(e){fail(409,'This ride already has a passenger link. Reopen it from the active ride button.');}
    return send(201,{token});
   }
   if(shareMatch&&['PUT','DELETE'].includes(method)){
    await ensureRideLinks();
    const hash=digest(shareMatch[1]);
    const owned=await q('SELECT ride_id,expires,payload FROM ride_links WHERE token_hash=? AND user_id=? AND expires>?',hash,user.id,now).first();
    if(!owned){const legacy=await q('SELECT expires,payload FROM shares WHERE token_hash=? AND user_id=? AND expires>?',hash,user.id,now).first();if(!legacy)fail(404,'Share not found');if(method==='DELETE'){await q('DELETE FROM shares WHERE token_hash=? AND user_id=?',hash,user.id).run();return send(200,{ok:true});}const p=await jsonBody(request,8192);if(JSON.parse(legacy.payload).status==='completed')fail(409,'Ride tracking is completed');if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!Number.isFinite(p.currentFare)||p.currentFare<0||!['active','completed'].includes(p.status))fail(422,'Invalid tracking update');const safe={id:shareMatch[1],lat:p.lat,lng:p.lng,currentFare:p.currentFare,distanceTraveled:String(p.distanceTraveled).slice(0,20),status:p.status,mode:String(p.mode||'').slice(0,20),timestamp:now};await q('UPDATE shares SET payload=?,expires=? WHERE token_hash=? AND user_id=?',JSON.stringify(safe),p.status==='completed'?now+900000:legacy.expires,hash,user.id).run();return send(200,{ok:true});}
    if(method==='DELETE'){await q('DELETE FROM ride_links WHERE token_hash=? AND user_id=?',hash,user.id).run();return send(200,{ok:true});}
    const p=await jsonBody(request,8192);
    if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!Number.isFinite(p.currentFare)||p.currentFare<0||!['active','completed'].includes(p.status))fail(422,'Invalid tracking update');
    const prior=JSON.parse(owned.payload);if(prior.status==='completed'&&p.status!=='completed')fail(409,'Ride tracking is completed');
    const safe={id:shareMatch[1],rideId:owned.ride_id,lat:p.lat,lng:p.lng,currentFare:p.currentFare,distanceTraveled:String(p.distanceTraveled).slice(0,20),status:p.status,mode:String(p.mode||'').slice(0,20),timestamp:now,route:safeRoute(p.route)||prior.route};
    let expires=owned.expires;
    if(p.status==='completed'&&typeof p.receiptId==='string'){
     const state=await q('SELECT data FROM states WHERE user_id=?',user.id).first(),stored=JSON.parse(state.data),ride=JSON.parse(stored.rides||'[]').find(r=>r.id===p.receiptId);
     if(!ride)fail(409,'Save payment before publishing the receipt');
     safe.receipt=publicReceipt(ride,JSON.parse(stored.settings||'{}'));expires=now+([7,30,90].includes(Number(p.linkDays))?Number(p.linkDays):30)*86400000;
    }else if(prior.receipt){safe.receipt=prior.receipt;expires=owned.expires;}
    const r=await q('UPDATE ride_links SET payload=?,expires=? WHERE token_hash=? AND user_id=? AND expires>?',JSON.stringify(safe),expires,hash,user.id,now).run();
    if(!r.meta.changes)fail(404,'Share not found');return send(200,{ok:true});
   }
   if(path==='/api/admin/users'&&method==='GET'){
    if(user.role!=='admin')fail(403,'Administrator required');
    const after=Math.max(0,Number(url.searchParams.get('after'))||0);
    const rows=await q('SELECT id,username,role,active FROM users WHERE id>? ORDER BY id LIMIT 100',after).all();
    return send(200,{users:rows.results,next:rows.results.length===100?rows.results.at(-1).id:null});
   }
   const reportMatch=path.match(/^\/api\/admin\/users\/([1-9][0-9]*)\/reports$/);
   if(reportMatch&&method==='GET'){
    if(user.role!=='admin')fail(403,'Administrator required');
    const row=await q('SELECT data FROM states WHERE user_id=?',Number(reportMatch[1])).first();
    if(!row)fail(404,'User not found');
    const data=JSON.parse(row.data);
    return send(200,{rides:JSON.parse(data.rides||'[]'),fuel:JSON.parse(data.fuel_logs||'[]'),repairs:JSON.parse(data.repair_logs||'[]')});
   }
   if(path==='/api/admin/users'&&method==='POST'){
    if(user.role!=='admin')fail(403,'Administrator required');
    const data=await jsonBody(request,4096),username=usernameFrom(data);
    if(!['admin','driver'].includes(data.role))fail(400,'Invalid role');
    const accessKey=random(), hashed=digest(accessKey);
    const r=await q('INSERT INTO users(username,password,role) VALUES(?,?,?) ON CONFLICT(username) DO NOTHING',username,hashed,data.role).run();
    if(!r.meta.changes)fail(409,'Username already exists');return send(201,{ok:true,username,accessKey});
   }
   const accountMatch=path.match(/^\/api\/admin\/users\/([1-9][0-9]*)\/(password|disable|enable)$/);
   if(accountMatch&&method==='POST'){
    if(user.role!=='admin')fail(403,'Administrator required');
    const id=Number(accountMatch[1]);
    if(!await q('SELECT id FROM users WHERE id=?',id).first())fail(404,'User not found');
    if(accountMatch[2]==='disable'&&id===user.id)fail(400,'You cannot disable your own account');
    let update, accessKey;
    if(accountMatch[2]==='password'){
     accessKey=random();
     update=q('UPDATE users SET password=? WHERE id=?',digest(accessKey),id);
    }else update=q('UPDATE users SET active=? WHERE id=?',accountMatch[2]==='enable'?1:0,id);
    await ensureRideLinks();
    await db.batch([update,q('DELETE FROM sessions WHERE user_id=?',id),q('DELETE FROM shares WHERE user_id=?',id),q('DELETE FROM ride_links WHERE user_id=? AND json_extract(payload,\'$.status\')!=\'completed\'',id),q('INSERT INTO audit(user_id,event,time) VALUES(?,?,?)',user.id,'account_'+accountMatch[2]+':'+id,now)]);
    return send(200,{ok:true,...(accessKey?{accessKey}:{})});
   }
   fail(404,'Not found');
  }catch(e){return send(e.status||503,{error:e.status?e.message:'Backend unavailable. Check the D1 schema and Worker logs.'});}
 }
};
