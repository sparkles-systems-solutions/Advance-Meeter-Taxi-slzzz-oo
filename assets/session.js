/* Account data and bearer tokens remain in memory. Server writes are versioned. */
window.cloudStore = (() => {
 let values={},version=0,token='',user=null,dirty=0,saved=0,flight=null,timer=null,blocked=false;
 const base=(window.AMT_CONFIG?.apiBase||'').replace(/\/$/,'');
 const status=text=>{document.getElementById('sync-status').textContent=text;};
 async function request(path,options={}) {
  if(base && !base.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw Error('Backend URL must use HTTPS');
  const response=await fetch(base+'/api'+path,{...options,cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
  const data=await response.json().catch(()=>({error:'Backend is not available. Check the API address.'}));
  if(!response.ok){if(response.status===401&&token)blocked=true;const error=Error(data.error||'Request failed');error.status=response.status;throw error;}return data;
 }
 async function flush() {
  if(!token||dirty===saved)return;
  if(flight){await flight;if(dirty!==saved)return flush();return;}
  if(blocked)throw Error('Sync paused. Download unsaved data before signing in again.');
  const revision=dirty,snapshot=JSON.stringify(values);
  status('Saving…');flight=request('/state',{method:'PUT',headers:{'If-Match':String(version)},body:snapshot}).then(result=>{version=result.version;saved=revision;status('Saved to server');}).catch(e=>{if([401,409,422].includes(e.status))blocked=true;status('NOT SAVED: '+e.message);throw e;}).finally(()=>{flight=null;});
  await flight;if(dirty!==saved)return flush();
 }
 function schedule(){dirty++;status('Unsaved changes');clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),700);}
 function exportUnsaved(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(values,null,2)],{type:'application/json'}));a.download='taxi-unsaved-state.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 async function connect(){
  document.getElementById('account-gate').hidden=false;
  document.getElementById('main-driver-view').hidden=true;
  return new Promise(resolve=>{
   document.getElementById('account-form').onsubmit=async event=>{
    event.preventDefault();const button=document.getElementById('account-submit');button.disabled=true;
    try{
     const result=await request('/login',{method:'POST',body:JSON.stringify({username:document.getElementById('account-user').value,password:document.getElementById('account-password').value})});token=result.token;user=result.user;
     const state=await request('/state');values=state.data;version=state.version;dirty=0;saved=0;blocked=false;
     document.getElementById('account-password').value='';document.getElementById('account-gate').hidden=true;document.getElementById('main-driver-view').hidden=false;
     document.getElementById('account-name').textContent=user.username+' · '+user.role;status('Saved to server');resolve();
    }catch(e){token='';document.getElementById('account-error').textContent=e.message;}finally{button.disabled=false;}
   };
  });
 }
 async function logout(){try{await flush();await request('/logout',{method:'POST',body:'{}'});token='';values={};location.reload();}catch(e){status(e.message);}}
 window.addEventListener('beforeunload',e=>{if(dirty!==saved){e.preventDefault();e.returnValue='';}});
 window.addEventListener('online',()=>flush().catch(()=>{}));
 return {connect,request,flush,logout,exportUnsaved,get user(){return user;},getItem:key=>values[key]??null,setItem(key,value){values[key]=String(value);schedule();},removeItem(key){if(key in values){delete values[key];schedule();}},get dirty(){return dirty!==saved;}};
})();
