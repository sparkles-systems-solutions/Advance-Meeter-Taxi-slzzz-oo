/* Reports are rendered as text. Customer details never enter passenger telemetry. */
window.customerSummary = function(rides) {
 const groups=new Map();
 for(const ride of rides) {
  const phone=String(ride.mobile||'').trim();
  const name=String(ride.customerName||ride.pickupName||'').trim();
  if(!name&&(!phone||phone==='N/A'))continue;
  const key=phone&&phone!=='N/A'?'phone:'+phone.replace(/[\s()-]/g,''):'name:'+name.toLowerCase();
  const row=groups.get(key)||{name,phone:phone==='N/A'?'':phone,rides:0,total:0,last:0,history:[]};
  row.rides++;row.total+=Number(ride.fare)||0;row.last=Math.max(row.last,Number(ride.time)||0);row.history.push(ride);
  groups.set(key,row);
 }
 return [...groups.values()].sort((a,b)=>b.last-a.last);
};
window.openAccountReports = async function() {
 const panel=document.getElementById('account-reports');panel.hidden=false;
 const output=document.getElementById('report-output');
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
 const button=(text,action)=>{const el=node('button',text);el.type='button';el.onclick=()=>Promise.resolve().then(action).catch(e=>showToast(e.message,'error'));return el;};
 function display(rides,title){
  output.replaceChildren(node('h4',title),node('p',`${rides.length} rides · LKR ${rides.reduce((n,r)=>n+(Number(r.fare)||0),0).toFixed(2)}`));
  for(const c of customerSummary(rides)){
   const details=document.createElement('details');details.append(node('summary',`${c.name||c.phone} · ${c.rides} rides · LKR ${c.total.toFixed(2)}`),node('p',`${c.phone} · Last ride: ${new Date(c.last).toLocaleString()}`));
   c.history.forEach(r=>details.append(node('p',`${new Date(r.time).toLocaleString()} · ${r.from||''} → ${r.to||''} · LKR ${r.fare}`)));output.append(details);
  }
  const all=document.createElement('details');all.append(node('summary','All receipts (including customers without contact details)'));
  rides.forEach(r=>all.append(node('p',`${r.id} · ${new Date(r.time).toLocaleString()} · ${r.mode} · ${r.km} km · LKR ${r.fare}`)));output.append(all);
 }
 display(JSON.parse(cloudStore.getItem('rides')||'[]'),'My reports & CRM');
 const admin=document.getElementById('admin-accounts');admin.replaceChildren();
 if(cloudStore.user?.role!=='admin')return;
 admin.append(node('h4','Driver accounts'));
 const username=document.createElement('input');username.placeholder='New driver username';username.autocomplete='off';
 admin.append(username,button('Create driver',async()=>{
  const r=await cloudStore.request('/admin/users',{method:'POST',body:JSON.stringify({username:username.value,role:'driver'})});
  output.replaceChildren(node('p',`Created ${r.username}. Save this login key securely; it is shown only now.`),node('pre',r.accessKey));
  username.value='';await list();
 }));
 const users=document.createElement('div');admin.append(users);
 async function list(){
  users.replaceChildren();let after=0;
  do{
   const data=await cloudStore.request('/admin/users?after='+after);
   for(const u of data.users){
    const row=document.createElement('section');row.append(node('p',`${u.username} · ${u.role} · ${u.active?'Active':'Disabled'}`));
    row.append(button('Reports & CRM',async()=>{const r=await cloudStore.request(`/admin/users/${u.id}/reports`);display(r.rides,u.username+' reports & CRM');output.append(node('p',`Fuel entries: ${r.fuel.length} · Repair entries: ${r.repairs.length}`));}));
    if(u.username!==cloudStore.user.username){
     row.append(button(u.active?'Disable':'Enable',async()=>{
      await cloudStore.request(`/admin/users/${u.id}/${u.active?'disable':'enable'}`,{method:'POST',body:'{}'});await list();
     }),button('Reset login key',async()=>{
      if(!confirm(`Reset ${u.username}'s key and sign them out?`))return;
      const r=await cloudStore.request(`/admin/users/${u.id}/password`,{method:'POST',body:'{}'});
      output.replaceChildren(node('p',`New key for ${u.username}. Save securely.`),node('pre',r.accessKey));
     }));
    }users.append(row);
   }after=data.next;
  }while(after);
 }
 await list();
};
