'use strict';
// Runs the downloaded production handler locally. All external services below are mocks.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const file=process.env.STUDY_EDGE_SOURCE;if(!file)throw Error('Set STUDY_EDGE_SOURCE to the downloaded function');
let source=fs.readFileSync(file,'utf8').replace(/^import .*$/m,'').split('// Supabase runtime entry point')[0];
source=source.replace('export function createHandler','function createHandler')+'\nexports.createHandler=createHandler;';
const api={};vm.runInNewContext(stripTypeScriptTypes(source,{mode:'transform'}),{exports:api,Request,Response,Uint8Array,TextDecoder,crypto,TextEncoder,atob,console,FormData,File,URL});
const actor='00000000-0000-4000-8000-000000000001',sid='10000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',fid='20000000-0000-4000-8000-000000000001';
let invalid=false,denied=false,calls=[],checks=0;
const server={auth:{getUser:async()=>invalid?{error:{message:'invalid'}}:{data:{user:{id:actor,email:'audit@example.invalid'}}}},rpc:async(name,args)=>{
 calls.push({name,args});
 if(name==='study_security_service')return {data:{allowed:true,adminVerified:false,admin:true}};
 if(name==='study_feedback'){
  if(args.p_action==='gate')return {data:{allowed:true}};
  if(denied)return {error:{code:'42501'}};
  return {data:args.p_action==='detail'?{id:fid,sender:actor,images:[]}:{}};
 }
 throw Error('Unexpected privileged backend call: '+name);
}};
const handler=api.createHandler(server);
function req(action,input={},withSid=true){const token='x.'+Buffer.from(JSON.stringify(withSid?{session_id:sid}:{})).toString('base64url')+'.x';return new Request('https://study.example.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,input})});}
(async()=>{
 for(const action of ['admin_bootstrap','admin_decks','admin_deck','users','save_deck','save_question','request_delete','review_delete','audit_list','request_list','add_admin','remove_admin','ban','unban','delete','recover_account','community_admin_list','community_reports','community_admin_deck']){
  const res=await handler(req(action,{page:1}));assert.equal(res.status,403,action);checks++;
 }
 calls=[];assert.equal((await handler(req('feedback_detail',{id:fid,_session:other}))).status,200);checks++;
 const detail=calls.find(c=>c.name==='study_feedback'&&c.args.p_action==='detail');
 assert.equal(detail.args.p_input._session,sid);checks++;
 calls=[];assert.equal((await handler(req('feedback_list',{page:1,_session:other},false))).status,200);checks++;
 assert.equal(calls.find(c=>c.name==='study_feedback'&&c.args.p_action==='list').args.p_input._session,null);checks++;
 denied=true;for(const action of ['feedback_stats','feedback_list','feedback_detail']){const response=await handler(req(action,{id:fid,page:1,admin:true}));assert.equal(response.status,403,action);const body=await response.json();assert(!body.data);checks++;}
 invalid=true;assert.equal((await handler(req('feedback_detail',{id:fid}))).status,401);checks++;
 console.log(JSON.stringify({pass:true,checks,externalServices:'mock',source:'downloaded production handler'}));
})().catch(e=>{console.error(e);process.exit(1)});
