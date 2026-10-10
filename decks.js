'use strict';
(async()=>{
 const $=id=>document.getElementById(id),S=window.Study;let list=[],deck=null,index=0,generation=0,drawing=false,last=null,inkVersion=0;
 const canvas=$('note'),ctx=canvas.getContext('2d');
 function message(s,error=false){$('message').textContent=s;$('message').classList.toggle('error',error);}
 function option(label,value){const o=document.createElement('option');o.textContent=label;o.value=value;return o;}
 const normalize=s=>String(s).normalize('NFKC').toLocaleLowerCase('ja').trim();
 const question=()=>deck?.questions[index];
 let copyBusy=false,copyTarget=null,copyId=null;let communityMode=false,communityPage=1,communityNext=false,communityGeneration=0,reportBusy=false,reportGeneration=0,reportActor=null;const communityId=new URLSearchParams(location.search).get('community');
 let privateOwner=null,authVersion=0,observedSession=null;const personalId=new URLSearchParams(location.search).get('personal');
 const key=suffix=>(privateOwner?'study-personal:'+privateOwner+':':communityMode?'study-community:':'study-v6:')+deck.id+':'+question().id+':'+suffix;
 function write(suffix,value){try{localStorage.setItem(key(suffix),value);}catch{message('ブラウザーの保存容量が足りません。メモは保存できませんでした。',true);}}
 function read(suffix){try{return localStorage.getItem(key(suffix)) || '';}catch{return '';}}
 function catalog(){
  const query=normalize($('search').value),result=list.filter(d=>['genre','subject','grade'].every(f=>!$(f).value || $(f).value===d[f]) && normalize([d.title,d.description,d.genre,d.subject,d.grade].join(' ')).includes(query));
  $('result-count').textContent=result.length+'件';$('deck-list').replaceChildren();
  for(const d of result){
   const card=document.createElement('article');card.className='card deck-card';
   const cover=document.createElement('div');cover.className='deck-cover';const subject=document.createElement('span');subject.className='deck-cover-subject';subject.textContent=d.subject;const symbol=document.createElement('span');symbol.className='deck-cover-symbol';symbol.setAttribute('aria-hidden','true');
   if(/数学|算数/.test(d.subject)){cover.classList.add('math');symbol.textContent='x²';}
   else if(/英語/.test(d.subject)){cover.classList.add('english');symbol.textContent='Aa';}
   else if(/理科|物理|化学|生物/.test(d.subject)){cover.classList.add('science');symbol.textContent='◎';}
   else if(/社会|地理|歴史/.test(d.subject)){cover.classList.add('social');symbol.textContent='世';}
   else symbol.textContent='学';cover.append(subject,symbol);
   const body=document.createElement('div');body.className='deck-card-body';const tags=document.createElement('div');tags.className='tags';for(const value of [d.genre,d.grade]){const tag=document.createElement('span');tag.className='tag';tag.textContent=value;tags.append(tag);}
   const title=document.createElement('h2');title.textContent=d.title;const p=document.createElement('p');p.className='deck-card-description';p.textContent=d.description || '１問ずつ、書いて確かめよう。';
   const footer=document.createElement('div');footer.className='deck-card-footer';const count=document.createElement('span');count.textContent=d.question_count+'問';const button=document.createElement('button');button.textContent='学習する →';button.onclick=()=>open(d.id);footer.append(count,button);body.append(tags,title,p,footer);card.append(cover,body);$('deck-list').append(card);
  }
  if(!result.length){const p=document.createElement('p');p.className='empty-state';p.textContent=list.length?'条件に合うデッキがありません。':'公開中のデッキはまだありません。管理者が問題を追加して公開すると、ここに表示されます。';$('deck-list').append(p);}
 }
 async function load(){
  const ticket=++generation;$('refresh').disabled=true;
  try{const result=await S.api('public_decks');if(ticket!==generation)return;list=result;
   for(const f of ['genre','subject','grade']){const previous=$(f).value;$(f).replaceChildren(option('すべて',''));for(const value of [...new Set(list.map(d=>d[f]))].sort((a,b)=>a.localeCompare(b,'ja')))$(f).add(option(value,value));if([...$(f).options].some(o=>o.value===previous))$(f).value=previous;}
   catalog();message('ジャンル・教科・学年やキーワードから探せます。');
  }catch(e){message(e.message,true);}finally{$('refresh').disabled=false;}
 }
 function show(){
  drawing=false;last=null;const version=++inkVersion,q=question();if(!q)return;
  $('deck-title').textContent=deck.title;$('progress').textContent=(index+1)+' / '+deck.questions.length+'問';$('prompt').textContent=q.prompt;
  $('image').hidden=!q.image_url;if(q.image_url)$('image').src=q.image_url;else $('image').removeAttribute('src');
  $('hint').textContent=q.hint || 'この問題にはヒントがありません。';$('hint').hidden=true;$('answer').hidden=true;$('answer-text').textContent=q.answer;$('explanation').textContent=q.explanation || '解説はありません。';$('response').value=read('text');
  $('prev').disabled=index===0;$('next').disabled=index===deck.questions.length-1;
  ctx.clearRect(0,0,canvas.width,canvas.height);const stored=read('ink');
  if(stored){const image=new Image(),id=q.id;image.onload=()=>{if(question()?.id===id && version===inkVersion && !drawing)ctx.drawImage(image,0,0,canvas.width,canvas.height);};image.src=stored;}
 }
 async function open(id,community=false){
  const ticket=++generation;communityMode=community;$('report-panel').hidden=true;message('問題を読み込んでいます…');
  try{const result=await S.api(privateOwner?'personal_deck':community?'community_deck':'public_deck',{id});if(ticket!==generation)return;if(!result.questions.length)throw new Error('このデッキには問題がありません。');deck=result;index=0;$('copy-deck').hidden=!community;$('report-reason').value='';$('report-panel').hidden=!community;$('catalog').hidden=true;$('practice').hidden=false;show();message('回答を考えてから、答え・解説を確認してください。');$('practice').scrollIntoView({block:'start'});}
  catch(e){message(e.message,true);}
 }
 $('back').onclick=()=>{if(privateOwner){location.href='my-decks.html';return;}generation++;deck=null;communityMode=false;$('report-panel').hidden=true;$('report-reason').value='';$('practice').hidden=true;$('catalog').hidden=false;message('デッキを選んでください。');};
 $('prev').onclick=()=>{if(index>0){index--;show();}};$('next').onclick=()=>{if(index<deck.questions.length-1){index++;show();}};
 $('hint-button').onclick=()=>{$('hint').hidden=!$('hint').hidden;};$('answer-button').onclick=()=>{$('answer').hidden=!$('answer').hidden;};
 $('response').oninput=()=>{if(deck)write('text',$('response').value);};
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
 canvas.onpointerdown=e=>{if(!deck || e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);inkVersion++;drawing=true;last=point(e);ctx.fillStyle='#263653';ctx.beginPath();ctx.arc(last.x,last.y,2,0,Math.PI*2);ctx.fill();};
 canvas.onpointermove=e=>{if(!drawing)return;const p=point(e);ctx.strokeStyle='#263653';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;};
 function finish(){if(!drawing)return;drawing=false;last=null;if(deck)write('ink',canvas.toDataURL('image/png'));}canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
 $('clear-note').onclick=()=>{if(confirm('この問題の手書きメモを消しますか？')){inkVersion++;ctx.clearRect(0,0,canvas.width,canvas.height);write('ink','');}};
 for(const f of ['search','genre','subject','grade'])$(f).addEventListener(f==='search'?'input':'change',catalog);$('refresh').onclick=load;
 async function communityLoad(){const t=++communityGeneration;$('community-refresh').disabled=true;$('community-prev').disabled=true;$('community-next').disabled=true;try{const data=await S.api('community_list',{page:communityPage});if(t!==communityGeneration)return;communityNext=data.hasNext;$('community-list').replaceChildren();$('community-page').textContent=communityPage+'ページ';for(const d of data.items){const card=document.createElement('article');card.className='card';const h=document.createElement('h3');h.textContent=d.title;const p=document.createElement('p');p.textContent=d.description||'みんなが作った問題';const meta=document.createElement('p');meta.className='muted';meta.textContent=d.subject+' / '+d.grade+'・'+d.question_count+'問';const b=document.createElement('button');b.textContent='学習する →';b.onclick=()=>open(d.id,true);card.append(h,p,meta,b);$('community-list').append(card);}if(!data.items.length){const p=document.createElement('p');p.textContent='公開中のお客さんのデッキはまだありません。';$('community-list').append(p);}}catch(e){if(t===communityGeneration)message(e.message,true);}finally{if(t===communityGeneration){$('community-refresh').disabled=false;$('community-prev').disabled=communityPage===1;$('community-next').disabled=!communityNext;}}}
 $('community-refresh').onclick=communityLoad;$('community-prev').onclick=()=>{if(communityPage>1){communityPage--;communityLoad();}};$('community-next').onclick=()=>{if(communityNext){communityPage++;communityLoad();}};
 $('copy-deck').onclick=async()=>{if(copyBusy||!deck||!communityMode)return;const t=generation,av=authVersion,target=deck;copyBusy=true;$('copy-deck').disabled=true;try{if(!confirm('公開中の内容を自分の非公開デッキにコピーします。１人10デッキまでです。コピーしますか？'))return;if(copyTarget!==target.id+':'+target.publication_revision){copyTarget=target.id+':'+target.publication_revision;copyId=crypto.randomUUID();}const result=await S.api('personal_copy_community',{id:target.id,new_id:copyId,publication_revision:target.publication_revision});if(t!==generation||av!==authVersion)return;location.href='my-decks.html?deck='+encodeURIComponent(result.id);}catch(e){if(t===generation&&av===authVersion)message(e.message+' ログイン状態を確認し、保存済みの一覧も確認してください。',true);}finally{copyBusy=false;$('copy-deck').disabled=false;}};
 $('report-form').onsubmit=async e=>{e.preventDefault();if(reportBusy||!deck||!communityMode)return;const reason=$('report-reason').value.trim();if(reason.length<5||reason.length>1000){message('理由を５〜1000文字で書いてください。',true);return;}const target=deck.id,t=generation,rt=reportGeneration;reportBusy=true;$('report-send').disabled=true;try{await S.api('community_report',{id:target,publication_revision:deck.publication_revision,reason});if(t!==generation||rt!==reportGeneration)return;$('report-reason').value='';message('通報を受け付けました。管理者が確認します。');}catch(e){if(t===generation&&rt===reportGeneration)message(e.message,true);}finally{reportBusy=false;$('report-send').disabled=false;}};
 if(!S || S.setupError){message(S?.setupError || '通信を確認してください。',true);return;}
 S.client.auth.onAuthStateChange((event,session)=>{authVersion++;observedSession=session;if((session?.user?.id||null)!==reportActor){copyId=null;copyTarget=null;}const nextReportActor=session?.user?.id||null;if(nextReportActor!==reportActor){reportActor=nextReportActor;reportGeneration++;$('report-reason').value='';}if(privateOwner && session?.user?.id!==privateOwner){generation++;deck=null;privateOwner=null;inkVersion++;ctx.clearRect(0,0,canvas.width,canvas.height);$('response').value='';$('prompt').textContent='';$('answer-text').textContent='';$('explanation').textContent='';$('hint').textContent='';$('image').removeAttribute('src');$('image').hidden=true;$('practice').hidden=true;message('アカウントが切り替わりました。自分のデッキ画面から開き直してください。',true);return;}if(event==='SIGNED_OUT'){$('report-panel').hidden=true;$('report-reason').value='';generation++;deck=null;$('practice').hidden=true;$('catalog').hidden=false;setTimeout(load,0);}});
 if(personalId){
  const authTicket=authVersion;let {data,error}=await S.client.auth.getSession();if(authTicket!==authVersion){data={session:observedSession};error=null;}
  if(error || !data.session){message('自分のデッキを学習するには、アカウント画面からログインしてください。',true);$('catalog').hidden=true;return;}
  privateOwner=data.session.user.id;$('catalog').hidden=true;$('back').textContent='← 自分のデッキ';await open(personalId);
 }else{await load();await communityLoad();if(communityId)await open(communityId,true);}
})();
