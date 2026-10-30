'use strict';
(()=>{
 const $=id=>document.getElementById(id);let state=null,busy=false,generation=0;
 function clear(){
  generation++;state=null;busy=false;
  $('maintenance-form').hidden=true;
  $('maintenance-state').textContent='';
  $('maintenance-note').value='';
  $('maintenance-on').disabled=true;$('maintenance-off').disabled=true;
  $('maintenance-refresh').disabled=false;
 }
 async function load(){
  const ticket=++generation;state=null;$('maintenance-form').hidden=true;
  const r=await Study.client.rpc('study_security_status');if(ticket!==generation)return;
  if(r.error)throw r.error;state=r.data;
  if(!state?.owner||!state.adminVerified){clear();$('security-message').textContent='オーナーの本人確認を完了してください。';return;}
  $('maintenance-state').textContent=(state.maintenance?'現在：メンテナンス中（オーナーのみ）':'現在：通常公開')+' ／ 手動設定：'+((state.manualMaintenance??state.maintenance)?'ON':'OFF');
  $('maintenance-note').value=state.manualMessage??state.message;
  $('maintenance-on').disabled=(state.manualMaintenance??state.maintenance);$('maintenance-off').disabled=!(state.manualMaintenance??state.maintenance);
  $('maintenance-form').hidden=false;$('security-message').textContent='オーナー権限を確認しました。';
 }
 async function change(enabled){
  if(busy||!state)return;const ticket=generation;busy=true;
  for(const id of ['maintenance-on','maintenance-off','maintenance-refresh'])$(id).disabled=true;
  try{
   const r=await Study.client.rpc('study_security_admin',{p_enabled:enabled,p_message:$('maintenance-note').value.trim(),p_revision:state.revision});
   if(ticket!==generation)return;if(r.error)throw r.error;
   await load();if(!state)return;
   $('security-message').textContent=enabled?'手動メンテナンスを開始しました。':'手動メンテナンスを終了しました。予約が実施中の場合は継続します。';
   await window.StudyAccessRefresh?.();
  }catch(e){
   if(ticket!==generation)return;clear();
   $('security-message').textContent=e.code==='40001'?'別の操作で変更されました。最新の状態に更新してください。':e.code==='42501'?'オーナーの本人確認をやり直してください。':'保存できません。入力と通信状態を確認してください。';
  }finally{
   busy=false;$('maintenance-refresh').disabled=false;
   if(state){$('maintenance-on').disabled=(state.manualMaintenance??state.maintenance);$('maintenance-off').disabled=!(state.manualMaintenance??state.maintenance);}
  }
 }
 Study.client.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'){clear();$('security-message').textContent='ログアウトしました。';}
 });
 window.addEventListener('study-access-status',e=>{
  if(!e.detail?.owner||!e.detail?.adminVerified){clear();$('security-message').textContent='オーナーの本人確認を完了してください。';}
 });
 $('maintenance-on').onclick=()=>change(true);$('maintenance-off').onclick=()=>change(false);
 $('maintenance-refresh').onclick=()=>{if(!busy)load().catch(()=>{clear();$('security-message').textContent='接続を確認できません。';});};
 clear();load().catch(()=>{clear();$('security-message').textContent='接続を確認できません。';});
})();
