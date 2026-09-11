import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../cloudflare/worker.mjs';
import { validateState as originalValidator } from '../server/store.mjs';
import { validateState } from '../cloudflare/worker.mjs';

// Actual SQLite SQL/triggers behind a D1-shaped adapter, not a workerd runtime test.
function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 const adapter={sqlite,withSession(){return this;},prepare(sql){
  const make=args=>({bind(...values){return make(values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}});return make([]);
 },async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return adapter;
}
const ORIGIN='https://sparkles-systems-solutions.github.io',BASE='https://odd-sun-eecf.dilshan7878787.workers.dev';
const SETUP='test-only-setup-token-abcdefghijklmnopqrstuvwxyz';
const PASSWORD='test-only-password-12345';
function client(env){return async(path,{method='GET',data,token,headers={}}={})=>{
 const r=await worker.fetch(new Request(BASE+path,{method,headers:{Origin:ORIGIN,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:data?JSON.stringify(data):undefined}),env);
 const text=await r.text();let body;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,headers:r.headers};
};}
async function setup(env,token=SETUP){return worker.fetch(new Request(BASE+'/setup',{method:'POST',headers:{Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({setupToken:token,username:'admin',password:PASSWORD})}),env);}

test('Worker with real SQLite: authorization, transactions and data validation',async t=>{
 const DB=database(),env={DB,SETUP_TOKEN:SETUP},call=client(env);t.after(()=>DB.sqlite.close());
 let admin,driver,state,share,adminKey,driverKey;
 await t.test('health checks schema and CORS rejects other origins',async()=>{
  assert.equal((await call('/api/health')).status,200);
  assert.equal((await call('/api/state')).status,401);
  assert.equal((await call('/api/health',{headers:{Origin:'https://evil.example'}})).status,403);
  const r=await call('/api/state',{method:'OPTIONS'});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);
 });
 await t.test('setup requires secret, creates hashed admin, then closes',async()=>{
  assert.equal((await setup(env,'wrong')).status,403);const created=await setup(env);assert.equal(created.status,201);adminKey=(await created.text()).match(/<code>([a-f0-9]{64})<\/code>/)[1];
  assert.notEqual(DB.sqlite.prepare('SELECT password FROM users').get().password,adminKey);
  assert.equal((await setup(env)).status,404);assert.equal((await call('/setup',{headers:{Origin:BASE}})).status,404);
 });
 await t.test('wrong key rejected, admin login successful',async()=>{
  assert.equal((await call('/api/login',{method:'POST',data:{username:'admin',password:'wrong'}})).status,401);
  const r=await call('/api/login',{method:'POST',data:{username:'admin',password:adminKey}});assert.equal(r.status,200);admin=r.body.token;
 });
 await t.test('admin creates driver; users are isolated',async()=>{
  const created=await call('/api/admin/users',{method:'POST',token:admin,data:{username:'driver',role:'driver'}});assert.equal(created.status,201);driverKey=created.body.accessKey;assert.match(driverKey,/^[a-f0-9]{64}$/);
  driver=(await call('/api/login',{method:'POST',data:{username:'driver',password:driverKey}})).body.token;
  state=(await call('/api/state',{token:admin})).body;
  const updated={...state.data,settings:JSON.stringify({...JSON.parse(state.data.settings),base:120})};
  assert.equal((await call('/api/state',{method:'PUT',token:admin,headers:{'If-Match':'0'},data:updated})).status,200);
  const other=(await call('/api/state',{token:driver})).body;assert.equal(JSON.parse(other.data.settings).base,100);
  assert.equal((await call('/api/state',{method:'PUT',token:driver,headers:{'If-Match':'0'},data:updated})).status,422);
  assert.equal((await call('/api/admin/users',{method:'POST',token:driver,data:{username:'intruder',password:PASSWORD,role:'admin'}})).status,403);
 });
 await t.test('stale writes rejected; simultaneous writes produce one winner',async()=>{
  assert.equal((await call('/api/state',{method:'PUT',token:admin,headers:{'If-Match':'0'},data:state.data})).status,409);
  state=(await call('/api/state',{token:admin})).body;
  const responses=await Promise.all([1,2].map(()=>call('/api/state',{method:'PUT',token:admin,headers:{'If-Match':String(state.version)},data:state.data})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM snapshots WHERE user_id=1').get().n,2);
 });
 await t.test('tampered fare rejected; paid receipts immutable',async()=>{
  state=(await call('/api/state',{token:admin})).body;
  const next=structuredClone(state.data);next.rides=JSON.stringify([{id:'receipt-1',km:2,fare:1,time:Date.now()}]);
  const put=data=>call('/api/state',{method:'PUT',token:admin,headers:{'If-Match':String(state.version)},data});
  assert.equal((await put(next)).status,422);next.rides=JSON.stringify([{id:'receipt-1',km:2,fare:200,time:Date.now()}]);
  assert.equal((await put(next)).status,200);state=(await call('/api/state',{token:admin})).body;
  assert.equal((await put({...state.data,rides:'[]'})).status,422);
 });
 await t.test('snapshot failure rolls state update back',async()=>{
  state=(await call('/api/state',{token:admin})).body;
  DB.sqlite.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await call('/api/state',{method:'PUT',token:admin,headers:{'If-Match':String(state.version)},data:state.data})).status,503);
  assert.equal((await call('/api/state',{token:admin})).body.version,state.version);DB.sqlite.exec('DROP TRIGGER fail_snapshot');
 });
 await t.test('oversized state rejected without modification',async()=>{
  assert.equal((await call('/api/state',{method:'PUT',token:admin,headers:{'If-Match':String(state.version)},data:{...state.data,local_backups:'x'.repeat(750001)}})).status,413);
 });
 await t.test('tracking ownership and privacy; replacement revokes old capability',async()=>{
  share=(await call('/api/track',{method:'POST',token:admin})).body.token;
  const data={lat:6.9,lng:79.8,currentFare:200,status:'active',customerPhone:'private',customerName:'private'};
  assert.equal((await call('/api/track/'+share,{method:'PUT',token:driver,data})).status,404);
  assert.equal((await call('/api/track/'+share,{method:'PUT',token:admin,data})).status,200);
  const publicData=(await call('/api/track/'+share)).body;assert.equal(publicData.customerPhone,undefined);assert.equal(publicData.customerName,undefined);
  const next=(await call('/api/track',{method:'POST',token:admin})).body.token;
  assert.equal((await call('/api/track/'+share)).status,404);share=next;
  assert.equal((await call('/api/track/'+share,{method:'DELETE',token:admin})).status,200);assert.equal((await call('/api/track/'+share)).status,404);
 });
 await t.test('rate limits survive Worker instance requests',async()=>{
  for(let i=0;i<21;i++)await call('/api/login',{method:'POST',data:{username:'missing',password:'wrong'},headers:{'CF-Connecting-IP':'192.0.2.7'}});
  assert.equal((await call('/api/login',{method:'POST',data:{username:'missing',password:'wrong'},headers:{'CF-Connecting-IP':'192.0.2.8'}})).status,429);
 });
 await t.test('key rotation and disabling revoke sessions',async()=>{
  const reset=await call('/api/admin/users/2/password',{method:'POST',token:admin});assert.equal(reset.status,200);driverKey=reset.body.accessKey;
  assert.equal((await call('/api/state',{token:driver})).status,401);
  DB.sqlite.exec('DELETE FROM attempts');
  driver=(await call('/api/login',{method:'POST',data:{username:'driver',password:driverKey}})).body.token;
  assert.equal((await call('/api/admin/users/2/disable',{method:'POST',token:admin})).status,200);
  assert.equal((await call('/api/state',{token:driver})).status,401);
 });
 await t.test('logout invalidates token and private files are never served',async()=>{
  assert.equal((await call('/cloudflare/schema.sql')).status,404);
  assert.equal((await call('/api/logout',{method:'POST',token:admin})).status,200);
  assert.equal((await call('/api/state',{token:admin})).status,401);
 });
});
test('Worker tariff validation remains identical to the Node backend',()=>assert.equal(validateState.toString(),originalValidator.toString()));
test('missing database fails closed',async()=>assert.equal((await client({})('/api/health')).status,503));
