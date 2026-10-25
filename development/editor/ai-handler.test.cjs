const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{stripTypeScriptTypes}=require('node:module');
let source=fs.readFileSync('app/supabase/functions/studio-ai/index.ts','utf8').replace('export function handler','function handler').replace(/^Deno\.serve.*$/m,'');source=stripTypeScriptTypes(source)+'\nhandler;';
(async()=>{
 let providerCalls=0,secretReads=0;
 const factory=vm.runInNewContext(source,{Response,Request,fetch(){providerCalls++;throw Error('External calls are forbidden');},Deno:{env:{get(){secretReads++;throw Error('Secret access is forbidden');}}}});
 const serve=factory();const runs=[];
 for(const [method,action,auth]of [['POST','correct',true],['POST','correct',false],['POST','status',true],['GET',null,false],['DELETE',null,true]]){
  const headers={'Content-Type':'application/json'};if(auth)headers.Authorization='Bearer old-client-fixture';
  const res=await serve(new Request('https://example.test/studio-ai',{method,headers,...(method==='POST'?{body:JSON.stringify({action,consent:true,frames:['old-frame']})}:{})}));
  assert.equal(res.status,410);const body=await res.json();assert.equal(body.disabled,true);assert.equal(body.configured,false);assert.equal(body.correction,undefined);runs.push({method,action,auth,pass:true});
 }
 const preflight=await serve(new Request('https://example.test/studio-ai',{method:'OPTIONS'}));assert.equal(preflight.status,204);assert.equal(providerCalls,0);assert.equal(secretReads,0);
 console.log(JSON.stringify({pass:true,runs,preflight:204,providerCalls,secretReads}));
})().catch(e=>{console.error(e);process.exitCode=1});
