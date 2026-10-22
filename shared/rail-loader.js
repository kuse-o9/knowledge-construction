/* Retain exact original mesh packets; share the corrected scene/driver code. */
(async()=>{'use strict';const options=JSON.parse(document.currentScript.dataset.route),status=document.getElementById('loading'),retry=document.getElementById('retry-loading');retry.onclick=()=>location.reload();try{
 if(window.GamePublication&&!await GamePublication.guard(options.id))return;
 const parts=await Promise.all(options.parts.map(async path=>{const r=await fetch(path+'?v='+options.sha256.slice(0,12));if(!r.ok)throw Error('模型データの読込に失敗しました。');return new Uint8Array(await r.arrayBuffer());}));
 const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==options.sha256)throw Error('模型データの版が一致しません。再読み込みしてください。');
 const bundle=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());let html=bundle.html;
 const marker='<script>/* BAYLINE shared signal model',a=html.indexOf(marker);if(a<0)throw Error('共通処理の版を確認できませんでした。');const b=html.indexOf('</script>',a);html=html.slice(0,a)+'<script src="shared/rail-scene-shared.js"></script>'+html.slice(b+9);
 const last=html.lastIndexOf('<script>'),end=html.indexOf('</script>',last);if(last<0||!html.slice(last,end).includes('function modelGeometry'))throw Error('運転処理の版を確認できませんでした。');
 html=html.slice(0,last)+'<script src="shared/rail-mesh-cache.js"></script><script src="shared/rail-recovery.js"></script><script src="'+options.driver+'"></script>'+html.slice(end+9);
 document.open();document.write(html);document.close();
 }catch(error){status.textContent=(error.message||'読み込めませんでした。')+' 下のボタンから再試行できます。';retry.hidden=false;}})();
