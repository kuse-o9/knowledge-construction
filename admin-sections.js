/* Presentation routes for the existing, server-authorized administration module. */
'use strict';
(function(g){
 const views={
  requests:{title:'削除申請と承認',description:'デッキ・問題・操作履歴の削除申請を確認します。',file:'admin-requests.html',selector:'#requests-panel',load:['requests']},
  decks:{title:'デッキと問題を作る',description:'デッキを保存してから、問題を追加・編集します。',file:'admin-decks.html',selector:'#deck-form',load:['decks']},
  accountrequests:{title:'アカウント削除の申請',description:'理由と対象を確認し、オーナーが承認・却下します。',file:'admin-accountrequests.html',selector:'#account-request-list',load:['accountRequests']},
  accounts:{title:'アカウント管理',description:'利用状況の確認・利用停止・アカウント削除の申請。',file:'admin-accounts.html',selector:'#user-list',load:['accounts']},
  owner:{title:'オーナー専用の操作',description:'管理者の追加・解除、処理待ちの確認、運営設定。',file:'admin-owner.html',selector:'#user-list',load:['accounts'],owner:true},
  history:{title:'操作履歴',description:'操作の日時・対象・結果を確認します。',file:'admin-history.html',selector:'#history-panel',load:['history']}
 };
 function selected(){return document.body.dataset.adminView||'dashboard';}
 function prepareScript(source,view){
  const config=views[view];if(!config)throw Error('管理機能の表示先を確認してください。');
  let script=source;
  function replaceOne(marker,replacement){if(typeof script!=='string'||script.split(marker).length!==2)throw Error('管理画面の構成が更新されています。再読み込みしても続く場合は、オーナーにお知らせください。');script=script.replace(marker,replacement);}
  // Do not fetch hidden lists on an unrelated screen. Every real action still uses Study.api.
  for(const name of ['decks','accounts','history','requests','accountRequests']){const marker='async function '+name+'(){';replaceOne(marker,marker+(config.load.includes(name)?'':'return;'));}
  replaceOne("if(info.owner && !u.owner && !u.pending && !u.blocked && u.confirmed)","if(info.owner && "+JSON.stringify(view==='owner')+" && !u.owner && !u.pending && !u.blocked && u.confirmed)");
  replaceOne('if(u.pending){if(info.owner)','if(u.pending){if(info.owner && '+JSON.stringify(view==='owner')+')');
  replaceOne('else if(!u.admin && !u.owner){row.append(button(', 'else if('+JSON.stringify(view==='accounts')+' && !u.admin && !u.owner){row.append(button(');
  replaceOne('if(!u.admin && !u.owner && !u.pending){const box=', 'if('+JSON.stringify(view==='accounts')+' && !u.admin && !u.owner && !u.pending){const box=');
  replaceOne("const f=await S.api('feedback_stats');$('feedback-count').textContent='未対応・確認中：'+f.unresolved+'件';",'');
  return script;
 }
 function mount(root,info,view){
  const config=views[view];if(!config)throw Error('管理機能の表示先を確認してください。');
  if(config.owner&&!info.owner)throw Error('この画面はオーナー専用です。');
  const holder=document.createElement('div');holder.innerHTML=info.html;
  const target=holder.querySelector(config.selector)?.closest('section'),summary=holder.querySelector('#counts')?.closest('section');
  if(!target||!summary)throw Error('管理画面を準備できません。再読み込みしてください。');
  const visible=document.createElement('div');visible.className='sn-admin-screen';const statusTitle=summary.querySelector('h2');if(statusTitle)statusTitle.textContent='現在の管理状況';const reload=summary.querySelector('#reload');if(reload)reload.textContent='この画面を更新';visible.append(summary);
  if(view==='owner'){
   const card=document.createElement('section');card.className='card';const title=document.createElement('h2');title.textContent='オーナーの管理メニュー';card.append(title);
   for(const [text,href]of [['デッキ・問題の削除承認','admin-requests.html'],['アカウント削除の承認','admin-accountrequests.html'],['メンテナンス・安全設定','admin-security.html'],['管理者専用パスワードの設定','admin-verify.html']]){const a=document.createElement('a');a.className='button secondary';a.href=href;a.textContent=text;card.append(a);}visible.append(card);
   const heading=target.querySelector('h2');if(heading)heading.textContent='管理者の追加・解除と処理待ち確認';
  }
  visible.append(target);
  const scaffold=document.createElement('div');scaffold.hidden=true;scaffold.inert=true;scaffold.setAttribute('aria-hidden','true');scaffold.dataset.adminScaffold='';
  scaffold.append(...holder.childNodes);root.replaceChildren(visible,scaffold);return config;
 }
 function dashboard(root,info){
  const dashboard=document.createElement('div');dashboard.className='sn-admin-dashboard';
  function group(title,items){const section=document.createElement('section'),h=document.createElement('h2'),grid=document.createElement('div');h.className='sn-admin-group-title';h.textContent=title;grid.className='sn-admin-tool-grid';for(const item of items){const card=document.createElement('article'),heading=document.createElement('h3'),p=document.createElement('p'),link=document.createElement('a');card.className='card sn-admin-tool';heading.textContent=item.title;p.textContent=item.description;link.className='button';link.href=item.file;link.textContent='開く →';card.append(heading,p,link);grid.append(card);}section.append(h,grid);dashboard.append(section);}
  group('教材・申請・アカウント',Object.values(views).filter(x=>!x.owner||info.owner));
  group('交流とコンテンツ',[
   {title:'通知の作成・承認',description:'管理者用・利用者用のお知らせ。',file:'admin-notices.html'},
   {title:'フィードバック',description:'新着・対応状況・保管の管理。',file:'admin-feedback.html'},
   {title:'公開デッキと通報',description:'利用者の公開内容を確認。',file:'admin-community.html'},
   {title:'管理者のつぶやき',description:'写真付きのお知らせを投稿。',file:'admin-updates.html'},
   {title:'勉強の掲示板',description:'質問・返信・通報を確認。',file:'board.html'},
   {title:'勉強チャット',description:'教科別の会話を確認。',file:'chat.html'},
   {title:'共有BGM',description:'音楽の追加・保管・再公開。',file:'admin-music.html'},
   {title:'ゲームの公開設定',description:'公開・非公開、お知らせを管理。',file:'admin-games.html'}
  ]);
  const count=document.createElement('p');count.className='sn-admin-summary';count.textContent='登録アカウント '+info.accounts+'人 ／ 管理者 '+info.admins+'人'+(info.owner?' ／ オーナー':'');root.replaceChildren(count,dashboard);
 }
 const api={views,selected,prepareScript,mount,dashboard};if(typeof module==='object'&&module.exports)module.exports=api;else g.StudyAdminSections=api;
})(globalThis);
