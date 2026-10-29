'use strict';
(()=>{
 const $=id=>document.getElementById(id),admin=document.body.dataset.staffAdmin==='true';
 let epoch=0,allowed=false,canPost=false,busy=false,page=1,hasNext=false,pending=null;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 function message(text,error=false){$('updates-message').textContent=text;$('updates-message').classList.toggle('error',error);}
 function controls(){
  $('updates-prev').disabled=busy||!allowed||page===1;$('updates-next').disabled=busy||!allowed||!hasNext;
  $('updates-refresh').disabled=busy||!allowed;$('updates-page').textContent=page+'ページ';
  if(admin){$('updates-compose').hidden=!canPost;$('updates-submit').disabled=busy||!canPost;$('updates-body').disabled=busy||!canPost;}
  for(const b of $('updates-list').querySelectorAll('button'))b.disabled=busy||!canPost;
 }
 async function rpc(params,ticket){const {data,error}=await Study.client.rpc('study_staff_updates',params);if(ticket!==epoch)throw Error('画面を更新してください。');if(error)throw error;return data;}
 async function load(ticket){
  const d=await rpc({p_action:'list',p_page:page},ticket);hasNext=d.hasNext;canPost=admin&&d.canPost;
  $('updates-list').replaceChildren();
  for(const item of d.items){
   const row=node('article','');row.className='card staff-post';
   const meta=node('p',item.authorLabel+' · '+new Date(item.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}));meta.className='staff-meta';
   const body=node('p',item.body);body.className='staff-body';row.append(meta,body);
   if(admin&&item.canDelete){const b=node('button','削除');b.type='button';b.className='secondary';b.onclick=()=>run(async t=>{if(!confirm('このつぶやきを削除しますか？'))return;await rpc({p_action:'delete',p_id:item.id},t);const count=await load(t);if(!count&&page>1){page--;await load(t);}message('削除しました。');});row.append(b);}
   $('updates-list').append(row);
  }
  if(!d.items.length)$('updates-list').append(node('p','まだつぶやきはありません。'));
  return d.items.length;
 }
 async function run(work){
  if(busy||!allowed)return;busy=true;const ticket=epoch;controls();
  try{await work(ticket);}catch(e){if(ticket===epoch){message(e.message||'通信に失敗しました。もう一度お試しください。',true);if(e.code==='42501'){canPost=false;if(admin)$('updates-list').replaceChildren();window.StudyAccessRefresh?.();}}}
  finally{if(ticket===epoch){busy=false;controls();}}
 }
 function reset(){epoch++;allowed=false;canPost=false;busy=false;hasNext=false;page=1;pending=null;$('updates-list').replaceChildren();if(admin){$('updates-body').value='';$('updates-count').textContent='0 / 1000文字';}controls();}
 function access(s){
  const next=!!s?.allowed&&(!admin||!!(s.admin&&s.adminVerified));
  if(!next){reset();message(admin?'管理者の本人確認をしてください。':'現在は閲覧できません。');return;}
  if(allowed)return;allowed=true;canPost=admin;controls();void run(async t=>{await load(t);message(admin?'投稿すると利用者向けページにすぐ表示されます。':'管理者・オーナーからのつぶやきです。');});
 }
 $('updates-refresh').onclick=()=>run(async t=>{await load(t);message('最新のつぶやきに更新しました。');});
 $('updates-prev').onclick=()=>run(async t=>{if(page>1){page--;await load(t);}});
 $('updates-next').onclick=()=>run(async t=>{if(hasNext){page++;await load(t);}});
 if(admin){
  $('updates-body').oninput=()=>{$('updates-count').textContent=$('updates-body').value.length+' / 1000文字';pending=null;};
  $('updates-form').onsubmit=e=>{e.preventDefault();if(!canPost)return;void run(async t=>{
   const text=$('updates-body').value.trim();if(!text||text.length>1000)throw Error('本文を１〜1000文字で入力してください。');
   if(!pending||pending.body!==text)pending={id:crypto.randomUUID(),body:text};
   await rpc({p_action:'post',p_id:pending.id,p_body:pending.body},t);
   pending=null;$('updates-body').value='';$('updates-count').textContent='0 / 1000文字';page=1;await load(t);message('つぶやきを公開しました。');
  });};
 }
 controls();
 if(!window.Study?.client){message('接続設定を読み込めません。再読み込みしてください。',true);return;}
 Study.client.auth.onAuthStateChange(event=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)){reset();message('利用権限を確認しています…');}});
 window.addEventListener('study-access-status',e=>access(e.detail));
 if(window.StudyAccessStatus)access(window.StudyAccessStatus);
})();
