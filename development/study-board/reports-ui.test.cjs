'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(root+'/board.html','utf8'),source=fs.readFileSync(root+'/board.js','utf8');
class El{constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.checked=false;this.open=false;}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}showModal(){this.open=true;}close(){this.open=false;}set innerHTML(_){throw Error('Unsafe HTML insertion');}}
const tick=()=>new Promise(setImmediate);
function setup(admin=false){
 const ids={};for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g))ids[m[2]]=new El(m[1]);ids['board-category'].value='数学';
 let auth,access,gate=null,already=false,done=false;const calls=[];
 const post={id:'post',parent:null,title:'質問',body:'本文',category:'数学',author:'利用者',created_at:'2026-10-31T03:00:00Z',mine:false,revision:1,replies:0};
 const report={id:'report',post_id:'post',root_id:'post',title:'質問',preview:'<script>preview</script>',category:'暴言・誹謗中傷',reason:'<img src=x onerror=alert(1)>',revision:1,created_at:post.created_at,status:'open'};
 const Study={client:{auth:{onAuthStateChange:f=>auth=f,getSession:async()=>({data:{session:{user:{id:'user'}}}})},rpc:async(name,input)=>{calls.push({name,...input});if(gate)return gate;if(name==='study_board_report'){
  if(input.p_action==='list')return {data:{reports:Array.from({length:done?1:21},()=>({...report,status:done?'done':'open'}))}};
  if(input.p_action==='resolve'){done=true;return {data:{ok:true}};}return{data:{received:true,already}};
 }return{data:input.p_action==='get'?{posts:[post],admin}:{posts:[post],admin}};}}};
 vm.runInNewContext(source,{document:{getElementById:id=>ids[id],createElement:tag=>new El(tag),querySelectorAll:()=>Object.values(ids).filter(x=>x.tag==='button')},window:{Study,addEventListener:(e,f)=>access=f},crypto:{randomUUID:()=> 'id'},Date,setTimeout:f=>{queueMicrotask(f);return 1;},confirm:()=>true});
 return{ids,calls,auth:()=>auth('SIGNED_OUT',null),setGate:p=>gate=p,setAlready:v=>already=v,access:s=>access({detail:s})};
}
(async()=>{
 const s=setup();await tick();assert.equal(s.ids['board-reports'].hidden,true);s.ids['board-list'].children[0].children[1].onclick();await tick();
 const actions=s.ids['board-messages'].children[0].children.at(-1);actions.children.find(x=>x.textContent==='通報する').onclick();assert.equal(s.ids['board-report-dialog'].open,true);
 s.ids['report-reason'].value='悪口が書かれています';s.ids['board-report-form'].onsubmit({preventDefault(){}});await tick();
 assert(s.calls.some(x=>x.name==='study_board_report'&&x.p_action==='report'&&x.p_post==='post'&&x.p_reason==='悪口が書かれています'));assert.equal(s.ids['board-report-dialog'].open,false);assert.equal(s.ids['report-reason'].value,'');
 s.setAlready(true);actions.children.find(x=>x.textContent==='通報する').onclick();s.ids['report-reason'].value='再試行';s.ids['board-report-form'].onsubmit({preventDefault(){}});await tick();assert.match(s.ids['board-status'].textContent,/受け付け済み/);
 const a=setup(true);await tick();assert.equal(a.ids['board-reports'].hidden,false);a.ids['reports-refresh'].onclick();await tick();assert.equal(a.ids['reports-list'].children.length,20);assert.equal(a.ids['reports-next'].hidden,false);assert.equal(a.ids['reports-list'].children[0].children[4].textContent,'通報理由：<img src=x onerror=alert(1)>');
 const done=a.ids['reports-list'].children[0].children.at(-1).children.find(x=>x.textContent==='対応済みにする');done.onclick();await tick();assert(a.calls.some(x=>x.p_action==='resolve'&&x.p_id==='report'&&x.p_revision===1));
 let resolve;a.setGate(new Promise(r=>resolve=r));a.ids['reports-refresh'].onclick();a.auth();resolve({data:{reports:[{reason:'late secret'}]}});await tick();assert.equal(a.ids['reports-list'].children.length,0);assert.equal(a.ids['board-reports'].hidden,true);
 assert(html.includes('暴言、誹謗中傷'));assert(html.includes('虚偽・大量の通報'));assert(html.includes('自動削除・自動停止にはしません'));
 console.log('PASS report button/modal/send/duplicate notice, verified admin panel, safe reason text, bounded list, resolve revision, logout late-response discard, conduct rules');
})().catch(e=>{console.error(e);process.exitCode=1;});
