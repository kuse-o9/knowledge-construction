// Paid AI correction was removed at the user's request. Keep old clients fail-closed.
const cors={
 'Access-Control-Allow-Origin':'https://kuse-o9.github.io',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Cache-Control':'no-store',
 'Vary':'Origin'
};
export function handler(){
 return async(req:Request)=>req.method==='OPTIONS'
  ?new Response(null,{status:204,headers:cors})
  :new Response(JSON.stringify({disabled:true,configured:false,error:'AI補正は削除されました。動画の編集と手動調整をご利用ください。'}),{status:410,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
}
Deno.serve(handler());
