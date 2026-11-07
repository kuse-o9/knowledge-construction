'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {parseHTML}=require(process.env.LINKEDOM_MODULE||'linkedom');
const rootPath=path.resolve(__dirname,'../..');
const fixture=JSON.parse(fs.readFileSync(process.env.ADMIN_LAYOUT_FIXTURE,'utf8'));
async function check(view,owner){
 const {window}=parseHTML('<html><body><div id="root"></div><p id="message"></p></body></html>'),document=window.document,root=document.getElementById('root'),message=document.getElementById('message');
 const calls=[],info={...fixture,owner,accounts:3,admins:1};window.Study={api:async(action)=>{calls.push(action);if(action==='admin_decks')return [];if(action==='users')return {hasNext:false,users:[{id:'fixture-user',nickname:'Fixture',email:'fixture@example.invalid',confirmed:true}]};if(['audit_list','request_list','account_requests'].includes(action))return {hasNext:false,items:[]};throw Error('Unexpected API call '+action);}};
 const context={window,document,console,globalThis:null,URL,Set,Map,Date,confirm:()=>false,prompt:()=>null};context.globalThis=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(rootPath,'admin-sections.js'),'utf8'),context);const api=context.StudyAdminSections;
 if(view==='dashboard'){api.dashboard(root,info);assert.equal(root.querySelectorAll('form').length,0);assert.equal(!!root.querySelector('a[href="admin-owner.html"]'),owner);assert.deepEqual(calls,[]);return;}
 if(view==='owner'&&!owner){assert.throws(()=>api.mount(root,info,view),/オーナー専用/);assert.deepEqual(calls,[]);return;}
 const before=api.mount(root,info,view);assert.ok(root.querySelector('.sn-admin-screen'));assert.ok(root.querySelector('[data-admin-scaffold]').hidden);assert.ok(root.querySelector('[data-admin-scaffold]').inert);
 assert.equal(root.querySelector(before.selector).closest('section').closest('[data-admin-scaffold]'),null,'target is in visible page');
 const script=api.prepareScript(fixture.script,view).replace('export default async function mount','async function mount');
 vm.runInContext(script+'\nglobalThis.start=mount;',context);await context.start(root,info,message);
 const expected={decks:'admin_decks',accounts:'users',owner:'users',requests:'request_list',accountrequests:'account_requests',history:'audit_list'}[view];assert.deepEqual(calls,[expected],view+' reads only its own list');
 const userList=root.querySelector('#user-list');
 if(view==='accounts'){assert.ok(userList.textContent.includes('永久BAN'));assert.ok(!userList.textContent.includes('管理者にする'));}
 if(view==='owner'){assert.ok(userList.textContent.includes('管理者にする'));assert.ok(!userList.textContent.includes('永久BAN'));assert.ok(!userList.textContent.includes('アカウント削除を申請'));}
 assert.throws(()=>api.prepareScript('unknown future module',view),/構成が更新/);
}
(async()=>{for(const owner of [false,true])for(const view of ['dashboard','requests','decks','accountrequests','accounts','owner','history'])await check(view,owner);console.log('PASS actual authorized module fixture: 14 role/page combinations; only the chosen list is loaded, editing forms retained, owner-only controls separated, unknown module fails closed. No production mutations.');})().catch(e=>{console.error(e);process.exit(1)});
