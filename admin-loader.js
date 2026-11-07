const root=document.getElementById('root'),message=document.getElementById('message');let generation=0;
function clear(){generation++;window.dispatchEvent(new Event('study-admin-cleared'));root.replaceChildren();message.textContent='ログイン・利用権限を確認してください。';}
window.addEventListener('study-access-status',e=>{if(!e.detail?.allowed||!e.detail?.admin||!e.detail?.adminVerified)clear();});
if(!window.Study || Study.setupError){message.textContent=window.Study?.setupError || '通信を確認してください。';}
else {
 const {data:initialSession}=await Study.client.auth.getSession();let signedActor=initialSession.session?.user?.id||null;Study.client.auth.onAuthStateChange((event,session)=>{const next=session?.user?.id||null;if(next!==signedActor){signedActor=next;clear();}});
 const ticket=++generation;
 try {
  const data=await Study.api('admin_bootstrap');
  if(ticket===generation){
   const sections=window.StudyAdminSections;if(!sections)throw Error('管理画面の読み込みを確認してください。');
   const view=sections.selected();
   if(view==='dashboard'){sections.dashboard(root,data);message.textContent='使いたい機能を選んでください。';}
   else{
    // HTML/module are still delivered only after the server's existing admin/password checks.
    // The owner-only route is an additional UI check, never a substitute for server authorization.
    if(view==='owner'&&!data.owner)throw Error('この画面はオーナー専用です。');
    const script=sections.prepareScript(data.script,view);sections.mount(root,data,view);
    const url=URL.createObjectURL(new Blob([window.StudyAdminHistory?.withIds(script)||script],{type:'text/javascript'}));
    try{const module=await import(url);if(ticket===generation){await module.default(root,data,message);if(ticket===generation){if(view==='decks')window.StudyDeckInput?.attach(root);if(view==='history'){window.StudyAdminHistory?.attach(root);const panel=root.querySelector('#history-panel');if(panel?.hidden)panel.previousElementSibling?.click();}}}}finally{URL.revokeObjectURL(url);}
   }
  }
 }catch(e){if(ticket===generation){root.replaceChildren();message.textContent=e.message;message.classList.add('error');}}
}
