const root=document.getElementById('root'),message=document.getElementById('message');let generation=0;
function clear(){generation++;root.replaceChildren();message.textContent='ログイン・利用権限を確認してください。';}
if(!window.Study || Study.setupError){message.textContent=window.Study?.setupError || '通信を確認してください。';}
else {
 Study.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT') clear();});
 const ticket=++generation;
 try {
  const data=await Study.api('admin_bootstrap');
  if(ticket===generation){
   // Both markup and module come only from the authorized server response.
   root.innerHTML=data.html;
   const url=URL.createObjectURL(new Blob([data.script],{type:'text/javascript'}));
   try {const module=await import(url);if(ticket===generation) await module.default(root,data,message);} finally {URL.revokeObjectURL(url);}
  }
 } catch(e){root.replaceChildren();message.textContent=e.message;message.classList.add('error');}
}
