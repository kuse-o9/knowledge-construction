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
   const games=document.createElement('section');games.className='card';const heading=document.createElement('h2');heading.textContent='ゲーム';const link=document.createElement('a');link.className='button';link.href='admin-games.html';link.textContent='ゲーム';const description=document.createElement('p');description.textContent='公開・非公開、お知らせを管理します。オーナーへの申請は不要です。';games.append(heading,description,link);root.prepend(games);
   const url=URL.createObjectURL(new Blob([data.script],{type:'text/javascript'}));
   try {const module=await import(url);if(ticket===generation) await module.default(root,data,message);} finally {URL.revokeObjectURL(url);}
  }
 } catch(e){root.replaceChildren();message.textContent=e.message;message.classList.add('error');}
}
