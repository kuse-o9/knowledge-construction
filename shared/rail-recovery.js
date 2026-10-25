/* Pause and preserve the trip on context loss; use the full error dialog. */
(function(g){'use strict';
 function watch(viewer,pauseAndSave){
  let failed=false,button=document.getElementById('rail-retry3d');
  if(!button){button=document.createElement('button');button.id='rail-retry3d';button.type='button';button.textContent='3Dを再読み込み';button.className='secondary';const status=document.getElementById('scene-status');status?.parentNode.insertBefore(button,status.nextSibling);}
  button.onclick=()=>{pauseAndSave(true);location.reload();};
  function fail(error){if(failed)return;failed=true;if(g.BaylineSceneStart?.failure)g.BaylineSceneStart.failure(error||Error('3D描画が停止しました。'),pauseAndSave);else{pauseAndSave(false);const status=document.getElementById('scene-status');if(status){status.textContent='3D描画が停止しました。運転記録を保存しました。「3Dを再読み込み」で復帰できます。';status.style.whiteSpace='normal';}}}
  viewer.scene.renderError.addEventListener((scene,error)=>fail(error));
  viewer.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(Object.assign(Error('WebGL2のGPU接続が途中で失われました。'),{code:'WEBGL_START'}));});
  return {fail};
 }
 g.BaylineRecovery={watch};
})(window);
