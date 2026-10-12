'use strict';
(()=>{
 const S=window.Study,$=id=>document.getElementById(id);let actor=null,epoch=0,wallet=null,data=null,tail=Promise.resolve(),pending=0,authReady=false,lastFailure=null,purchase=null;
 const badgeNames={first_card:'はじめの一枚',learned_five:'覚えた５連続',login_three:'３日連続ログイン',hundred_cards:'100枚の積み重ね'};
 let burstTimer;
 const strip=document.querySelector('.points-strip');
 if(strip){const panel=document.createElement('section');panel.id='learning-progress';panel.className='card learning-progress';panel.hidden=true;strip.after(panel);const toast=document.createElement('div');toast.id='points-celebration';toast.className='points-celebration';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.hidden=true;document.body.append(toast);}
 function progressView(){const panel=$('learning-progress');if(!panel)return;panel.replaceChildren();panel.hidden=!data?.progress;if(panel.hidden)return;const p=data.progress;const title=document.createElement('h2');title.textContent='今日の積み重ね';panel.append(title);const text=document.createElement('p');text.textContent='連続ログイン '+p.login_streak+'日（最高 '+p.best_login+'日） ・ 覚えた連続 '+p.learned_streak+'枚（最高 '+p.best_learned+'枚） ・ 累計 '+p.total_cards+'枚';panel.append(text);const hint=document.createElement('p');hint.className='muted';hint.textContent='「覚えた」の自己判定の記録です。同じ日の獲得済みカードは連続記録に加えません。';panel.append(hint);const grid=document.createElement('div');grid.className='progress-missions';for(const [target,reward]of [[10,20],[30,40]]){const item=document.createElement('div');const label=document.createElement('p');label.textContent='今日 '+target+'枚に取り組む：'+Math.min(data.today,target)+' / '+target+'枚 ・ '+reward+' pt '+(p.missions.includes(target)?'獲得済み':data.today>=target?'保有上限のため報酬待ち':'');const meter=document.createElement('progress');meter.max=target;meter.value=Math.min(data.today,target);meter.setAttribute('aria-label','今日'+target+'枚のミッション');item.append(label,meter);grid.append(item);}panel.append(grid);const badges=document.createElement('div');badges.className='progress-badges';for(const [id,name]of Object.entries(badgeNames)){const badge=document.createElement('span');const earned=p.badges.includes(id);badge.className=earned?'badge earned':'badge';badge.textContent=(earned?'🏅 ':'🔒 ')+name;badges.append(badge);}panel.append(badges);}
 function celebrate(result){const toast=$('points-celebration');if(!toast||(!result.awarded&&!result.bonus&&!result.new_badges?.length))return;const parts=[];if(result.awarded)parts.push('＋'+result.awarded+' pt');if(result.bonus)parts.push('ミッション達成！＋'+result.bonus+' pt');for(const id of result.new_badges||[])parts.push('バッジ獲得：'+(badgeNames[id]||id));toast.textContent=parts.join(' ・ ');toast.hidden=false;toast.classList.remove('pop');void toast.offsetWidth;toast.classList.add('pop');clearTimeout(burstTimer);burstTimer=setTimeout(()=>toast.hidden=true,3500);}
 const say=text=>{if($('points-message'))$('points-message').textContent=text;};
 function clear(){clearTimeout(burstTimer);if($('points-celebration'))$('points-celebration').hidden=true;wallet=null;data=null;lastFailure=null;purchase=null;render();window.dispatchEvent(new Event('study-points-change'));}
 function render(){
  progressView();
  if($('points-balance'))$('points-balance').textContent=wallet?wallet.balance+' pt':'— pt';
  if($('points-today'))$('points-today').textContent=data?'今日 '+data.today+' / '+data.daily_limit+'枚 ・ ブースター残り '+wallet.booster+'枚':actor?'ポイントを読み込んでいます…':'ログインするとポイントを貯められます。';
  if($('points-earned'))$('points-earned').textContent=wallet?'これまで獲得：'+wallet.earned+' pt':'';
  if($('points-shop'))$('points-shop').hidden=!wallet;
  if($('buy-booster'))$('buy-booster').disabled=!wallet||pending>0||wallet.balance<30||wallet.booster>0;
  if($('buy-hint')){$('buy-hint').disabled=!wallet||pending>0||wallet.balance<80||wallet.hint_owned;$('buy-hint').textContent=wallet?.hint_owned?'交換済み':'80 ptで交換する';}
  if($('auto-hint')){$('auto-hint').checked=!!wallet?.auto_hint;$('auto-hint').disabled=!wallet?.hint_owned||pending>0;}
  if($('points-refresh'))$('points-refresh').disabled=!actor||pending>0;
  if($('points-retry')){$('points-retry').hidden=!lastFailure;$('points-retry').disabled=pending>0;}
 }
 function accept(result){if(!result?.wallet)throw new Error('ポイントの応答を読み込めませんでした。');data=result;wallet=result.wallet;render();window.dispatchEvent(new Event('study-points-change'));}
 function enqueue(work){const ticket=epoch,id=actor;pending++;render();const job=tail.then(async()=>{if(!authReady||!id||id!==actor||ticket!==epoch)return;const {data:session,error}=await S.client.auth.getSession();if(error||session.session?.user?.id!==id){if(ticket===epoch){epoch++;actor=null;clear();say('ログイン状態が変わりました。ログインし直してください。');}return;}await work(ticket,id);});tail=job.catch(()=>{});return job.finally(()=>{pending--;render();});}
 function error(e,ticket){if(ticket!==epoch)return false;if(e.status===401||e.status===403){epoch++;actor=null;clear();}say(e.message);return true;}
 async function refresh(){if(!actor)return;const ticket=epoch;try{await enqueue(async t=>{const result=await S.api('points_wallet');if(t!==epoch)return;accept(result);celebrate(result);say('ポイントはアカウントに保存されています。');});}catch(e){error(e,ticket);}}
 function scoped(ticket,id){return ticket===epoch&&id===actor;}
 async function claim(q){
  if(!authReady||!actor||q.actor!==actor)return;
  if(pending>=10){say('ポイントの処理が混み合っています。少し待って、カードをもう一度判定してください。');return;}
  const ticket=epoch;try{await enqueue(async(t,id)=>{const result=await S.api('points_claim',{source:q.source,deck_id:q.deck_id,question_id:q.question_id,rating:q.rating});if(!scoped(t,id))return;accept(result);celebrate(result);lastFailure=null;
   say(result.awarded?'＋'+result.awarded+' pt！学習おつかれさま。'+(result.bonus?' ミッション達成：＋'+result.bonus+' pt':''):result.reason==='daily_limit'?'今日の獲得上限60枚に達しました。学習は続けられます。':result.reason==='balance_limit'?'ポイントの保有上限です。アイテム交換で使えます。':'このカードの今日のポイントは獲得済みです。');render();});}
  catch(e){if(error(e,ticket)&&q.actor===actor){lastFailure=q;say(e.message+' ポイントの保存を再試行できます。');render();}}
 }
 async function buy(item){
  if(!wallet||pending>0)return;
  const label=item==='booster'?'ポイントブースター（次の10枚を10 ptにする・30 pt）':'ヒント自動表示（ずっと使える・80 pt）';
  if(!confirm(label+'と交換しますか？'))return;
  if(!purchase||purchase.item!==item||purchase.revision!==wallet.revision)purchase={id:crypto.randomUUID(),item,revision:wallet.revision};const request={...purchase},user=actor,ticket=epoch;
  try{await enqueue(async(t,id)=>{const result=await S.api('points_buy',request);if(!scoped(t,id))return;accept(result);purchase=null;say(result.bought?'交換しました！':'この交換はすでに完了しています。');});}
  catch(e){if(error(e,ticket)&&user===actor){say(e.message+' 最新のポイントを確認してから、もう一度お試しください。');if(e.status===409)await refresh();}}
 }
 window.StudyPoints={claim,autoHint:scope=>!!wallet?.auto_hint&&scope.split(':')[1]===actor};
 window.addEventListener('study-card-rated',e=>{if(e.detail)void claim(e.detail);});
 if($('buy-booster'))$('buy-booster').onclick=()=>buy('booster');if($('buy-hint'))$('buy-hint').onclick=()=>buy('auto_hint');
 if($('auto-hint'))$('auto-hint').onchange=async()=>{if(!wallet||pending>0)return;const ticket=epoch,input={revision:wallet.revision,auto_hint:$('auto-hint').checked};try{await enqueue(async(t,id)=>{const result=await S.api('points_preference',input);if(!scoped(t,id))return;accept(result);say(input.auto_hint?'ヒントを自動表示します。':'ヒントの自動表示をオフにしました。');});}catch(e){render();error(e,ticket);}};
 if($('points-refresh'))$('points-refresh').onclick=refresh;if($('points-retry'))$('points-retry').onclick=()=>{if(lastFailure)void claim(lastFailure);};
 if(!S||S.setupError){say(S?.setupError||'接続設定を確認してください。');render();return;}
 function identity(session){const next=session?.user?.id||null;authReady=true;if(next===actor){if(next&&!wallet)setTimeout(refresh,0);return;}epoch++;actor=next;clear();say(next?'ポイントを読み込んでいます…':'ログインするとポイントとアイテムを使えます。');if(next)setTimeout(refresh,0);}
 S.client.auth.onAuthStateChange((event,session)=>identity(session));
 const initial=epoch;S.client.auth.getSession().then(({data,error})=>{if(initial!==epoch)return;if(error){authReady=true;say('ログイン状態を確認できませんでした。');return;}identity(data.session);}).catch(()=>say('ログイン状態を確認できませんでした。'));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&actor&&pending===0)void refresh();});render();
})();
