'use strict';
(()=>{
 const panel=document.getElementById('security-guard'),status=document.getElementById('guard-status'),events=document.getElementById('guard-events'),blocks=document.getElementById('guard-blocks');
 const names={identity_spoof:'本人・権限の偽装要求',id_injection:'識別番号・操作名への不正な命令',path_traversal:'許可されていない場所への要求'};
 let busy=false,accessKey='',generation=0;
 const text=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 const date=v=>new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
 async function load(){
  if(busy||panel.hidden)return;const ticket=generation;busy=true;document.getElementById('guard-refresh').disabled=true;
  try{
   const result=await Study.client.rpc('study_security_guard_admin',{p_action:'status'});if(ticket!==generation||panel.hidden)return;if(result.error)throw result.error;
   render(result.data);status.textContent='自動防御は有効です。5分以内に2種類以上の不正要求が計8回で、自動メンテナンスに切り替えます。';
  }catch{if(ticket!==generation)return;events.replaceChildren();blocks.replaceChildren();status.textContent='記録を取得できません。オーナーの本人確認と接続状態を確認してください。';}
  finally{if(ticket===generation){busy=false;document.getElementById('guard-refresh').disabled=false;}}
 }
 function render(data){
  blocks.replaceChildren();events.replaceChildren();
  for(const b of data.blocked){
   const row=document.createElement('article');row.className='card';row.append(text('p',(b.email||b.actor)+' ／ 停止期限：'+date(b.until)));
   const button=text('button','このアカウントの一時停止を解除');button.type='button';
   button.onclick=async()=>{
    if(busy||!confirm('このアカウントの一時停止を解除しますか？全体のメンテナンスは継続します。'))return;
    const ticket=generation;busy=true;button.disabled=true;
    try{const result=await Study.client.rpc('study_security_guard_admin',{p_action:'unblock',p_actor:b.actor});if(ticket!==generation||panel.hidden)return;if(result.error)throw result.error;render(result.data);status.textContent='一時停止を解除しました。全体を再開する場合は、上のメンテナンス設定を確認してください。';}
    catch{if(ticket!==generation)return;status.textContent='解除できません。オーナーの本人確認と接続状態を確認してください。';button.disabled=false;}
    finally{if(ticket===generation)busy=false;}
   };row.append(button);blocks.append(row);
  }
  if(!data.blocked.length)blocks.append(text('p','自動防御で一時停止中のアカウントはありません。'));
  for(const e of data.events){
   const row=document.createElement('article');row.className='user-row';
   row.append(text('p',date(e.detected_at)+' ／ '+(names[e.signal]||'不正な要求')+(e.auto_locked?' ／ 自動メンテナンス開始':'')));
   row.append(text('p','要求元の登録アカウント：'+(e.email||e.actor||'不明')));events.append(row);
  }
  if(!data.events.length)events.append(text('p','不正要求の検知記録はありません。'));
 }
 function access(s){
  panel.hidden=!s?.owner||!s?.adminVerified;
  if(panel.hidden){generation++;busy=false;events.replaceChildren();blocks.replaceChildren();status.textContent='';accessKey='';return;}
  const key=s.owner+':'+s.adminVerified+':'+s.revision;
  if(key!==accessKey){generation++;busy=false;accessKey=key;load();}
 }
 document.getElementById('guard-refresh').onclick=load;
 window.addEventListener('study-access-status',e=>access(e.detail));
 if(window.StudyAccessStatus)access(window.StudyAccessStatus);
 else Study.client.rpc('study_security_status').then(r=>{if(!r.error)access(r.data);});
})();

