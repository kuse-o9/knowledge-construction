'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class El{constructor(tag='div'){this.tagName=tag;this.children=[];this.hidden=true;this.disabled=false;this.textContent='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}set innerHTML(_){throw Error('Unsafe HTML insertion');}}
const ids={};for(const id of ['security-guard','guard-status','guard-events','guard-blocks','guard-refresh'])ids[id]=new El();
const handlers={};let calls=[],fail=false;const data={blocked:[{actor:'audit-user',email:'<img src=x onerror=alert(1)>@example.invalid',until:'2026-10-29T00:00:00Z'}],events:[{actor:'audit-user',email:'audit@example.invalid',signal:'identity_spoof',detected_at:'2026-10-28T00:00:00Z',auto_locked:true}]};
const context={document:{getElementById:id=>ids[id],createElement:tag=>new El(tag)},window:{StudyAccessStatus:{owner:true,adminVerified:true,revision:1},addEventListener:(name,fn)=>handlers[name]=fn},Study:{client:{rpc:async(name,args)=>{calls.push({name,args});return fail?{error:{code:'42501'}}:{data:args.p_action==='unblock'?{blocked:[],events:data.events}:data};}}},confirm:()=>true,Date};
vm.runInNewContext(fs.readFileSync('admin-security-guard.js','utf8'),context);
(async()=>{
 await new Promise(setImmediate);let checks=0;
 assert.equal(ids['security-guard'].hidden,false);checks++;
 assert.equal(calls[0].name,'study_security_guard_admin');checks++;
 assert.equal(ids['guard-events'].children.length,1);checks++;
 assert.equal(ids['guard-blocks'].children[0].children[0].textContent.includes('<img'),true);checks++;
 assert.equal(ids['guard-blocks'].children[0].children[0].children.length,0);checks++;
 assert.equal(ids['guard-status'].textContent.includes('計8回'),true);checks++;
 await ids['guard-blocks'].children[0].children[1].onclick();assert.equal(calls.at(-1).args.p_action,'unblock');assert.equal(calls.at(-1).args.p_actor,'audit-user');checks++;
 assert.equal(ids['guard-blocks'].children[0].textContent.includes('ありません'),true);checks++;
 handlers['study-access-status']({detail:{owner:false,adminVerified:true,revision:2}});
 assert.equal(ids['security-guard'].hidden,true);assert.equal(ids['guard-events'].children.length,0);assert.equal(ids['guard-blocks'].children.length,0);checks++;
 fail=true;handlers['study-access-status']({detail:{owner:true,adminVerified:true,revision:3}});await new Promise(setImmediate);
 assert.equal(ids['guard-status'].textContent.includes('取得できません'),true);checks++;
 console.log(JSON.stringify({pass:true,checks,scope:'lightweight DOM/RPC fixtures; not an authenticated browser screenshot'}));
})().catch(e=>{console.error(e);process.exit(1)});
