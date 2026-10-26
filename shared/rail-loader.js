/* Retain exact original mesh packets; share the corrected scene/driver code. */
(async()=>{'use strict';const options=JSON.parse(document.currentScript.dataset.route),status=document.getElementById('loading'),retry=document.getElementById('retry-loading');
 let busy=false;
 async function readPart(path,fresh){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{const response=await fetch(path+'?v='+options.sha256,{signal:controller.signal,cache:fresh?'reload':'no-cache'});if(!response.ok)throw Error('模型データの通信エラー（HTTP '+response.status+'）。');return new Uint8Array(await response.arrayBuffer());}
  catch(error){if(controller.signal.aborted)throw Error('模型データの通信が45秒以内に完了しませんでした。');throw error;}
  finally{clearTimeout(timer);}
 }
 async function load(){if(busy)return;busy=true;retry.hidden=true;retry.disabled=true;
 try{
 if(window.GamePublication&&!await GamePublication.guard(options.id))return;
 if(typeof DecompressionStream!=='function')throw Error('圧縮データの展開機能が使えません。最新のChrome・Edge・Safariで開いてください。');
 let bytes;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const parts=[];for(let i=0;i<options.parts.length;i++){status.textContent='車両・ホーム・街のモデルを準備しています… '+(i+1)+' / '+options.parts.length+(attempt?'（再取得）':'');parts.push(await readPart(options.parts[i],attempt>0));}
   bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(let i=0;i<parts.length;i++){bytes.set(parts[i],offset);offset+=parts[i].length;parts[i]=null;}
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==options.sha256)throw Error('模型データの版が一致しません。');
   break;
  }catch(error){bytes=null;if(attempt===1)throw error;status.textContent='模型データをもう一度取得しています…';}
 }
 const bundle=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());bytes=null;let html=bundle.html;
 const marker='<script>/* BAYLINE shared signal model',a=html.indexOf(marker);if(a<0)throw Error('共通処理の版を確認できませんでした。');const b=html.indexOf('</script>',a);html=html.slice(0,a)+'<script src="shared/rail-scene-shared.js"></script>'+html.slice(b+9);
 const last=html.lastIndexOf('<script>'),end=html.indexOf('</script>',last);if(last<0||!html.slice(last,end).includes('function modelGeometry'))throw Error('運転処理の版を確認できませんでした。');
 html=html.slice(0,last)+'<script src="shared/rail-scene-start.js?v=gpu9"></script><script src="shared/rail-mesh-cache.js"></script><script src="shared/rail-recovery.js"></script><script src="'+options.driver+'?v=gpu6"></script>'+html.slice(end+9);
 document.open();document.write(html);document.close();
 }catch(error){status.textContent=(error.message||'読み込めませんでした。')+' 下のボタンから再試行できます。';status.setAttribute('role','alert');retry.hidden=false;}finally{busy=false;retry.disabled=false;}}
 retry.onclick=()=>void load();await load();})();
