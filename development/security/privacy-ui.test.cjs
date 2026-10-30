'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../../admin-security.js'),'utf8');
function setup(){
 const nodes=new Map(),listeners={},queue=[];let auth;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',value:''});return nodes.get(id);};
 const Study={client:{rpc:()=>new Promise((resolve,reject)=>queue.push({resolve,reject})),auth:{onAuthStateChange:f=>auth=f}}};
 const win={addEventListener:(e,f)=>listeners[e]=f};
 vm.runInNewContext(source,{document:{getElementById:get},Study,window:win});
 return {get,queue,auth:e=>auth(e),access:s=>listeners['study-access-status']({detail:s})};
}
const tick=()=>new Promise(r=>setImmediate(r));
const data={owner:true,adminVerified:true,maintenance:true,manualMaintenance:true,manualMessage:'private draft',revision:1};
(async()=>{
 let a=setup();a.queue.shift().resolve({data});await tick();
 assert.equal(a.get('maintenance-form').hidden,false);assert.equal(a.get('maintenance-note').value,'private draft');
 a.auth('SIGNED_OUT');assert.equal(a.get('maintenance-form').hidden,true);assert.equal(a.get('maintenance-note').value,'');assert.equal(a.get('maintenance-state').textContent,'');
 a=setup();a.auth('SIGNED_OUT');a.queue.shift().resolve({data});await tick();
 assert.equal(a.get('maintenance-form').hidden,true);assert.equal(a.get('maintenance-note').value,'');
 a=setup();a.queue.shift().resolve({data});await tick();a.get('maintenance-on').onclick();
 a.auth('SIGNED_OUT');a.queue.shift().resolve({data:{}});await tick();assert.equal(a.queue.length,0);assert.equal(a.get('maintenance-note').value,'');
 a=setup();a.queue.shift().resolve({data});await tick();a.access({owner:true,adminVerified:false});assert.equal(a.get('maintenance-form').hidden,true);assert.equal(a.get('maintenance-note').value,'');
 a=setup();a.queue.shift().resolve({data:{owner:false,adminVerified:false}});await tick();assert.equal(a.get('maintenance-form').hidden,true);
 console.log('PASS: logout clears fields; late read and write cannot restore; access downgrade clears; nonowner hidden');
})().catch(e=>{console.error(e);process.exitCode=1});
