'use strict';
(()=>{
 const $=id=>document.getElementById(id),S=window.Study;
 let actor=null,epoch=0,busy=false,page=1,query='',thread=null,admin=false,mode=false,draft=null,reportPage=1,reportTarget=null;
 const say=t=>{$('board-status').textContent=t;if($('board-report-dialog').open)$('report-message').textContent=t;};
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const date=v=>new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'short',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'});
 function clear(){reportPage=1;reportTarget=null;$('board-reports').hidden=true;$('reports-list').replaceChildren();$('report-reason').value='';$('report-message').textContent='';$('report-target').textContent='';$('report-filter').value='open';if($('board-report-dialog').open)$('board-report-dialog').close();epoch++;busy=false;admin=false;thread=null;draft=null;page=1;query='';mode=false;$('board-area').hidden=true;$('board-login').hidden=false;$('board-list').replaceChildren();$('board-messages').replaceChildren();$('board-body').value='';$('board-title').value='';$('board-search').value='';$('board-reply-body').value='';$('board-moderation').checked=false;}
 function controls(){for(const e of document.querySelectorAll('#board-area button, #board-report-dialog button'))e.disabled=busy;$('board-prev').disabled=busy||page<=1;$('reports-prev').disabled=busy||reportPage<=1;}
 async function rpc(action,input={}){const r=await S.client.rpc('study_board',{p_action:action,...input});if(r.error)throw r.error;return r.data;}
 async function run(work){if(busy||!actor)return;const ticket=epoch;busy=true;controls();try{await work(ticket);}catch(e){if(ticket===epoch){if(e.code==='42501'||e.code==='PT401'){clear();say('ログインと利用権限を確認してください。');}else say(e.code==='PT429'?'投稿・アクセスが集中しています。少し待って再試行してください。':e.code==='40001'?'投稿が更新されています。開き直してください。':e.message||'通信を確認してください。');}}finally{if(ticket===epoch){busy=false;controls();}}}
 function moderationButton(post,root){
  const button=node('button',post.hidden?'表示に戻す':'非表示にする');button.type='button';button.onclick=()=>{
   if(!confirm('この投稿を'+(post.hidden?'表示に戻しますか？':'非表示にしますか？')))return;
   void run(async t=>{await rpc(post.hidden?'show':'hide',{p_id:post.id,p_revision:post.revision});if(t!==epoch)return;if(root)await openThread(root,t);else await list(t);say('公開状態を更新しました。');});
  };return button;
 }
 function metadata(post){return node('p',post.category+' ・ '+post.author+(post.mine?'（自分）':'')+' ・ '+date(post.created_at),'board-meta');}
 async function list(t=epoch){const result=await rpc(mode?'moderation':'list',{p_page:page,p_query:query});if(t!==epoch)return;admin=result.admin;$('board-moderation-label').hidden=!admin;$('board-reports').hidden=!admin;$('board-area').hidden=false;$('board-login').hidden=true;$('board-browse').hidden=false;$('board-thread').hidden=true;$('board-list').replaceChildren();
  for(const post of result.posts.slice(0,20)){const card=node('article',undefined,'card'+(post.hidden?' board-hidden':''));const open=node('button',post.title,'board-open');open.type='button';open.onclick=()=>void run(t=>openThread(post.id,t));card.append(metadata(post),open,node('p',post.replies+'件の返信','muted'));if(post.hidden)card.append(node('p','非表示中','board-label'));if(admin)card.append(moderationButton(post,null));$('board-list').append(card);}
  if(!result.posts.length)$('board-list').append(node('p','まだ投稿がありません。最初の質問を書いてみませんか。','card'));
  $('board-page').textContent=page+'ページ';$('board-next').hidden=result.posts.length<=20;thread=null;say('投稿はログインした利用者同士で読めます。');
 }
 async function openThread(id,t=epoch){const result=await rpc('get',{p_id:id});if(t!==epoch)return;admin=result.admin;const root=result.posts.find(p=>p.id===id);if(!root)throw Error('投稿が見つかりません。');thread=root;$('board-reports').hidden=!admin;$('board-browse').hidden=true;$('board-thread').hidden=false;$('board-messages').replaceChildren();
  for(const post of result.posts){const card=node('article',undefined,'card'+(post.hidden?' board-hidden':''));if(post.title)card.append(node('h2',post.title));card.append(metadata(post),node('p',post.body,'board-post-body'));if(post.hidden)card.append(node('p','非表示中','board-label'));const actions=node('div',undefined,'board-actions');
   if(post.mine&&!post.deleted){const del=node('button','自分の本文を削除');del.type='button';del.onclick=()=>{if(!confirm('自分の投稿本文を削除しますか？返信は残ります。'))return;void run(async t=>{await rpc('delete',{p_id:post.id,p_revision:post.revision});if(t!==epoch)return;await openThread(id,t);say('本文を削除しました。');});};actions.append(del);}
   if(!post.mine&&!post.deleted&&!post.hidden&&!root.hidden)actions.append(reportButton(post));if(admin)actions.append(moderationButton(post,id));card.append(actions);$('board-messages').append(card);
  }
  $('board-reply').hidden=root.hidden||root.deleted;say(root.hidden?'管理者として非表示の投稿を確認しています。':'返信する前に、相手の考えを読んでみましょう。');
 }
 async function post(reply){const content={parent:reply?thread?.id:null,title:reply?'':$('board-title').value.trim(),body:$(reply?'board-reply-body':'board-body').value.trim(),category:$('board-category').value};if(!content.body||(!reply&&!content.title))return;
  if(!draft||draft.key!==JSON.stringify(content))draft={key:JSON.stringify(content),id:crypto.randomUUID()};const id=draft.id;
  await run(async t=>{const result=await rpc('post',{p_id:id,p_parent:content.parent,p_title:content.title,p_body:content.body,p_category:content.category});if(t!==epoch)return;draft=null;$(reply?'board-reply-body':'board-body').value='';if(!reply)$('board-title').value='';await openThread(result.parent||result.id,t);say('投稿しました。');});
 }
 $('board-post').onsubmit=e=>{e.preventDefault();void post(false);};$('board-reply').onsubmit=e=>{e.preventDefault();void post(true);};
 $('board-search-form').onsubmit=e=>{e.preventDefault();if(busy)return;query=$('board-search').value.trim();page=1;void run(t=>list(t));};
 $('board-refresh').onclick=()=>void run(t=>list(t));$('board-back').onclick=()=>void run(t=>list(t));
 $('board-prev').onclick=()=>{if(busy||page<=1)return;page--;void run(t=>list(t));};$('board-next').onclick=()=>{if(busy)return;page++;void run(t=>list(t));};
 $('board-moderation').onchange=()=>{if(busy)return;mode=admin&&$('board-moderation').checked;page=1;void run(t=>list(t));};

 async function reportRpc(action,input={}){const r=await S.client.rpc('study_board_report',{p_action:action,...input});if(r.error)throw r.error;return r.data;}
 function reportButton(post){const b=node('button','通報する');b.type='button';b.onclick=()=>{if(busy)return;reportTarget=post.id;$('report-message').textContent='';$('report-target').textContent=post.title||'この返信を通報します。';$('report-reason').value='';$('report-category').value='暴言・誹謗中傷';$('board-report-dialog').showModal();};return b;}
 async function loadReports(t){
  const result=await reportRpc('list',{p_page:reportPage,p_status:$('report-filter').value});if(t!==epoch)return;
  $('reports-list').replaceChildren();
  for(const r of result.reports.slice(0,20)){
   const card=node('article',undefined,'card');card.append(node('h3',r.category),node('p',date(r.created_at)+' ・ '+(r.status==='done'?'対応済み':'未対応'),'board-meta'),node('p','対象：'+r.title),node('p',r.preview,'board-post-body report-preview'),node('p','通報理由：'+r.reason,'board-post-body'));
   const actions=node('div',undefined,'board-actions'),open=node('button','対象の投稿を確認');open.type='button';open.onclick=()=>void run(t=>openThread(r.root_id,t));actions.append(open);
   if(r.post_hidden||r.thread_hidden)card.append(node('p','対象の投稿または質問は非表示です。','board-label'));
   if(r.status==='open'){const done=node('button','対応済みにする');done.type='button';done.onclick=()=>{if(!confirm('対応済みにしますか？投稿の公開状態は変わりません。'))return;void run(async t=>{await reportRpc('resolve',{p_id:r.id,p_revision:r.revision});if(t!==epoch)return;await loadReports(t);say('通報を対応済みにしました。');});};actions.append(done);}
   card.append(actions);$('reports-list').append(card);
  }
  if(!result.reports.length)$('reports-list').append(node('p','この条件の通報はありません。'));
  $('reports-page').textContent=reportPage+'ページ';$('reports-prev').disabled=reportPage<=1;$('reports-next').hidden=result.reports.length<=20;
 }
 $('board-report-form').onsubmit=e=>{e.preventDefault();if(!reportTarget||busy)return;const id=reportTarget,reason=$('report-reason').value.trim(),category=$('report-category').value;if(!reason)return;void run(async t=>{const result=await reportRpc('report',{p_post:id,p_category:category,p_reason:reason});if(t!==epoch)return;$('board-report-dialog').close();reportTarget=null;$('report-reason').value='';say(result.already?'この投稿への通報は受け付け済みです。':'通報を受け付けました。管理者が確認します。');});};
 $('report-cancel').onclick=()=>{$('board-report-dialog').close();reportTarget=null;$('report-reason').value='';};
 $('reports-refresh').onclick=()=>void run(t=>loadReports(t));
 $('report-filter').onchange=()=>{if(busy)return;reportPage=1;void run(t=>loadReports(t));};
 $('reports-prev').onclick=()=>{if(busy||reportPage<=1)return;reportPage--;void run(t=>loadReports(t));};
 $('reports-next').onclick=()=>{if(busy)return;reportPage++;void run(t=>loadReports(t));};
 function identity(session){const next=session?.user?.id||null;if(next===actor)return;clear();actor=next;if(next){say('掲示板を読み込んでいます…');setTimeout(()=>void run(t=>list(t)),0);}else say('投稿と閲覧にはログインが必要です。');}
 clear();if(!S||S.setupError){say(S?.setupError||'接続設定を確認してください。');return;}
 S.client.auth.onAuthStateChange((event,session)=>identity(session));const start=epoch;S.client.auth.getSession().then(r=>{if(start!==epoch)return;if(r.error)throw r.error;identity(r.data.session);if(!actor)say('投稿と閲覧にはログインが必要です。');}).catch(()=>say('ログインを確認できません。'));
 window.addEventListener('study-access-status',e=>{if(!e.detail?.allowed){clear();actor=null;say('メンテナンス中です。');}else if(admin&&(!e.detail.admin||!e.detail.adminVerified)){clear();actor=null;say('権限が変わりました。ページを開き直してください。');}});
})();
