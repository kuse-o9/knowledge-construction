/* Version-bound development packets. Publication guard is added during staging. */
'use strict';
(async()=>{
 const id=location.pathname.split('/').pop().replace('.html','');if(!['azusa','kaiji'].includes(id))throw Error('Unknown route');
 if(!window.GamePublication||!(await GamePublication.guard(id)))return;
 GamePublication.registerPause(()=>window.dispatchEvent(new Event('pagehide')));
 const cacheName='bayline-rail-packets-v1';
 const packetKey=(name,hash)=>new URL(name+'?v='+hash,location.href).href;
 async function remember(name,hash,bytes){if(!hash||!window.caches)return;try{const cache=await caches.open(cacheName);await cache.put(packetKey(name,hash),new Response(bytes));const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-6)))await cache.delete(key);}catch{}}
 async function decode(bytes,expected){
  if(bytes.byteLength>8*1024*1024)throw Error('パケットが上限を超えています');
  if(expected){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw Error('データの版が一致しません。再読み込みしてください。');}
  if(typeof DecompressionStream!=='function')throw Error('このブラウザーでは圧縮データを展開できません。最新のChrome・Edge・Safariで開き直してください。');
  return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }
 async function packetOnce(name,expected,fresh){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(name+(expected?'?v='+expected:''),{signal:controller.signal,cache:fresh?'reload':'no-cache'});
   if(!response.ok)throw Error('データを読み込めません（HTTP '+response.status+'）: '+name);
   const bytes=await response.arrayBuffer();
   const value=await decode(bytes,expected);void remember(name,expected,bytes);return value;
  }catch(error){if(controller.signal.aborted)throw Error('データの通信が30秒以内に完了しませんでした。通信を確認して再試行してください。');throw error;}finally{clearTimeout(timer);}
 }
 async function packet(name,expected){let failure;
  for(let attempt=0;attempt<2;attempt++){try{return await packetOnce(name,expected,attempt>0);}catch(error){failure=error;if(typeof DecompressionStream!=='function')throw error;}}
  if(expected&&window.caches)try{const cache=await caches.open(cacheName),saved=await cache.match(packetKey(name,expected));if(saved){const value=await decode(await saved.arrayBuffer(),expected);document.body.dataset.packetRecovery='verified-cache';return value;}}catch{}
  throw failure;
 }
 try{
  const route=await packet(id+'.json.gz',document.body.dataset.packetSha);
  const [common,stock]=await Promise.all([packet('common.json.gz',route.commonSha256),packet('e353.json.gz',route.stockSha256)]);
  window.RAIL_DATA=route.data;window.RAIL_ANNOUNCEMENTS=route.announcements;window.RAIL_RECORDINGS={};window.BaylineReviewedAnnouncements.apply(route.data,route.announcements);window.BATCH_STOCK=stock;window.RAIL_CITY_MODELS=common.city;
  window.BaylineBatchModels.initialize(route.data,common,stock);
  const script=document.createElement('script');script.src='rail.js?v=perf4';script.onerror=()=>showFailure(Error('運転画面を読み込めませんでした。'));document.body.append(script);
 }catch(error){showFailure(error);}
 function showFailure(error){
  const status=document.getElementById('scene-status');status.textContent=String(error.message||error);status.setAttribute('role','alert');Object.assign(status.style,{whiteSpace:'normal',overflowWrap:'anywhere',height:'auto',maxHeight:'none'});document.getElementById('start').disabled=true;document.body.dataset.loadError=status.textContent;
  let retry=document.getElementById('retry-packet-loading');if(!retry){retry=document.createElement('button');retry.id='retry-packet-loading';retry.type='button';retry.textContent='データをもう一度読み込む';retry.onclick=()=>location.reload();status.insertAdjacentElement('afterend',retry);}
 }
})().catch(error=>{document.body.dataset.loadError=error.message;});
