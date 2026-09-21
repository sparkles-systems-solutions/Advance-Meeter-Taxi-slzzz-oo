/* The native host is only present in installed builds. No browser background guarantee. */
window.nativeMeter=(()=>{
 const supported=!!(window.TaxiNative||window.webkit?.messageHandlers?.taxi);
 const pending=new Map();let sequence=0;
 window.taxiNativeReply=(id,result)=>{const p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);result.error?p.reject(Error(result.error)):p.resolve(result);};
 function call(action,data={}){
  if(!supported)return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
   const id=++sequence,timeout=action==='savePdf'?120000:20000;const timer=setTimeout(()=>{pending.delete(id);reject(Error(action==='savePdf'?'PDF save timed out. Try again.':'Native meter did not respond. Check location permissions.'));},timeout);
   pending.set(id,{resolve,reject,timer});const message=JSON.stringify({id,action,data});
   if(window.TaxiNative)window.TaxiNative.postMessage(message);else window.webkit.messageHandlers.taxi.postMessage(message);
  });
 }
 return {supported,call};
})();
