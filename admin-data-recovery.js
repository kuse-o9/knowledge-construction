'use strict';
(()=>{
 const panel=document.getElementById('data-recovery'),status=document.getElementById('recovery-status'),list=document.getElementById('recovery-list'),refresh=document.getElementById('recovery-refresh');
 const previous=document.getElementById('recovery-prev')||Object.assign(document.createElement('button'),{type:'button',textContent:'前のページ'}),next=document.getElementById('recovery-next')||Object.assign(document.createElement('button'),{type:'button',textContent:'次のページ'}),position=document.getElementById('recovery-page')||document.createElement('span');
 if(!document.getElementById('recovery-prev'))panel.append(previous,position,next);
 let allowed=false,busy=false,generation=0,page=0,snapshots=[];const pageSize=20;
 function buttons(){previous.disabled=busy||!allowed||page===0;next.disabled=busy||!allowed||(page+1)*pageSize>=snapshots.length;position.textContent=snapshots.length?(page+1)+' / '+Math.ceil(snapshots.length/pageSize)+'ページ':'';}
 const node=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 async function load(){
  if(!allowed||busy)return;const ticket=generation;busy=true;refresh.disabled=true;buttons();
  try{
   const {data,error}=await Study.client.rpc('study_data_guard_admin',{p_action:'status'});
   if(ticket!==generation||!allowed)return;if(error)throw error;
   snapshots=data.snapshots;page=Math.min(page,Math.max(0,Math.ceil(snapshots.length/pageSize)-1));render();
  }catch{if(ticket===generation&&allowed){snapshots=[];page=0;list.replaceChildren();status.textContent='取得できません。オーナーの本人確認と接続状態を確認してください。';}}
  finally{if(ticket===generation){busy=false;refresh.disabled=false;buttons();}}
 }
 function render(){
  list.replaceChildren();
   for(const item of snapshots.slice(page*pageSize,(page+1)*pageSize)){
    const row=node('article','');row.className='card';
    row.append(node('p',(item.bucket==='personal'?'個人用':'管理者用')+' ／ '+new Date(item.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' ／ '+(item.kind==='deleted'?'削除前':'変更前')));
    row.append(node('p','デッキ番号：'+item.deck_id));
    const restore=node('button','この時点へ復元');restore.type='button';
    restore.onclick=async()=>{
     if(!allowed||busy||prompt('現在の内容をこの時点に戻し、共有・公開は停止します。実行する場合だけ「復元する」と入力してください。')!=='復元する')return;
     const token=generation;busy=true;restore.disabled=true;refresh.disabled=true;buttons();
     try{
      const result=await Study.client.rpc('study_data_guard_admin',{p_action:'restore',p_id:item.id,p_confirm:'復元する',p_expected:item.current_stamp});
      if(token!==generation||!allowed)return;if(result.error)throw result.error;
      status.textContent='復元しました。内容を確認してから、必要に応じて再公開してください。';snapshots=[];page=0;list.replaceChildren();
     }catch{if(token===generation&&allowed)status.textContent='復元できませんでした。ほかの編集・権限切れ・保存上限が考えられます。最新の一覧へ更新して再確認してください。';}
     finally{if(token===generation){busy=false;restore.disabled=false;refresh.disabled=false;buttons();}}
    };
    row.append(restore);list.append(row);
   }
   status.textContent=snapshots.length?'復旧用コピー '+snapshots.length+'件。'+(page*pageSize+1)+'〜'+Math.min(snapshots.length,(page+1)*pageSize)+'件を表示しています。':'まだ復旧用コピーはありません。デッキ変更・削除の直前に自動で保存します。';
  buttons();
 }
 function access(s){
  const next=!!(s?.owner&&s?.adminVerified&&s?.allowed);if(next===allowed)return;
  allowed=next;generation++;busy=false;panel.hidden=!allowed;snapshots=[];page=0;list.replaceChildren();status.textContent='';refresh.disabled=false;
  buttons();if(allowed)void load();
 }
 previous.onclick=()=>{if(!allowed||busy||page===0)return;page--;render();};
 next.onclick=()=>{if(!allowed||busy||(page+1)*pageSize>=snapshots.length)return;page++;render();};
 refresh.onclick=load;window.addEventListener('study-access-status',e=>access(e.detail));
 if(window.StudyAccessStatus)access(window.StudyAccessStatus);
 else{const ticket=generation;Study.client.rpc('study_security_status').then(r=>{if(ticket===generation&&!r.error)access(r.data);}).catch(()=>{});}
})();
