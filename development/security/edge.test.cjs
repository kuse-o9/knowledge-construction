const ts=require('typescript'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.env.STUDY_EDGE_SOURCE || require('node:path').join(__dirname,'local-study-api.ts'),'utf8').replace(/^import .*$/m,'').split('// Supabase runtime entry point')[0];
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert(!compiled.diagnostics?.length);const apiModule={};vm.runInNewContext(compiled.outputText,{exports:apiModule,Request,Response,Uint8Array,TextDecoder,crypto,atob,console,FormData,File,URL});
const user='00000000-0000-4000-8000-000000000001',sid='10000000-0000-4000-8000-000000000001';const token='x.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.x';
(async()=>{let checks=0,unlocks=0,maintenance=false,isAdmin=true,verified=false,rate=true;const calls=[];
const server={auth:{getUser:async()=>({data:{user:{id:user,email:'owner@example.test'}},error:null})},rpc:async(name,args)=>{calls.push({name,args});if(name==='study_security_service'){
 if(args.p_action==='status')return {data:{allowed:!maintenance,adminVerified:verified,message:'maintenance'}};
 if(args.p_action==='rate')return isAdmin?{data:{allowed:rate}}:{error:{code:'42501'}};
 if(args.p_action==='unlock'){unlocks++;assert.equal(args.p_session,sid);verified=true;return {data:{adminVerified:true}};}
 }if(name==='study_dispatch')return {data:args.p_action==='admin_bootstrap'?{owner:true}: {allowed:true}};return {data:[]};}};
const handler=apiModule.createHandler(server,async(email,password)=>password==='correct'?{id:user}:null);
const req=(action,input={},auth=true)=>new Request('https://api.example.test',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,input})});
for(const input of [{email:'wrong@example.test',password:'correct'},{email:'owner@example.test',password:'wrong'}]){assert.equal((await handler(req('admin_verify',input))).status,403);checks++;}assert.equal(unlocks,0);
assert.equal((await handler(req('admin_bootstrap'))).status,403);checks++;
assert.equal((await handler(req('admin_verify',{email:'owner@example.test',password:'correct'},false))).status,401);checks++;
isAdmin=false;assert.equal((await handler(req('admin_verify',{email:'owner@example.test',password:'correct'}))).status,403);checks++;isAdmin=true;
rate=false;assert.equal((await handler(req('admin_verify',{email:'owner@example.test',password:'correct'}))).status,429);checks++;rate=true;
assert.equal((await handler(req('admin_verify',{email:'OWNER@example.test',password:'correct'}))).status,200);assert.equal(unlocks,1);checks++;
assert.equal((await handler(req('admin_bootstrap'))).status,200);checks++;
maintenance=true;assert.equal((await handler(req('public_decks',{},false))).status,503);assert.equal((await handler(req('public_decks'))).status,503);checks+=2;
assert.equal((await handler(new Request('https://api.example.test',{method:'OPTIONS'}))).status,204);checks++;
assert.equal((await handler(new Request('https://api.example.test',{method:'POST',headers:{Origin:'https://evil.example.test'}}))).status,403);checks++;
console.log(JSON.stringify({pass:true,checks,unlocks}));})().catch(e=>{console.error(e);process.exit(1)});
