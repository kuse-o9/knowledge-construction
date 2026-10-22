'use strict';
(()=>{
 const html=document.documentElement;html.classList.add('study-pending');
 let checking=false,wall=null;
 function restrict(title,message,verify=false){
  html.classList.add('study-restricted');
  if(!wall){wall=document.createElement('main');wall.id='study-access-wall';wall.setAttribute('role','alert');document.body.append(wall);}
  const h=document.createElement('h1');h.textContent=title;const p=document.createElement('p');p.textContent=message;
  const login=document.createElement('a');login.href=verify?'admin-verify.html?next='+encodeURIComponent(location.pathname.split('/').pop()||'admin.html'):'account.html';login.textContent=verify?'管理者の本人確認へ':'オーナーとしてログイン';
  const retry=document.createElement('button');retry.textContent='もう一度確認';retry.onclick=()=>check();
  wall.replaceChildren(h,p,login,retry);html.classList.remove('study-pending');
 }
 async function check(){
  if(checking)return;checking=true;
  try{
   if(!window.Study?.client)throw Error('connection');
   const {data,error}=await Study.client.rpc('study_security_status');if(error||!data)throw Error('connection');
   window.StudyAccessStatus=data;window.dispatchEvent(new CustomEvent('study-access-status',{detail:data}));
   const page=location.pathname.split('/').pop();
   html.classList.toggle('study-maintenance-login',page==='account.html'&&!data.allowed);
   if(!data.allowed&&page==='account.html'){
    html.classList.remove('study-pending','study-restricted');wall?.remove();wall=null;
    let notice=document.getElementById('maintenance-login-notice');if(!notice){notice=document.createElement('p');notice.id='maintenance-login-notice';notice.setAttribute('role','status');document.querySelector('main').prepend(notice);}notice.textContent=data.message+' オーナーのアカウントでログインしてください。';return;
   }
   document.getElementById('maintenance-login-notice')?.remove();
   if(!data.allowed){restrict('メンテナンス中です',data.message);return;}
   if(/^admin(?:-|\.html)/.test(page)&&page!=='admin-verify.html'&&(!data.admin||!data.adminVerified)){
    restrict('管理者の本人確認',data.admin?'管理者アカウントと管理者専用パスワードで本人確認してください。':'管理者アカウントでログインしてください。',true);return;
   }
   html.classList.remove('study-pending','study-restricted');wall?.remove();wall=null;
  }catch{restrict('接続を確認できません','通信状態を確認してから、もう一度お試しください。');}
  finally{checking=false;}
 }
 window.StudyAccessRefresh=check;
 document.addEventListener('DOMContentLoaded',()=>{check();setInterval(()=>{if(!document.hidden)check();},15000);window.Study?.client?.auth.onAuthStateChange(()=>setTimeout(check,0));});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
})();
