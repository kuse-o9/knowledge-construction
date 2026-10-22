'use strict';
(async()=>{
 const $=id=>document.getElementById(id),form=$('admin-verify'),note=$('verify-message');
 let busy=false,state=null;
 const go=()=>{const next=new URLSearchParams(location.search).get('next');location.replace(/^admin(?:-[a-z]+)?\.html$/.test(next||'')&&next!=='admin-verify.html'?next:'admin.html');};
 try{
  const {data,error}=await Study.client.auth.getUser();if(error||!data.user){note.textContent='先にアカウント画面でログインしてください。';return;}
  const status=await Study.client.rpc('study_security_status');if(status.error)throw status.error;state=status.data;
  if(!state.admin){note.textContent='このアカウントは管理者として登録されていません。';return;}
  $('verify-email').value=data.user.email||'';form.hidden=!state.adminPasswordConfigured;$('password-owner').hidden=!state.owner;
  note.textContent=state.adminPasswordConfigured?'アカウントと管理者専用の、２つのパスワードを確認してください。':state.owner?'管理者専用パスワードが未設定です。下のオーナー用フォームで設定してください。':'管理者専用パスワードが未設定です。オーナーに初回設定を依頼してください。';
  $('password-owner-title').textContent=state.adminPasswordConfigured?'管理者専用パスワードを変更・再設定':'管理者専用パスワードを初めて設定する';
 }catch{note.textContent='接続を確認できません。再読み込みしてください。';return;}
 async function submit(action,secret,dedicated){
  busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await Study.api(action,{email:$('verify-email').value.trim(),password:secret,adminPassword:dedicated,revision:state.adminPasswordRevision});go();}
  catch(err){note.textContent=err.message||'本人確認できませんでした。';note.scrollIntoView?.({block:'center'});}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const secret=$('verify-password').value,dedicated=$('admin-password').value;$('verify-password').value='';$('admin-password').value='';await submit('admin_verify',secret,dedicated);};
 $('admin-password-set').onsubmit=async e=>{
  e.preventDefault();if(busy||!state?.owner)return;
  const a=$('new-admin-password'),b=$('new-admin-again'),owner=$('owner-password');
  if(a.value!==b.value){note.textContent='２つの専用パスワードが一致していません。';return;}
  if(!/^[!-~]{16,64}$/.test(a.value)){note.textContent='半角の英数字・記号16〜64文字で入力してください。';return;}
  if(!$('saved-admin-password').checked){note.textContent='専用パスワードを控えてからチェックしてください。';return;}
  const secret=owner.value,dedicated=a.value;owner.value='';a.value='';b.value='';$('saved-admin-password').checked=false;await submit('admin_password_set',secret,dedicated);
 };
 $('show-admin-password').onchange=()=>{$('new-admin-password').type=$('show-admin-password').checked?'text':'password';};
 $('generate-admin-password').onclick=()=>{if(busy)return;const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-=?@';let value='';const bytes=new Uint8Array(64),limit=Math.floor(256/chars.length)*chars.length;while(value.length<24){crypto.getRandomValues(bytes);for(const n of bytes){if(n<limit)value+=chars[n%chars.length];if(value.length===24)break;}}$('new-admin-password').value=value;$('new-admin-again').value=value;$('saved-admin-password').checked=false;$('show-admin-password').checked=true;$('new-admin-password').type='text';};
 for(const id of ['new-admin-password','new-admin-again'])$(id).addEventListener('input',()=>{$('saved-admin-password').checked=false;});
})();
