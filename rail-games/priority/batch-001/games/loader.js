/* Version-bound development packets. Publication guard is added during staging. */
'use strict';
(async()=>{
 const id=location.pathname.split('/').pop().replace('.html','');if(!['azusa','kaiji'].includes(id))throw Error('Unknown route');
 if(!window.GamePublication||!(await GamePublication.guard(id)))return;
 GamePublication.registerPause(()=>window.dispatchEvent(new Event('pagehide')));
 async function packetOnce(name,expected,fresh){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(name+(expected?'?v='+expected:''),{signal:controller.signal,cache:fresh?'reload':'no-cache'});
   if(!response.ok)throw Error('データを読み込めません（HTTP '+response.status+'）: '+name);
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength>8*1024*1024)throw Error('パケットが上限を超えています');
   if(expected){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw Error('データの版が一致しません。再読み込みしてください。');}
   if(typeof DecompressionStream!=='function')throw Error('このブラウザーでは圧縮データを展開できません。最新のChrome・Edge・Safariで開き直してください。');
   return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  }catch(error){if(controller.signal.aborted)throw Error('データの通信が30秒以内に完了しませんでした。通信を確認して再試行してください。');throw error;}finally{clearTimeout(timer);}
 }
 async function packet(name,expected){
  for(let attempt=0;attempt<2;attempt++){try{return await packetOnce(name,expected,attempt>0);}catch(error){if(attempt===1||typeof DecompressionStream!=='function')throw error;}}
 }
 try{
  const route=await packet(id+'.json.gz',document.body.dataset.packetSha);
  const [common,stock]=await Promise.all([packet('common.json.gz',route.commonSha256),packet('e353.json.gz',route.stockSha256)]);
  window.RAIL_DATA=route.data;window.RAIL_ANNOUNCEMENTS=route.announcements;window.RAIL_RECORDINGS={};window.BaylineReviewedAnnouncements.apply(route.data,route.announcements);window.BATCH_STOCK=stock;window.RAIL_CITY_MODELS=common.city;
  window.BaylineBatchModels.initialize(route.data,common,stock);
  const script=document.createElement('script');script.src='rail.js?v=pa1';script.onerror=()=>showFailure(Error('運転画面を読み込めませんでした。'));document.body.append(script);
 }catch(error){showFailure(error);}
 function showFailure(error){
  const status=document.getElementById('scene-status');status.textContent=String(error.message||error);status.setAttribute('role','alert');Object.assign(status.style,{whiteSpace:'normal',overflowWrap:'anywhere',height:'auto',maxHeight:'none'});document.getElementById('start').disabled=true;document.body.dataset.loadError=status.textContent;
  let retry=document.getElementById('retry-packet-loading');if(!retry){retry=document.createElement('button');retry.id='retry-packet-loading';retry.type='button';retry.textContent='データをもう一度読み込む';retry.onclick=()=>location.reload();status.insertAdjacentElement('afterend',retry);}
 }
})().catch(error=>{document.body.dataset.loadError=error.message;});
