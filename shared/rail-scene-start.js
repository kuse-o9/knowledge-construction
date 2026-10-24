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
 function failure(error,pauseAndSave){
  pauseAndSave(false);const status=document.getElementById('scene-status');let message;
  if(error?.code==='WEBGL_START'||/webgl|context|gpu/i.test(String(error?.message||error)))message='3D用のGPU接続（WebGL2）に失敗しました。運転を保存しました。「3Dを再読み込み」で接続し直せます。繰り返す場合は、ほかの3Dタブを閉じ、ブラウザーのグラフィックアクセラレーションを確認してください。';
  else if(/地形|terrain|fetch|network|timeout/i.test(String(error?.message||error)))message='地形データの取得に失敗しました。通信を確認して再試行してください。';
  else message='3Dの準備を完了できませんでした：'+String(error?.message||'不明なエラー').slice(0,160);
  if(status)status.textContent=message;
  let button=document.getElementById('rail-retry3d');if(!button){button=document.createElement('button');button.id='rail-retry3d';button.type='button';button.className='secondary';button.textContent='3Dを再読み込み';status?.parentNode.insertBefore(button,status.nextSibling);}button.onclick=()=>{pauseAndSave(true);for(const target of [...live.keys()])release(target);location.reload();};
  console.error('BAYLINE 3D initialization:',error?.code||'SCENE_START',String(error?.message||error));
 }
 addEventListener('pagehide',()=>{for(const target of [...live.keys()])release(target);});
 addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 g.BaylineSceneStart={create,failure,release};
})(window);
