/* Shared presentation only: existing controls, authentication and handlers stay intact. */
'use strict';
(()=>{
 const header=document.querySelector('body > header');if(!header)return;
 const oldNav=header.querySelector('nav');if(!oldNav)return;
 const current=new URL(location.href),page=current.pathname.split('/').pop()||'index.html';
 const originals=[...oldNav.querySelectorAll('a')],claimed=new Set();
 const iconPaths={home:'M3 10 12 3l9 7v10H5V10m5 10v-7h4v7',study:'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',records:'M4 20V4m0 16h17M8 16v-5m5 5V7m5 9v-9',community:'M4 4h16v12H9l-5 4zM8 8h8M8 12h5',creative:'m12 3 2.7 5.5L21 9.4l-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.4l6.3-.9z',account:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',more:'M5 12h.01M12 12h.01M19 12h.01',admin:'M12 3 3 7v6c0 4 9 8 9 8s9-4 9-8V7zM8 12l3 3 5-6'};
 function icon(kind){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('sn-icon');path.setAttribute('d',iconPaths[kind]||iconPaths.study);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;}
 function match(href){const desired=new URL(href,current);return originals.find(a=>{if(claimed.has(a))return false;const u=new URL(a.getAttribute('href'),current);return u.pathname===desired.pathname&&(u.hash===desired.hash||(desired.pathname.endsWith('index.html')&&!desired.hash&&u.hash==='#home'));});}
 function link(label,href,tone='study',kind=tone){let a=match(href);if(a)claimed.add(a);else{a=document.createElement('a');a.href=href;}a.classList.add('sn-nav-link');a.setAttribute('aria-label',label);a.dataset.tone=tone;a.replaceChildren(icon(kind),document.createTextNode(label));const u=new URL(a.href,current);if((u.pathname.split('/').pop()||'index.html')===page&&(!u.hash||u.hash===current.hash)&&a.id!=='game-room-launch')a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');return a;}
 const bar=document.createElement('div');bar.className='sn-header-inner';const brand=header.querySelector('.brand')||document.createElement('a');brand.className='brand sn-brand';brand.href='index.html';brand.innerHTML='<span class="sn-brand-mark" aria-hidden="true">S</span><span>Study <b>Note</b><small>学びを、自分のペースで。</small></span>';
 const nav=document.createElement('nav');nav.className='sn-navigation';nav.setAttribute('aria-label','メインメニュー');
 nav.append(link('ホーム','index.html','home'));
 const definitions=[['学ぶ','study',[['デッキ','decks.html'],['自分のデッキ','my-decks.html'],['練習デッキ','practice.html'],['暗記ノート','memory.html'],['暗記シート','practice.html#memory-math'],['学習タイマー','timer.html']]],['記録','records',[['カレンダー・成長グラフ','journal.html'],['ポイント・アイテム','points.html']]],['交流','community',[['勉強の掲示板','board.html'],['勉強チャット','chat.html'],['協力ミッション','teams.html'],['お知らせ','notices.html'],['管理者のつぶやき','staff-updates.html']]],['つくる・遊ぶ','creative',[['ゲーム',page==='index.html'||page==='practice.html'?'#game-room':'index.html#game-room'],['動画編集','editor/index.html']]]];
 const menus=[];
 function group(title,tone,entries){const details=document.createElement('details');details.className='sn-nav-menu';details.dataset.tone=tone;const summary=document.createElement('summary');summary.append(icon(tone),document.createTextNode(title));const panel=document.createElement('div');panel.className='sn-menu-panel';for(const [label,href]of entries)panel.append(link(label,href,tone));if(panel.querySelector('[aria-current="page"]'))details.classList.add('sn-current-group');details.append(summary,panel);details.addEventListener('toggle',()=>{if(details.open)for(const other of menus)if(other!==details)other.open=false;});menus.push(details);nav.append(details);return panel;}
 for(const definition of definitions)group(...definition);
 nav.append(link('アカウント','account.html','account'));
 const extras=group('管理・ヘルプ','admin',[['管理者ページ','admin.html'],['フィードバック','feedback.html']]);if(/^admin(?:-|\.html)/.test(page))extras.closest('details').classList.add('sn-current-group');
 // Keep page-specific links and nodes (including IDs/listeners) rather than discarding them.
 for(const a of originals)if(!claimed.has(a)){const u=new URL(a.href,current);const duplicate=[...nav.querySelectorAll('a')].some(b=>b!==a&&b.href===u.href);if(duplicate&&!a.id)continue;a.classList.add('sn-nav-link');extras.append(a);}
 nav.addEventListener('click',e=>{if(e.target.closest('a'))for(const menu of menus)menu.open=false;});
 header.classList.add('sn-header');bar.append(brand,nav);header.replaceChildren(bar);
 const main=document.querySelector('main');if(main){if(!main.id)main.id='sn-main';const skip=document.createElement('a');skip.className='sn-skip';skip.href='#'+main.id;skip.textContent='本文へ移動';header.prepend(skip);}
 document.addEventListener('click',e=>{if(!header.contains(e.target))for(const menu of menus)menu.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const menu=menus.find(x=>x.open);if(menu){menu.open=false;menu.querySelector('summary').focus();}}});
 document.body.classList.add('sn-ready');
})();
