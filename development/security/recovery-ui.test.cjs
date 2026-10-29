'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class El{constructor(){this.children=[];this.hidden=true;this.disabled=false;this.textContent='';}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}set innerHTML(_){throw Error('Unsafe HTML');}}
const ids=Object.fromEntries(['data-recovery','recovery-status','recovery-list','recovery-refresh','recovery-prev','recovery-next','recovery-page'].map(id=>[id,new El()])),handlers={},calls=[];
let fixtureRows=null;let response,confirmation='復元する';const row={id:'snapshot',bucket:'personal',deck_id:'<img src=x onerror=alert(1)>',kind:'daily',created_at:'2026-10-29T00:00:00Z',current_stamp:null};
const context={document:{getElementById:id=>ids[id],createElement:()=>new El()},window:{StudyAccessStatus:{owner:true,adminVerified:true,allowed:true},addEventListener:(n,f)=>handlers[n]=f},Study:{client:{rpc:async(name,args)=>{calls.push({name,args});return response?await response:{data:args.p_action==='restore'?{restored:true}:{snapshots:fixtureRows||[row]}};}}},prompt:()=>confirmation,Date};
vm.runInNewContext(fs.readFileSync('admin-data-recovery.js','utf8'),context);
(async()=>{
 await new Promise(setImmediate);assert.equal(ids['data-recovery'].hidden,false);assert.equal(ids['recovery-list'].children.length,1);
 assert.equal(ids['recovery-list'].children[0].children[1].textContent.includes('<img'),true);
 confirmation='いいえ';await ids['recovery-list'].children[0].children[2].onclick();assert.equal(calls.length,1);
 confirmation='復元する';await ids['recovery-list'].children[0].children[2].onclick();assert.equal(calls.at(-1).args.p_confirm,'復元する');assert.equal(calls.at(-1).args.p_expected,null);assert.equal(ids['recovery-list'].children.length,0);
 fixtureRows=Array.from({length:101},(_,i)=>({...row,id:'snapshot-'+i,deck_id:'deck-'+i}));await ids['recovery-refresh'].onclick();assert.equal(ids['recovery-list'].children.length,20);assert.equal(ids['recovery-prev'].disabled,true);
 for(let i=0;i<5;i++)ids['recovery-next'].onclick();assert.equal(ids['recovery-list'].children.length,1);assert.equal(ids['recovery-list'].children[0].children[1].textContent,'デッキ番号：deck-100');assert.equal(ids['recovery-next'].disabled,true);ids['recovery-prev'].onclick();assert.equal(ids['recovery-list'].children.length,20);
 let resolve;response=new Promise(r=>resolve=r);const pending=ids['recovery-refresh'].onclick();
 handlers['study-access-status']({detail:{owner:false,adminVerified:false,allowed:false}});resolve({data:{snapshots:[row]}});await pending;
 assert.equal(ids['data-recovery'].hidden,true);assert.equal(ids['recovery-list'].children.length,0);assert.equal(ids['recovery-status'].textContent,'');
 const before=calls.length;await ids['recovery-refresh'].onclick();assert.equal(calls.length,before);
 console.log(JSON.stringify({pass:true,checks:17,lateResponseAfterLogoutDiscarded:true,confirmationRequired:true,unsafeHtmlNotInserted:true}));
})().catch(e=>{console.error(e);process.exit(1);});
