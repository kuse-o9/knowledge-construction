'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
if(!process.env.STUDY_EDGE_SOURCE)throw Error('Set STUDY_EDGE_SOURCE');
let source=fs.readFileSync(process.env.STUDY_EDGE_SOURCE,'utf8').replace(/^import .*$/m,'').split('// Supabase runtime entry point')[0].replace('export function createHandler','function createHandler');
source+='\nexports.createHandler=createHandler;exports.signal=securityAttackSignal;';
const api={};vm.runInNewContext(stripTypeScriptTypes(source,{mode:'transform'}),{exports:api,Request,Response,Uint8Array,TextDecoder,crypto,TextEncoder,atob,console,FormData,File,URL});
const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',sid='10000000-0000-4000-8000-000000000001';
let checks=0,signalCalls=[],guardError=false;
for(const [action,input] of [
 ['personal_save_question',{id:actor,deck_id:other,prompt:"SELECT * FROM users; ' OR '1'='1",answer:'../folder',explanation:'<script>教材の例</script>'}],
 ['feedback_submit',{body:'SQLの教材について相談します。../ や SELECT の説明です。'}],
 ['feedback_list',{page:1,admin:true}],['ban',{target:other}],['personal_deck',{id:'typing-error'}],['public_decks',{}]
]){assert.equal(api.signal(action,input,actor),null);checks++;}
for(const input of [{actor:other},{p_actor:other},{user_id:other},{owner_id:other},{role:'service_role'},{owner:true}]){assert.equal(api.signal('users',input,actor),'identity_spoof');checks++;}
for(const input of [{id:'../auth/users'},{target:'%2e%2e%2fauth'},{deck_id:'..\\\\auth'}]){assert.equal(api.signal('personal_deck',input,actor),'path_traversal');checks++;}
for(const input of [{id:"' OR '1'='1"},{question_id:'UNION SELECT password'},{new_id:'<script>alert(1)</script>'}]){assert.equal(api.signal('personal_deck',input,actor),'id_injection');checks++;}
const token='x.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.x';
const server={auth:{getUser:async()=>({data:{user:{id:actor,email:'audit@example.invalid'}}})},rpc:async(name,args)=>{
 if(name==='study_security_service')return {data:{allowed:true,adminVerified:false}};
 if(name==='study_security_guard_signal'){signalCalls.push(args);return guardError?{error:{code:'test'}}:{data:{blocked:true,recorded:true,locked:true}};}
 throw Error('Attack reached protected operation: '+name);
}};
const handler=api.createHandler(server);
const req=(input)=>new Request('https://study.example.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'users',input})});
(async()=>{
 let r=await handler(req({actor:other,p_actor:other}));assert.equal(r.status,403);assert.equal(signalCalls.length,1);assert.equal(signalCalls[0].p_actor,actor);assert.equal(signalCalls[0].p_session,sid);assert.equal(signalCalls[0].p_signal,'identity_spoof');checks+=5;
 guardError=true;r=await handler(req({id:'../auth'}));assert.equal(r.status,503);checks++;
 console.log(JSON.stringify({pass:true,checks,scope:'actual handler with mock Auth/DB; no production maintenance changes'}));
})().catch(e=>{console.error(e);process.exit(1)});
