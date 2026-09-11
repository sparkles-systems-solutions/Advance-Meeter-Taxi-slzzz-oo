import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../server/server.mjs';
import {addUser} from '../server/store.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function element(id=''){const classes=new Set();return {id,value:'',checked:false,hidden:false,disabled:false,dataset:{},style:{setProperty(){}},innerHTML:'',textContent:'',innerText:'',classList:{add(...a){a.forEach(x=>classes.add(x))},remove(...a){a.forEach(x=>classes.delete(x))},contains(x){return classes.has(x)},toggle(x,on){on===undefined?on=!classes.has(x):null;on?classes.add(x):classes.delete(x);}},addEventListener(){},removeEventListener(){},appendChild(){},remove(){},setAttribute(){},getAttribute(){return ''},getContext(){return {}},click(){}};}
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
 await t.test('Manual trip is durably saved',async()=>{run("setMode('manual')");els['start-loc'].value='Test pickup';els['end-loc'].value='Test drop';els['manual-km-input'].value='2';await run('startRide()');await ctx.cloudStore.flush();const s=await ctx.cloudStore.request('/state');assert.equal(JSON.parse(s.data.amt_ride_state).totalMeters,2000);});
 await t.test('End and payment persist the server-validated receipt',async()=>{await run('endRide()');await run('confirmPaymentAndShowReceipt()');await ctx.cloudStore.flush();const s=await ctx.cloudStore.request('/state');const rides=JSON.parse(s.data.rides);assert.equal(rides.length,1);assert.equal(rides[0].fare,180);assert(!s.data.amt_pending_payment);});
 await t.test('Later save preserves canonical receipt',async()=>{run("addSystemLog('INFO','Test event','No personal details')");await ctx.cloudStore.flush();assert.equal(ctx.cloudStore.dirty,false);});
 await t.test('Concurrent modification pauses sync rather than overwriting',async()=>{const s=await ctx.cloudStore.request('/state');await ctx.cloudStore.request('/state',{method:'PUT',headers:{'If-Match':String(s.version)},body:JSON.stringify(s.data)});ctx.cloudStore.setItem('system_logs','[]');await assert.rejects(ctx.cloudStore.flush(),/Another session/);assert(ctx.cloudStore.dirty);});
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});
