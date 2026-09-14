import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/server.mjs';
import {addUser} from '../server/store.mjs';

test('per-ride passenger links retain paid receipts without exposing customer data',async t=>{
 const app=createApp({dbFile:':memory:',origin:'http://localhost:5055'});await addUser(app.db,'driver','Integration-test-123','driver');app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.server.close());
 const base='http://127.0.0.1:'+app.server.address().port+'/api',call=async(path,{method='GET',token,data,version}={})=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{}),...(version!=null?{'If-Match':String(version)}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()};};
 const login=await call('/login',{method:'POST',data:{username:'driver',password:'Integration-test-123'}}),token=login.body.token;
 const a=await call('/track',{method:'POST',token,data:{rideId:'ride-a'}}),b=await call('/track',{method:'POST',token,data:{rideId:'ride-b'}});assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.body.token,b.body.token);
 assert.equal((await call('/track/'+a.body.token)).status,200);assert.equal((await call('/track/'+b.body.token)).status,200);
 await call('/track/'+a.body.token,{method:'PUT',token,data:{lat:6.9,lng:79.8,currentFare:180,distanceTraveled:'2.00',status:'active',mode:'Auto'}});
 const state=await call('/state',{token}),ride={id:'receipt-a',km:2,fare:180,time:Date.now(),from:'A',to:'B',customerName:'Private',mobile:'0710000000',payment:{method:'Cash',detail:'secret'}};state.body.data.rides=JSON.stringify([ride]);assert.equal((await call('/state',{method:'PUT',token,version:state.body.version,data:state.body.data})).status,200);
 assert.equal((await call('/track/'+a.body.token,{method:'PUT',token,data:{lat:6.91,lng:79.81,currentFare:180,distanceTraveled:'2.00',status:'completed',mode:'Auto',receiptId:'receipt-a',linkDays:30}})).status,200);
 const publicLink=await call('/track/'+a.body.token);assert.equal(publicLink.body.receipt.id,'receipt-a');assert.equal(publicLink.body.receipt.payment.method,'Cash');assert.equal(publicLink.body.receipt.mobile,undefined);assert.equal(publicLink.body.receipt.customerName,undefined);assert.equal(publicLink.body.receipt.payment.detail,undefined);
 assert.equal((await call('/track/'+b.body.token)).status,200);
});
