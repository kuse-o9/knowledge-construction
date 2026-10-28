'use strict';
// Bounded adversarial requests against the real downloaded handler, without network I/O.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
if(!process.env.STUDY_EDGE_SOURCE)throw Error('Set STUDY_EDGE_SOURCE');
let source=fs.readFileSync(process.env.STUDY_EDGE_SOURCE,'utf8').replace(/^import .*$/m,'').split('// Supabase runtime entry point')[0];
source=source.replace('export function createHandler','function createHandler')+'\nexports.createHandler=createHandler;';
const api={};vm.runInNewContext(stripTypeScriptTypes(source,{mode:'transform'}),{exports:api,Request,Response,Uint8Array,TextDecoder,crypto,TextEncoder,atob,console,FormData,File,URL});
const actor='00000000-0000-4000-8000-000000000001',victim='00000000-0000-4000-8000-000000000002',sid='10000000-0000-4000-8000-000000000001';
const token='audit.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.test';
let maintenance=false,verified=false,checks=0,authCalls=0;const seen=[];
const server={auth:{getUser:async value=>{authCalls++;return value===token?{data:{user:{id:actor,email:'audit@example.invalid',user_metadata:{admin:true,owner:true,role:'service_role'}}}}:{error:{message:'Invalid test token'}}}},rpc:async(name,args)=>{
 seen.push({name,args});
 if(name==='study_security_service')return {data:{allowed:!maintenance,adminVerified:verified,owner:false,admin:true}};
 if(name==='study_dispatch')return {data:args.p_action==='rate_gate'?{allowed:true}:args.p_action==='admin_bootstrap'?{owner:false}:[]};
 if(name==='study_personal')return args.p_action==='gate'?{data:{allowed:true}}:{data:{id:args.p_input.id,owner_id:actor}};
 if(name==='study_feedback')return args.p_action==='gate'?{data:{allowed:true}}:{error:{code:'42501'}};
 throw Error('Unexpected backend operation '+name);
},storage:{from(){throw Error('Invalid upload reached Storage')}}};
const handler=api.createHandler(server);
const request=(body,headers={},method='POST')=>new Request('https://study.example.invalid/functions/v1/study-api',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
async function reject(r,status,label){const response=await handler(r);assert.equal(response.status,status,label);const body=await response.json();assert(!body.data,label+' leaked data');assert(!JSON.stringify(body).includes('service_role'),label+' leaked internal role');checks++;}
(async()=>{
 for(const raw of ['{','null','[]','42','"test"','{"action":"public_decks","input":[]}','{"action":"public_decks","input":"text"}'])await reject(request(raw),422,'malformed JSON/input');
 for(const auth of ['Basic audit','Bearer invalid','Bearer '+token+' extra'])await reject(request({action:'admin_bootstrap'},{Authorization:auth}),401,'malformed authentication');
 await reject(request({action:'public_decks'},{Origin:'https://attacker.example.invalid'}),403,'foreign origin');
 await reject(request(undefined,{},'GET'),405,'wrong method');
 await reject(request('x'.repeat(65537)),413,'body limit actual bytes');
 await reject(request({action:'public_decks'},{'Content-Length':'65537'}),413,'declared body limit');
 for(const id of ["' OR '1'='1","../../auth/users",'<script>alert(1)</script>',victim+'?select=*','0;drop table auth.users','１０００００００-0000-4000-8000-000000000001']){
  await reject(request({action:'personal_deck',input:{id}}),422,'invalid ID payload');
 }
 for(const input of [{admin:true,owner:true,role:'service_role'},{actor:victim,p_actor:victim,user_id:victim},{__proto__:{admin:true}}]){
  await reject(request({action:'users',input}),403,'role/actor spoof');
 }
 seen.length=0;let response=await handler(request({action:'personal_deck',input:{id:victim,actor:victim,p_actor:victim,owner_id:victim}}));assert.equal(response.status,200);assert.equal(seen.find(x=>x.name==='study_personal'&&x.args.p_action==='get').args.p_actor,actor);checks++;
 // The DB decides ownership; the client cannot choose which account invokes it.
 maintenance=true;
 for(const action of ['public_decks','personal_decks','feedback_stats','users','admin_verify'])await reject(request({action,input:{admin:true,owner:true}}),503,'maintenance bypass attempt');
 maintenance=false;verified=true;
 for(const action of ['add_admin','remove_admin','review_delete'])await reject(request({action,input:{target:victim,id:victim,decision:'reject',reason:'audit reason',confirmEmail:'audit@example.invalid'}}),403,'non-owner owner-only action');
 for(const [type,bytes] of [['image/svg+xml','<svg onload="alert(1)"></svg>'],['image/png','not a PNG image at all'],['text/html','<script>alert(1)</script>']]){
  const f=new FormData();f.set('image',new File([bytes],'audit.'+(type==='image/png'?'png':'svg'),{type}));
  const res=await handler(new Request('https://study.example.invalid/functions/v1/study-api',{method:'POST',headers:{Authorization:'Bearer '+token},body:f}));assert.equal(res.status,422,'invalid image accepted');checks++;
 }
 assert.equal(({}).admin,undefined);checks++;
 console.log(JSON.stringify({pass:true,checks,authCalls,networkRequests:0,realDataWrites:0,scope:'downloaded production handler with mocked Auth/DB; not an HTTP production penetration test'}));
})().catch(e=>{console.error(e);process.exit(1)});
