/* Retry the same-detail WebGL2 scene with the default GPU before giving up. */
(function(g){'use strict';
 function create(Ces,container,options){const target=typeof container==='string'?document.getElementById(container):container;
  try{return new Ces.Viewer(container,options);}catch(first){
   if(!/webgl|context|gpu/i.test(String(first?.message||first)))throw first;
   // A failed Cesium constructor can leave its widget DOM behind.
   target.replaceChildren();
   try{return new Ces.Viewer(container,{...options,contextOptions:{...options.contextOptions,webgl:{...options.contextOptions?.webgl,powerPreference:'default',failIfMajorPerformanceCaveat:false}}});}
   catch(second){target.replaceChildren();throw Object.assign(new Error('WebGL2の初期化に失敗しました。ブラウザーのグラフィックアクセラレーションを確認し、ほかの3D画面を閉じて再試行してください。'),{code:'WEBGL_START',cause:second});}
  }
 }
 function failure(error,pauseAndSave){pauseAndSave(false);const status=document.getElementById('scene-status');let message;
  if(error?.code==='WEBGL_START'||/webgl|context|gpu/i.test(String(error?.message||error)))message='WebGL2を開始できません。ブラウザーのグラフィックアクセラレーションを確認してから再試行してください。';
  else if(/地形|terrain|fetch|network|timeout/i.test(String(error?.message||error)))message='地形データの取得に失敗しました。通信を確認して再試行してください。';
  else message='3Dの準備を完了できませんでした：'+String(error?.message||'不明なエラー').slice(0,160);
  if(status)status.textContent=message;
  let button=document.getElementById('rail-retry3d');if(!button){button=document.createElement('button');button.id='rail-retry3d';button.type='button';button.className='secondary';button.textContent='3Dを再読み込み';status?.parentNode.insertBefore(button,status.nextSibling);}button.onclick=()=>{pauseAndSave(true);location.reload();};
  console.error('BAYLINE 3D initialization:',error?.code||'SCENE_START',String(error?.message||error));
 }
 g.BaylineSceneStart={create,failure};
})(window);
