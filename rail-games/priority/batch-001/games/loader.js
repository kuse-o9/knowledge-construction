/* Integrity-checked development packets; existing published games are untouched. */
'use strict';
(async()=>{
 const id=location.pathname.split('/').pop().replace('.html','');if(!['azusa','kaiji'].includes(id))throw Error('Unknown route');
 if(!window.GamePublication||!(await GamePublication.guard(id)))return;
 GamePublication.registerPause(()=>window.dispatchEvent(new Event('pagehide')));
 async function packet(name,expected){const r=await fetch(name);if(!r.ok)throw Error('データを読み込めません: '+name);const bytes=await r.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw Error('パケットが上限を超えています');if(expected){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw Error('データの版が一致しません。再読み込みしてください。');}return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}
 try{
  const route=await packet(id+'.json.gz',document.body.dataset.packetSha);
  const [common,stock]=await Promise.all([packet('common.json.gz',route.commonSha256),packet('e353.json.gz',route.stockSha256)]);
  window.RAIL_DATA=route.data;window.RAIL_ANNOUNCEMENTS=route.announcements;window.RAIL_RECORDINGS={};window.BaylineReviewedAnnouncements.apply(route.data,route.announcements);window.BATCH_STOCK=stock;window.RAIL_CITY_MODELS=common.city;
  window.BaylineBatchModels.initialize(route.data,common,stock);
  const script=document.createElement('script');script.src='rail.js';script.onerror=()=>{document.getElementById('scene-status').textContent='運転画面を読み込めませんでした。再読み込みしてください。';};document.body.append(script);
 }catch(e){document.getElementById('scene-status').textContent=e.message;document.getElementById('start').disabled=true;document.body.dataset.loadError=e.message;}
})().catch(e=>{document.body.dataset.loadError=e.message;});
