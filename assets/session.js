/* Server writes are versioned. Native shells securely retain only the short-lived
   session token; the one-time login key is never stored by this page. */
window.cloudStore = (() => {
 let values={},version=0,token='',user=null,dirty=0,saved=0,flight=null,timer=null,blocked=false;
 const base=(window.AMT_CONFIG?.apiBase||'').replace(/\/$/,'');
 const status=text=>{
  document.getElementById('sync-status').textContent=text;
  const warning=document.getElementById('sync-warning');
  if(warning){const critical=/^(NOT SAVED|Tracking update failed|Sync paused)/i.test(text);warning.hidden=!critical;warning.textContent=critical?text:'';}
 };
 async function request(path,options={}) {
  if(base && !base.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw Error('Backend URL must use HTTPS');
  const response=await fetch(base+'/api'+path,{...options,cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
  const data=await response.json().catch(()=>({error:'Backend is not available. Check the API address.'}));
  if(!response.ok){if(response.status===401&&token)blocked=true;const error=Error(data.error||'Request failed');error.status=response.status;throw error;}return data;
 }
 async function flush() {
  if(!token||dirty===saved)return;
  if(flight){await flight;if(dirty!==saved)return flush();return;}
  const revision=dirty;
  flight=(async()=>{
   let attempts=0;
   while(attempts++<2){
    const snapshot=JSON.stringify(values);status(attempts===1?'Saving…':'Resolving sync conflict…');
    try{const result=await request('/state',{method:'PUT',headers:{'If-Match':String(version)},body:snapshot});version=result.version;
     // The server signs new receipts with its canonical tariff snapshot. Pull those
     // immutable rows back immediately so a later save never submits a stale copy.
     const canonical=await request('/state'),currentRides=new Map(JSON.parse(values.rides||'[]').map(r=>[r.id,r]));
     for(const ride of JSON.parse(canonical.data?.rides||'[]'))currentRides.set(ride.id,ride);
     values={...values,rides:JSON.stringify([...currentRides.values()])};version=canonical.version;
     saved=revision;blocked=false;status('Saved to server');return;}
    catch(e){
     if(e.status===409&&attempts<2){
      const fresh=await request('/state'),local=JSON.parse(snapshot),server=fresh.data||{};
      const mergedRides=new Map(JSON.parse(local.rides||'[]').map(r=>[r.id,r]));
      for(const ride of JSON.parse(server.rides||'[]'))mergedRides.set(ride.id,ride);
      values={...server,...local,rides:JSON.stringify([...mergedRides.values()])};version=fresh.version;continue;
     }
     if([401,422].includes(e.status))blocked=true;status((blocked?'Sync paused: ':'NOT SAVED: ')+e.message);throw e;
    }
   }
  })().finally(()=>{flight=null;});
  await flight;if(dirty!==saved)return flush();
 }
 function schedule(){dirty++;status('Unsaved changes');clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),700);}
 function exportUnsaved(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(values,null,2)],{type:'application/json'}));a.download='taxi-unsaved-state.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 async function activateSession(result){
  token=result.token;user=result.user;
  const state=await request('/state');values=state.data;version=state.version;dirty=0;saved=0;blocked=false;
  document.getElementById('account-password').value='';document.getElementById('account-gate').hidden=true;document.getElementById('main-driver-view').hidden=false;
  document.getElementById('account-name').textContent=user.username+' · '+user.role;status('Saved to server');
 }
 async function connect(){
  const credentialLabel=document.querySelector('label[for="account-password"]');
  if(credentialLabel)credentialLabel.textContent=window.AMT_CONFIG?.credentialLabel||'Password';
  if(window.nativeMeter?.supported){
   try{
    const savedSession=await window.nativeMeter.call('loadSession');
    if(savedSession&&/^[a-f0-9]{64}$/.test(savedSession.token||'')&&savedSession.user){await activateSession(savedSession);return;}
   }catch(e){token='';user=null;try{await window.nativeMeter.call('clearSession');}catch(_){} }
  }
  document.getElementById('account-gate').hidden=false;
  document.getElementById('main-driver-view').hidden=true;
  return new Promise(resolve=>{
   document.getElementById('account-form').onsubmit=async event=>{
    event.preventDefault();const button=document.getElementById('account-submit');button.disabled=true;
    try{
     const result=await request('/login',{method:'POST',body:JSON.stringify({username:document.getElementById('account-user').value,password:document.getElementById('account-password').value})});
     await activateSession(result);
     if(window.nativeMeter?.supported)try{await window.nativeMeter.call('saveSession',{token:result.token,user:result.user});}catch(e){status('Signed in; automatic sign-in could not be saved.');}resolve();
    }catch(e){token='';document.getElementById('account-error').textContent=e.message;}finally{button.disabled=false;}
   };
  });
 }
 async function logout(){try{await flush();await request('/logout',{method:'POST',body:'{}'});}catch(e){status(e.message);}finally{if(window.nativeMeter?.supported)try{await window.nativeMeter.call('clearSession');}catch(_){}token='';user=null;values={};location.reload();}}
 window.addEventListener('beforeunload',e=>{if(dirty!==saved){e.preventDefault();e.returnValue='';}});
 window.addEventListener('online',()=>flush().catch(()=>{}));
 function configureNative(data){if(window.nativeMeter?.supported)return window.nativeMeter.call('configure',{...data,token});return Promise.resolve();}
 return {connect,request,flush,logout,exportUnsaved,configureNative,reportStatus:status,get user(){return user;},getItem:key=>values[key]??null,setItem(key,value){values[key]=String(value);schedule();},removeItem(key){if(key in values){delete values[key];schedule();}},get dirty(){return dirty!==saved;}};
})();
