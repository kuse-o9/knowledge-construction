'use strict';
(()=>{
 const $=id=>document.getElementById(id),S=window.Study;
 let actor=null,epoch=0,busy=false,room='勉強法',before=null,focus=new URL(location.href).searchParams.get('message'),oldest=null,timer=null,delay=10000,draft=null,target=null,stamp='',serverStamp=null,pending=null,admin=false;
 if(focus&&!/^[0-9a-f-]{36}$/i.test(focus))focus=null;
 const controllers=new Set();
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const say=t=>{$('chat-status').textContent=t;if($('board-report-dialog').open)$('report-message').textContent=t;};
 const date=v=>new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'});
 function schedule(){clearTimeout(timer);timer=null;if(actor&&!document.hidden&&!before&&!focus)timer=setTimeout(()=>void refresh(false),delay);}
 function clear(){epoch++;for(const c of controllers)c.abort();controllers.clear();clearTimeout(timer);timer=null;busy=false;admin=false;stamp='';serverStamp=null;pending=null;draft=null;target=null;$('chat-area').hidden=true;$('chat-login').hidden=false;$('chat-log').replaceChildren();$('chat-body').value='';$('report-reason').value='';$('report-message').textContent='';$('report-target').textContent='';if($('board-report-dialog').open)$('board-report-dialog').close();}
 function controls(){for(const e of document.querySelectorAll('#chat-area button, #board-report-dialog button'))e.disabled=busy;$('chat-older').disabled=busy||!oldest||!!focus;}
 async function rpc(name,input){
  const c=new AbortController();controllers.add(c);let deadline;
  const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>{c.abort();reject(Error('通信が15秒以内に完了しませんでした。入力は残っています。更新・再送信できます。'));},15000);});
  try{const query=S.client.rpc(name,input),request=typeof query.abortSignal==='function'?query.abortSignal(c.signal):query;const r=await Promise.race([request,timeout]);if(r.error)throw r.error;return r.data;}
  finally{clearTimeout(deadline);controllers.delete(c);}
 }
 async function run(work){if(busy||!actor){schedule();return;}const t=epoch;busy=true;clearTimeout(timer);controls();try{await work(t);delay=10000;}catch(e){if(t!==epoch)return;delay=30000;if(e.code==='42501'||e.code==='PT401'){clear();actor=null;say('ログインと利用権限を確認してください。');}else say(e.code==='PT429'?'送信・更新が続いています。少し待って再試行してください。':e.code==='40001'?'メッセージが更新されています。再読み込みしてください。':e.message||'通信を確認してください。');}finally{if(t===epoch){busy=false;controls();schedule();}}}
 function reportButton(msg){const b=node('button','通報する');b.type='button';b.onclick=()=>{if(busy)return;target=msg.id;$('report-target').textContent=msg.author+'のメッセージ';$('report-reason').value='';$('report-message').textContent='';$('report-category').value='暴言・誹謗中傷';$('board-report-dialog').showModal();};return b;}
 function actionButton(text,action,msg){const b=node('button',text);b.type='button';b.onclick=()=>{if(!confirm(text+'を実行しますか？'))return;void run(async t=>{await rpc('study_board',{p_action:action,p_id:msg.id,p_revision:msg.revision});if(t!==epoch)return;await load(t,true);say('メッセージを更新しました。');});};return b;}
 function paint(result,force){
  const key=JSON.stringify(result);if(key===stamp&&!force)return;
  const log=$('chat-log'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;
  if(stamp&&!force&&!atBottom){pending=result;$('chat-unread').hidden=false;return;}
  stamp=key;pending=null;$('chat-unread').hidden=true;admin=result.admin;room=result.room;$('chat-room').value=room;$('chat-admin').hidden=!admin;
  const selected=result.messages.slice(0,50);oldest=result.messages.length>50?selected.at(-1):null;log.replaceChildren();
  for(const msg of selected.slice().reverse()){
   const card=node('article',undefined,'chat-message'+(msg.mine?' mine':'')+(msg.hidden?' hidden-message':''));card.append(node('p',msg.author+(msg.mine?'（自分）':'')+' ・ '+date(msg.created_at),'board-meta'),node('p',msg.body,'board-post-body'));const actions=node('div',undefined,'board-actions');
   if(msg.hidden)card.append(node('p','管理者により非表示中','board-label'));
   if(msg.mine&&!msg.deleted)actions.append(actionButton('自分の本文を削除','delete',msg));
   if(!msg.mine&&!msg.deleted&&!msg.hidden)actions.append(reportButton(msg));
   if(admin)actions.append(actionButton(msg.hidden?'表示に戻す':'非表示にする',msg.hidden?'show':'hide',msg));card.append(actions);log.append(card);
  }
  if(!selected.length)log.append(node('p','まだメッセージがありません。勉強の話を始めてみませんか。'));
  if(force||atBottom)log.scrollTop=log.scrollHeight;$('chat-form').hidden=!!focus;
 }
 async function load(t,force){let mark;if(!force&&!before&&!focus&&stamp){mark=await rpc('study_chat',{p_action:'stamp',p_room:room});if(t!==epoch)return;if(mark.stamp===serverStamp&&mark.admin===admin)return;}const result=await rpc('study_chat',{p_action:focus?'focus':'list',p_room:room,...(focus?{p_id:focus}:{}),...(before?{p_before:before.created_at,p_before_id:before.id}:{})});if(t!==epoch)return;$('chat-area').hidden=false;$('chat-login').hidden=true;paint(result,force);if(mark)serverStamp=mark.stamp;say(focus?'通報対象のメッセージを表示しています。部屋全体へ戻るには「最新へ」。':before?'以前のメッセージを表示しています。':'ログインした利用者と勉強の話を共有できます。');}
 function refresh(force=true){return run(t=>load(t,force));}
 $('chat-form').onsubmit=e=>{e.preventDefault();const body=$('chat-body').value.trim();if(!body||busy)return;if(!draft||draft.body!==body||draft.room!==room)draft={id:crypto.randomUUID(),body,room};const request={...draft};void run(async t=>{await rpc('study_chat',{p_action:'send',p_id:request.id,p_body:request.body,p_room:request.room});if(t!==epoch)return;draft=null;if($('chat-body').value.trim()===request.body)$('chat-body').value='';before=null;focus=null;await load(t,true);say('送信しました。');});};
 $('chat-room').onchange=()=>{if(busy){$('chat-room').value=room;return;}room=$('chat-room').value;before=null;focus=null;stamp='';void refresh();};
 $('chat-refresh').onclick=()=>void refresh();$('chat-latest').onclick=()=>{if(busy)return;before=null;focus=null;void refresh();};$('chat-older').onclick=()=>{if(busy||!oldest)return;before=oldest;void refresh();};$('chat-unread').onclick=()=>{if(pending)paint(pending,true);};
 $('board-report-form').onsubmit=e=>{e.preventDefault();if(!target||busy)return;const id=target,reason=$('report-reason').value.trim(),category=$('report-category').value;if(!reason)return;void run(async t=>{const r=await rpc('study_board_report',{p_action:'report',p_post:id,p_reason:reason,p_category:category});if(t!==epoch)return;$('board-report-dialog').close();target=null;$('report-reason').value='';say(r.already?'このメッセージは通報済みです。':'通報を受け付けました。管理者が確認します。');});};
 $('report-cancel').onclick=()=>{$('board-report-dialog').close();target=null;$('report-reason').value='';};
 function identity(session){const next=session?.user?.id||null;if(next===actor)return;clear();actor=next;if(next)setTimeout(()=>void refresh(),0);else say('チャットの閲覧・送信にはログインが必要です。');}
 clear();if(!S||S.setupError){say(S?.setupError||'接続設定を確認してください。');return;}
 S.client.auth.onAuthStateChange((e,session)=>identity(session));const start=epoch;S.client.auth.getSession().then(r=>{if(start!==epoch)return;if(r.error)throw r.error;identity(r.data.session);if(!actor)say('チャットの閲覧・送信にはログインが必要です。');}).catch(()=>say('ログインを確認できません。'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(actor&&!before&&!focus)void refresh(false);});
 window.addEventListener('study-access-status',e=>{if(!e.detail?.allowed||admin&&(!e.detail.admin||!e.detail.adminVerified)){clear();actor=null;say('メンテナンスまたは権限の変更により停止しています。');}});
})();
