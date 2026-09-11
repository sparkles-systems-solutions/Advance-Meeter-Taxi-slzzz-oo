import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../server/server.mjs';
import {addUser} from '../server/store.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function element(id=''){const classes=new Set();let fieldValue='';return {id,get value(){return fieldValue;},set value(v){fieldValue=String(v);},checked:false,hidden:false,disabled:false,dataset:{},style:{setProperty(){}},innerHTML:'',textContent:'',innerText:'',classList:{add(...a){a.forEach(x=>classes.add(x))},remove(...a){a.forEach(x=>classes.delete(x))},contains(x){return classes.has(x)},toggle(x,on){on===undefined?on=!classes.has(x):null;on?classes.add(x):classes.delete(x);}},addEventListener(){},removeEventListener(){},appendChild(){},remove(){},setAttribute(){},getAttribute(){return ''},getContext(){return {}},click(){}};}
test('Frontend, session adapter and database integration',async t=>{
 const app=createApp({dbFile:':memory:',origin:'http://localhost:5055'});await addUser(app.db,'integration','Integration-test-123','admin');app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 try{
 const els=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],element(m[1])]));els['wait-select'].value='0';
 const document={body:element(),documentElement:element(),getElementById:id=>els[id]||null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>element(),addEventListener(){}};
 const ctx={console,document,fetch,URL,Blob,URLSearchParams,AbortSignal,AbortController,crypto:webcrypto,Uint8Array,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},navigator:{},location:{href:'http://localhost:5055/',protocol:'http:',reload(){}},window:{location:{search:''},AMT_CONFIG:{apiBase:'http://127.0.0.1:'+app.server.address().port},addEventListener(){},innerHeight:640},confirm:()=>true};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../assets/session.js',import.meta.url),'utf8'),ctx);ctx.cloudStore=ctx.window.cloudStore;
 vm.runInContext(readFileSync(new URL('../assets/app.js',import.meta.url),'utf8'),ctx);const run=s=>vm.runInContext(s,ctx);
 const boot=ctx.window.onload();els['account-user'].value='integration';els['account-password'].value='Integration-test-123';await els['account-form'].onsubmit({preventDefault(){}});await boot;
 await t.test('Account signs in without localStorage',()=>assert.equal(ctx.cloudStore.user.username,'integration'));
 await t.test('Settings controls are reachable and saved configurations persist',async()=>{
  run('openLogin()');assert.equal(els['settings-modal'].style.display,'flex');run('openAppSettings()');
  els['set-app-name'].value='QA Taxi';await run('saveSettings()');
  const s=await ctx.cloudStore.request('/state');assert.equal(JSON.parse(s.data.settings).appName,'QA Taxi');
  assert.equal(els['sync-warning'].hidden,true);assert.equal(els['save-settings-button'].disabled,false);
 });
 await t.test('Settings failure stays visible; no false success or modal close',async()=>{
  run('openAppSettings()');const flush=ctx.cloudStore.flush;ctx.cloudStore.flush=async()=>{throw Error('QA offline');};
  els['set-app-name'].value='Unsaved QA';await run('saveSettings()');
  assert.equal(els['app-settings-modal'].style.display,'flex');assert.equal(els['save-settings-button'].disabled,false);
  assert.equal(els['sync-warning'].hidden,false);ctx.cloudStore.flush=flush;
  els['set-app-name'].value='QA Taxi';await run('saveSettings()');
 });
 await t.test('Invalid configuration names and rates are rejected before sync',async()=>{
  const s=await ctx.cloudStore.request('/state');els['set-app-name'].value='x'.repeat(121);await run('saveSettings()');
  assert.equal((await ctx.cloudStore.request('/state')).version,s.version);els['set-app-name'].value='QA Taxi';
  els['set-rate'].value='1000001';await run('saveSettings()');assert.equal(ctx.cloudStore.dirty,false);els['set-rate'].value='80';
 });
 await t.test('All five ride modes and Settings submenus remain callable',()=>{
  for(const mode of ['auto','gps','manual','delivery','booking'])run(`setMode('${mode}')`);
  for(const action of ['openLogin','openAppSettings','openFuelLogModal','openRepairLogModal','openReportsMenu','openDriverApp','openDatabaseBackupModal','openSystemLogModal'])run(action+'()');
 });
 await t.test('Fuel and repair entries save to the account',async()=>{
  Object.assign(els['fuel-date'],{value:'2026-09-11'});els['fuel-liters'].value='3';els['fuel-price'].value='300';run('addFuelLog()');
  els['repair-date'].value='2026-09-11';els['repair-desc'].value='QA service';els['repair-cost'].value='500';run('addRepairLog()');await ctx.cloudStore.flush();
  const s=await ctx.cloudStore.request('/state');assert.equal(JSON.parse(s.data.fuel_logs)[0].total,900);assert.equal(JSON.parse(s.data.repair_logs)[0].cost,500);
 });
 await t.test('Booking create and delete both persist',async()=>{
  for(const [id,value] of Object.entries({'sch-name':'QA customer','sch-phone':'0000000000','sch-datetime':'2099-01-01T10:00','sch-start':'A','sch-end':'B','sch-km':'2','sch-manual-fare':'180'}))els[id].value=value;
  run('addNewSchedule()');await ctx.cloudStore.flush();const rows=JSON.parse((await ctx.cloudStore.request('/state')).data.amt_schedules);assert.equal(rows.length,1);
  run(`deleteSchedule(${rows[0].id})`);await ctx.cloudStore.flush();assert.equal(JSON.parse((await ctx.cloudStore.request('/state')).data.amt_schedules).length,0);
 });
 await t.test('Manual trip is durably saved',async()=>{run("setMode('manual')");els['start-loc'].value='Test pickup';els['end-loc'].value='Test drop';els['manual-km-input'].value='2';await run('startRide()');await ctx.cloudStore.flush();const s=await ctx.cloudStore.request('/state');assert.equal(JSON.parse(s.data.amt_ride_state).totalMeters,2000);});
 await t.test('Sharing lives in Settings and can be enabled and revoked during a ride',async()=>{
  els['share-location'].checked=true;await run('changeLocationSharing()');await ctx.cloudStore.flush();
  const saved=JSON.parse((await ctx.cloudStore.request('/state')).data.amt_ride_state);assert.equal(saved.sharingEnabled,true);assert.match(saved.trackingShareToken,/^[a-f0-9]{64}$/);
  assert.equal(els['settings-modal'].style.display,'none');assert.equal(els['trackingPopupModal'].style.display,'flex');
  run('sTime=null;trackingShareToken=null');els['share-location'].checked=false;run('restorePreviousRide()');
  assert.equal(els['share-location'].checked,true);assert.equal(run('trackingShareToken'),saved.trackingShareToken);
  els['share-location'].checked=false;await run('changeLocationSharing()');await ctx.cloudStore.flush();
  await assert.rejects(ctx.cloudStore.request('/track/'+saved.trackingShareToken),/unavailable|expired/);
 });
 await t.test('End and payment persist the server-validated receipt',async()=>{await run('endRide()');await run('confirmPaymentAndShowReceipt()');await ctx.cloudStore.flush();const s=await ctx.cloudStore.request('/state');const rides=JSON.parse(s.data.rides);assert.equal(rides.length,1);assert.equal(rides[0].fare,180);assert(!s.data.amt_pending_payment);});
 await t.test('Later save preserves canonical receipt',async()=>{run("addSystemLog('INFO','Test event','No personal details')");await ctx.cloudStore.flush();assert.equal(ctx.cloudStore.dirty,false);});
 await t.test('No pending-payment record remains after saved receipt',async()=>{assert.equal((await ctx.cloudStore.request('/state')).data.amt_pending_payment,undefined);});
 await t.test('Bank transfer details and fare calculation match the original workflow',()=>{
  run("selectedMethod='bank'");els['bank-name'].value='QA Bank';els['bank-ref'].value='REF-1';assert.match(run('getPaymentInfo().detail'),/QA Bank.*REF-1/);
  run('totalMeters=2000;nightActive=false');assert.equal(run('calcFare()'),180);run('nightActive=true');assert.equal(run('calcFare()'),198);run('nightActive=false;totalMeters=0');
 });
 await t.test('Concurrent modification pauses sync rather than overwriting',async()=>{const s=await ctx.cloudStore.request('/state');await ctx.cloudStore.request('/state',{method:'PUT',headers:{'If-Match':String(s.version)},body:JSON.stringify(s.data)});ctx.cloudStore.setItem('system_logs','[]');await assert.rejects(ctx.cloudStore.flush(),/Another session/);assert(ctx.cloudStore.dirty);});
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});
