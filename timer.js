'use strict';
(()=>{
 const $=id=>document.getElementById(id),KEY='study-note-timer-v4',pageId=crypto.randomUUID();
 const MAX=365*24*60*60*1000,defaults={countdown:25,work:25,short:5,long:15,countdownSeconds:0,workSeconds:0,shortSeconds:0,longSeconds:0,cycles:4};
 const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
 const fresh=(mode='stopwatch',config={...defaults})=>({version:2,mode,config:{...config},phase:'work',round:0,elapsed:0,startedAt:null,finished:false,owner:pageId});
 let state=fresh(),storageError=false;
 function valid(x){return x&&x.version===2&&['stopwatch','countdown','pomodoro'].includes(x.mode)&&x.config&&[['countdown',180],['work',180],['short',60],['long',120]].every(([k,max])=>integer(x.config[k],0,max)&&integer(x.config[k+'Seconds'],0,59)&&x.config[k]*60+x.config[k+'Seconds']>=1)&&integer(x.config.cycles,2,12)&&['work','short','long'].includes(x.phase)&&integer(x.round,0,x.config.cycles)&&Number.isFinite(x.elapsed)&&x.elapsed>=0&&x.elapsed<=MAX&&(x.startedAt===null||(Number.isFinite(x.startedAt)&&x.startedAt>0&&x.startedAt<=Number.MAX_SAFE_INTEGER))&&typeof x.finished==='boolean'&&(!x.finished||x.startedAt===null)&&typeof x.owner==='string'&&x.owner.length<=100;}
 function upgrade(x){if(x?.version===1&&x.config){if(![['countdown',180],['work',180],['short',60],['long',120]].every(([k,max])=>integer(x.config[k],1,max)))throw new Error();x={...x,version:2,config:{...x.config,countdownSeconds:0,workSeconds:0,shortSeconds:0,longSeconds:0}};}return x;}
 function read(){try{const raw=localStorage.getItem(KEY);if(raw===null)return null;const parsed=upgrade(JSON.parse(raw));if(!valid(parsed))throw new Error();return parsed;}catch{storageError=true;$('timer-message').textContent='保存データを読み込めませんでした。この画面で設定し直せます。';return null;}}
 const stored=read();if(stored)state=stored;
 function save(){state.owner=pageId;try{localStorage.setItem(KEY,JSON.stringify(state));storageError=false;}catch{storageError=true;$('timer-message').textContent='状態を保存できません。このタブを開いている間は使えます。';}}
 const duration=()=>{if(state.mode==='stopwatch')return MAX;const k=state.mode==='countdown'?'countdown':state.phase;return (state.config[k]*60+state.config[k+'Seconds'])*1000;};
 function elapsed(now=Date.now()){return Math.min(MAX,state.elapsed+(state.startedAt===null?0:Math.max(0,now-state.startedAt)));}
 function clock(ms,countdown){const s=countdown?Math.ceil(ms/1000):Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':');}
 function hydrate(){for(const [id,k] of [['countdown-minutes','countdown'],['work-minutes','work'],['short-minutes','short'],['long-minutes','long'],['cycle-count','cycles'],...['countdown','work','short','long'].map(k=>[k+'-seconds',k+'Seconds'])])$(id).value=state.config[k];}
 function render(){
  const running=state.startedAt!==null,pomo=state.mode==='pomodoro',down=state.mode!=='stopwatch',value=elapsed();
  $('timer-mode').value=state.mode;$('timer-settings').hidden=!down;$('countdown-settings').hidden=state.mode!=='countdown';$('pomodoro-settings').hidden=!pomo;
  $('phase-label').textContent=down?(pomo?({work:'集中',short:'短い休憩',long:'長い休憩'}[state.phase]):'残り時間'):'経過時間';
  $('timer-display').textContent=clock(down?Math.max(0,duration()-value):value,down);$('timer-display').setAttribute('aria-label',down?'残り時間':'経過時間');
  let label=state.finished?(pomo?'時間です。次の区切りを始めよう。':'時間です！ひと区切りつけよう。'):running?'計測中':value>0?'一時停止中':'準備できたら開始';
  if(running&&state.owner!==pageId)label+='（別のタイマータブで操作中）';
  if($('timer-state').textContent!==label)$('timer-state').textContent=label;
  $('timer-start').textContent=running?'一時停止':value>0?'再開':'開始';$('timer-start').disabled=state.finished;
  $('timer-next').hidden=!(pomo&&state.finished);$('timer-next').textContent=state.phase==='work'?'休憩を開始':'集中を開始';
  $('round-label').hidden=!pomo;$('round-label').textContent='この周期の集中：'+state.round+' / '+state.config.cycles+'回完了';
  for(const x of $('settings-form').querySelectorAll('input,button'))x.disabled=running;
  for(const id of ['countdown-minutes','countdown-seconds'])$(id).disabled=running||state.mode!=='countdown';for(const id of ['work-minutes','work-seconds','short-minutes','short-seconds','long-minutes','long-seconds','cycle-count'])$(id).disabled=running||!pomo;
  document.querySelector('.timer-card').classList.toggle('finished',state.finished);document.title=$('timer-display').textContent+' '+$('phase-label').textContent+'｜Study Note';
 }
 function tick(){
  if(state.startedAt!==null&&state.owner===pageId&&elapsed()>=duration()){
   // Check the last persisted writer before committing completion from a delayed tab.
   if(!storageError){const latest=read();if(latest&&latest.owner!==pageId){state=latest;hydrate();render();return;}}
   state.elapsed=duration();state.startedAt=null;state.finished=true;if(state.mode==='pomodoro'&&state.phase==='work')state.round=Math.min(state.config.cycles,state.round+1);save();
  }
  render();
 }
 function message(text=''){if(!storageError)$('timer-message').textContent=text;}
 function progressed(){return state.startedAt!==null||state.elapsed>0||state.finished||state.round>0||state.phase!=='work';}
 function confirmReset(){return !progressed()||confirm('計測を止めて、時間とポモドーロの回数を最初に戻しますか？');}
 function latest(){if(!storageError){const x=read();if(x){state=x;hydrate();}}if(state.startedAt!==null&&elapsed()>=duration()){save();}tick();}
 $('timer-start').onclick=()=>{latest();if(state.finished)return;if(state.startedAt!==null){state.elapsed=elapsed();state.startedAt=null;}else state.startedAt=Date.now();save();message();tick();};
 $('timer-reset').onclick=()=>{latest();if(!confirmReset())return;state=fresh(state.mode,state.config);save();message('リセットしました。');hydrate();render();};
 $('timer-mode').onchange=()=>{const mode=$('timer-mode').value;latest();if(!confirmReset()){render();return;}state=fresh(mode,state.config);save();message();hydrate();render();};
 $('settings-form').onsubmit=e=>{e.preventDefault();const config={...state.config};
  const times=state.mode==='countdown'?[['countdown',180]]:state.mode==='pomodoro'?[['work',180],['short',60],['long',120]]:[];
  for(const [k,max] of times){const minutes=$(k+'-minutes').value,seconds=$(k+'-seconds').value;config[k]=Number(minutes);config[k+'Seconds']=Number(seconds);if(minutes.trim()===''||seconds.trim()===''||!integer(config[k],0,max)||!integer(config[k+'Seconds'],0,59)||config[k]*60+config[k+'Seconds']<1){message('分と秒は整数で、合計１秒以上にしてください。秒は０〜59、分は表示された範囲です。');return;}}
  if(state.mode==='pomodoro'){config.cycles=Number($('cycle-count').value);if(!integer(config.cycles,2,12)){message('集中回数は２〜12の整数で入力してください。');return;}}
  const requestedMode=state.mode;latest();if(state.mode!==requestedMode){message('別タブで使い方が変更されました。設定し直してください。');return;}if(state.startedAt!==null){message('一時停止してから設定してください。');return;}if(!confirmReset())return;state=fresh(state.mode,config);save();message('設定しました。開始を押して始めよう。');hydrate();render();
 };
 $('timer-next').onclick=()=>{latest();if(state.mode!=='pomodoro'||!state.finished)return;if(state.phase==='work')state.phase=state.round>=state.config.cycles?'long':'short';else{if(state.phase==='long')state.round=0;state.phase='work';}state.elapsed=0;state.finished=false;state.startedAt=Date.now();save();message();render();};
 window.addEventListener('storage',e=>{if(e.key!==KEY)return;if(e.newValue===null){state=fresh();hydrate();render();return;}try{const x=upgrade(JSON.parse(e.newValue));if(!valid(x))throw new Error();state=x;hydrate();render();}catch{$('timer-message').textContent='別タブの保存データを読み込めませんでした。';}});
 document.addEventListener('visibilitychange',tick);window.addEventListener('pageshow',tick);
 // Opening this page takes ownership; its sibling tabs become observers.
 if(state.startedAt!==null)save();hydrate();tick();setInterval(tick,250);
})();
