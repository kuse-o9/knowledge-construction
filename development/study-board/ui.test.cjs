'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(root+'/board.html','utf8'),source=fs.readFileSync(root+'/board.js','utf8');
class El{constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.checked=false;}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}set innerHTML(v){throw Error('Unsafe HTML');}}
const tick=()=>new Promise(setImmediate);
function setup(){const ids={};for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g))ids[m[2]]=new El(m[1]);ids['board-category'].value='数学';let auth,access,gate=null;const calls=[];
const post={id:'post',parent:null,title:'題名',body:'<img src=x onerror=alert(1)>',category:'数学',author:'利用者ABCDEF',created_at:'2026-10-31T00:00:00Z',mine:true,revision:1,replies:0};
const Study={client:{auth:{onAuthStateChange:f=>auth=f,getSession:async()=>({data:{session:{user:{id:'u'}}}})},rpc:async(name,input)=>{calls.push(input);if(gate)return gate;return {data:input.p_action==='get'?{posts:[post],admin:false}:input.p_action==='post'?{id:'post',parent:input.p_parent}:{posts:Array.from({length:21},(_,i)=>({...post,id:i?'post'+i:'post'})),admin:false}};}}};
const c={document:{getElementById:id=>ids[id],createElement:tag=>new El(tag),querySelectorAll:()=>Object.values(ids).filter(x=>x.tag==='button')},window:{Study,addEventListener:(e,f)=>access=f},crypto:{randomUUID:()=> 'new-id'},Date,setTimeout:f=>{queueMicrotask(f);return 1;},confirm:()=>true};vm.runInNewContext(source,c);
return{ids,calls,auth:s=>auth('SIGNED_OUT',s),access:s=>access({detail:s}),setGate:p=>gate=p};}
(async()=>{const s=setup();await tick();assert.equal(s.ids['board-list'].children.length,20);assert.equal(s.ids['board-next'].hidden,false);assert.equal(s.ids['board-moderation-label'].hidden,true);
s.ids['board-next'].onclick();await tick();assert.equal(s.calls.at(-1).p_page,2);
s.ids['board-list'].children[0].children[1].onclick();await tick();assert.equal(s.ids['board-thread'].hidden,false);assert.equal(s.ids['board-messages'].children[0].children[2].textContent,'<img src=x onerror=alert(1)>');
s.ids['board-reply-body'].value='返信です';s.ids['board-reply'].onsubmit({preventDefault(){}});await tick();assert(s.calls.some(x=>x.p_action==='post'&&x.p_parent==='post'&&x.p_body==='返信です'));assert.equal(s.ids['board-reply-body'].value,'');
let resolve;s.setGate(new Promise(r=>resolve=r));s.ids['board-back'].onclick();s.auth(null);resolve({data:{posts:[{body:'late'}],admin:true}});await tick();assert.equal(s.ids['board-list'].children.length,0);assert.equal(s.ids['board-messages'].children.length,0);assert.equal(s.ids['board-area'].hidden,true);const n=s.calls.length;s.ids['board-post'].onsubmit({preventDefault(){}});await tick();assert.equal(s.calls.length,n);
console.log('PASS: bounded list/paging, safe text, reply linkage, logout clears and discards late response, no signed-out post');})().catch(e=>{console.error(e);process.exitCode=1;});
