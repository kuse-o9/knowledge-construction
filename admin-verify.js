'use strict';
(async()=>{
 const form=document.getElementById('admin-verify'),note=document.getElementById('verify-message');
 const email=document.getElementById('verify-email'),password=document.getElementById('verify-password');
 let busy=false;
 try{
  const {data,error}=await Study.client.auth.getUser();if(error||!data.user){note.textContent='先にアカウント画面でログインしてください。';return;}
  const status=await Study.client.rpc('study_security_status');if(status.error)throw status.error;
  if(!status.data.admin){note.textContent='このアカウントは管理者として登録されていません。';return;}
  email.value=data.user.email||'';form.hidden=false;note.textContent='メールアドレスとパスワードを確認してください。';
 }catch{note.textContent='接続を確認できません。再読み込みしてください。';}
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;form.querySelector('button').disabled=true;
  const secret=password.value;password.value='';
  try{
   await Study.api('admin_verify',{email:email.value.trim(),password:secret});
   const next=new URLSearchParams(location.search).get('next');
   location.replace(/^admin(?:-[a-z]+)?\.html$/.test(next||'')&&next!=='admin-verify.html'?next:'admin.html');
  }catch(err){note.textContent=err.message||'本人確認できませんでした。';}
  finally{busy=false;form.querySelector('button').disabled=false;}
 };
})();
