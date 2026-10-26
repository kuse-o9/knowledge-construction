/* Recover failed GPU contexts without reducing scene detail or resolution. */
(function(g){'use strict';
 const live=new Map();
 function release(target){
  const previous=live.get(target),canvases=Array.from(target?.querySelectorAll('canvas')||[]);live.delete(target);
  try{if(previous&&!previous.isDestroyed())previous.destroy();}catch{}
  for(const canvas of canvases){
   try{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
  }
  target?.replaceChildren();
 }
 function create(Ces,container,options={}){
  const target=typeof container==='string'?document.getElementById(container):container;
  if(!target)throw Error('3Dの表示先が見つかりません。');
  if(live.has(target))release(target);
  const attempts=['default','high-performance','low-power'];let cause;
  for(let i=0;i<attempts.length;i++){
   const preference=attempts[i];
   try{
    const viewer=new Ces.Viewer(container,{...options,contextOptions:{...options.contextOptions,webgl:{...options.contextOptions?.webgl,powerPreference:preference,failIfMajorPerformanceCaveat:false}}});
    live.set(target,viewer);target.dataset.rendererAttempt=String(i+1);target.dataset.rendererPreference=preference;
    return viewer;
   }catch(error){
    release(target);if(!/webgl|context|gpu/i.test(String(error?.message||error)))throw error;cause=error;
   }
  }
  throw Object.assign(new Error('3D描画用のGPU接続を開始できませんでした。保存した運転は残っています。'),{code:'WEBGL_START',cause});
 }
 function diagnosticGuide(reason){return /GL_(?:VENDOR|RENDERER)\s*=\s*Disabled/i.test(String(reason))?'\nこの接続はブラウザーから無効と報告されています。サイトの再読み込みでは有効にできません。\nChrome: chrome://settings/system ／ Edge: edge://settings/system\n「グラフィック アクセラレーションが使用可能な場合は使用する」をオンにして、ブラウザーを再起動してください。\nすでにオンなら、Chromeは chrome://gpu、Edgeは edge://gpu の WebGL2 と Problems Detected を確認してください。学校や組織の制限が表示される場合は、管理者に確認してください。設定を変えられない場合も、保存した運転は地図モードで続けられます。':'';}
 function failure(error,pauseAndSave){
  pauseAndSave(false);const status=document.getElementById('scene-status');let message;
  if(error?.code==='WEBGL_START'||/webgl|context|gpu/i.test(String(error?.message||error)))message='3D用のGPU接続（WebGL2）に失敗しました。運転を保存しました。「3Dを再読み込み」で接続し直せます。繰り返す場合は、ほかの3Dタブを閉じ、ブラウザーのグラフィックアクセラレーションを確認してください。';
  else if(/地形|terrain|fetch|network|timeout/i.test(String(error?.message||error)))message='地形データの取得に失敗しました。通信を確認して再試行してください。';
  else message='3Dの準備を完了できませんでした：'+String(error?.message||'不明なエラー').slice(0,160);
  if(status){status.textContent=message;status.setAttribute('role','alert');Object.assign(status.style,{whiteSpace:'normal',overflow:'visible',textOverflow:'clip',overflowWrap:'anywhere',height:'auto',maxHeight:'none',webkitLineClamp:'unset'});}
  let dialog=document.getElementById('rail-gpu-error-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='rail-gpu-error-dialog';Object.assign(dialog.style,{maxWidth:'min(620px,94vw)',maxHeight:'85vh',overflow:'auto',padding:'24px',borderRadius:'12px',whiteSpace:'normal',overflowWrap:'anywhere'});const heading=document.createElement('h2');heading.textContent='3D接続の確認';const body=document.createElement('p');body.id='rail-gpu-error-text';const detail=document.createElement('pre');detail.id='rail-gpu-error-detail';Object.assign(detail.style,{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:'12px'});const probe=document.createElement('button');probe.type='button';probe.textContent='このブラウザーのWebGL2を確認';probe.onclick=()=>{let gl,reason='';const canvas=document.createElement('canvas');canvas.addEventListener('webglcontextcreationerror',e=>{reason=e.statusMessage||'';});try{gl=canvas.getContext('webgl2',{failIfMajorPerformanceCaveat:false});detail.textContent=gl?'WebGL2単体の接続は成功しました。3D画面側の初期化やGPUメモリーの状態を確認する必要があります。':'WebGL2単体でも接続できません。ブラウザーのグラフィックアクセラレーション、GPUドライバー、組織によるブラウザー制限などを確認してください。'+(reason?'\nブラウザーからの理由：'+reason:'')+diagnosticGuide(reason);}catch(e){detail.textContent='確認できません：'+e.message;}finally{try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}}};const close=document.createElement('button');close.type='button';close.textContent='閉じてマップに戻る';close.onclick=()=>dialog.close();dialog.append(heading,body,detail,probe,close);document.body.append(dialog);}
  document.getElementById('rail-gpu-error-text').textContent=message;document.getElementById('rail-gpu-error-detail').textContent=String(error?.cause?.message||error?.message||'').slice(0,1600)+diagnosticGuide(error?.cause?.message||error?.message);
  if(!dialog.open&&typeof dialog.showModal==='function')dialog.showModal();
  let full=document.getElementById('rail-gpu-full-message');if(!full){full=document.createElement('button');full.id='rail-gpu-full-message';full.type='button';full.textContent='エラー全文・接続の確認';full.onclick=()=>{if(!dialog.open)dialog.showModal();};Object.assign(full.style,{position:'fixed',top:'48px',right:'16px',zIndex:'2147483000',maxWidth:'calc(100vw - 32px)',whiteSpace:'normal'});document.body.append(full);}
  let button=document.getElementById('rail-retry3d');if(!button){button=document.createElement('button');button.id='rail-retry3d';button.type='button';button.className='secondary';button.textContent='3Dを再読み込み';dialog.append(button);}button.onclick=()=>{pauseAndSave(true);for(const target of [...live.keys()])release(target);location.reload();};
  console.error('BAYLINE 3D initialization:',error?.code||'SCENE_START',String(error?.message||error));
 }
 addEventListener('pagehide',()=>{for(const target of [...live.keys()])release(target);});
 addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 g.BaylineSceneStart={create,failure,release,diagnosticGuide};
})(window);
