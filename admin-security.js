'use strict';
(()=>{
 const $=id=>document.getElementById(id);let state=null,busy=false;
 async function load(){const r=await Study.client.rpc('study_security_status');if(r.error)throw r.error;state=r.data;
  $('maintenance-form').hidden=!state.owner||!state.adminVerified;
  if(!state.owner){$('security-message').textContent='この設定を変更できるのはオーナーだけです。';return;}
  if(!state.adminVerified){$('security-message').textContent='管理者の本人確認を完了してください。';return;}
  $('maintenance-state').textContent=(state.maintenance?'現在：メンテナンス中（オーナーのみ）':'現在：通常公開')+' ／ 手動設定：'+((state.manualMaintenance??state.maintenance)?'ON':'OFF');$('maintenance-note').value=state.manualMessage??state.message;
  $('maintenance-on').disabled=(state.manualMaintenance??state.maintenance);$('maintenance-off').disabled=!(state.manualMaintenance??state.maintenance);$('security-message').textContent='オーナー権限を確認しました。';
 }
 async function change(enabled){if(busy||!state)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const r=await Study.client.rpc('study_security_admin',{p_enabled:enabled,p_message:$('maintenance-note').value.trim(),p_revision:state.revision});if(r.error)throw r.error;await load();$('security-message').textContent=enabled?'手動メンテナンスを開始しました。':'手動メンテナンスを終了しました。予約が実施中の場合は継続します。';await window.StudyAccessRefresh?.();}
  catch(e){$('security-message').textContent=e.code==='40001'?'別の操作で変更されました。最新の状態に更新してください。':e.code==='42501'?'オーナーの本人確認をやり直してください。':'保存できません。入力と通信状態を確認してください。';}
  finally{busy=false;$('maintenance-refresh').disabled=false;if(state){$('maintenance-on').disabled=(state.manualMaintenance??state.maintenance);$('maintenance-off').disabled=!(state.manualMaintenance??state.maintenance);}}
 }
 $('maintenance-on').onclick=()=>change(true);$('maintenance-off').onclick=()=>change(false);$('maintenance-refresh').onclick=()=>{if(!busy)load().catch(()=>{$('security-message').textContent='接続を確認できません。';});};load().catch(()=>{$('security-message').textContent='接続を確認できません。';});
})();
