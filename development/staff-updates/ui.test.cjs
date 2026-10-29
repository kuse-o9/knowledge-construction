'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class El{constructor(){this.children=[];this.textContent='';this.disabled=false;this.hidden=false;this.value='';this.files=[];this.classList={toggle(){}};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}querySelectorAll(){return this.children.flatMap(n=>[...n.children.filter(c=>c.tag==='button')]);}set innerHTML(_){throw Error('Unsafe HTML insertion');}}
function setup(admin=true,photos=false){
 const ids=Object.fromEntries(['message','prev','next','refresh','page','compose','submit','body','list','count','form','photos','photo-note','author'].map(x=>['updates-'+x,new El()]));let handler,authHandler,reply=null;const calls=[];
 const item={id:'post',authorLabel:'管理者',body:'<img src=x onerror=alert(1)>',createdAt:'2026-10-29T10:00:00Z',canDelete:true,images:photos?['post/photo.webp']:[]};
 const context={document:{body:{dataset:{staffAdmin:String(admin)}},getElementById:id=>ids[id],createElement:tag=>Object.assign(new El(),{tag})},window:{Study:{client:{}},StudyAccessStatus:{allowed:true,admin:true,adminVerified:true},addEventListener:(name,f)=>handler=f},Study:{client:{auth:{onAuthStateChange:f=>authHandler=f},storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://example.invalid/photo.webp'}))}),upload:async()=>({data:{}}),remove:async()=>({data:[]})})},rpc:async(name,args)=>{calls.push(args);if(reply)return await reply;return {data:args.p_action==='list'?{items:[item],canPost:true,myLabel:'オーナー',hasNext:args.p_page===1}:{posted:true,deleted:true}};}}},Date,crypto:{randomUUID:()=> 'fixture-id'},StaffPhotos:{validate(){},prepare:async()=>({})},confirm:()=>true};
 vm.runInNewContext(fs.readFileSync('staff-updates.js','utf8'),context);
 return {ids,calls,access:s=>handler({detail:s}),auth:e=>authHandler(e),setReply:r=>reply=r};
}
const tick=()=>new Promise(setImmediate);
(async()=>{
 const s=setup();await tick();assert.equal(s.ids['updates-compose'].hidden,false);assert.equal(s.ids['updates-author'].textContent,'投稿者：オーナー');assert.match(s.ids['updates-list'].children[0].children[0].textContent,/木曜日/);assert.equal(s.ids['updates-list'].children[0].children[1].textContent,'<img src=x onerror=alert(1)>');
 await s.ids['updates-next'].onclick();assert.equal(s.calls.at(-1).p_page,2);assert.equal(s.ids['updates-next'].disabled,true);
 s.ids['updates-body'].value='新しい投稿';s.ids['updates-form'].onsubmit({preventDefault(){}});await tick();assert.equal(s.calls.some(c=>c.p_action==='post'&&c.p_body==='新しい投稿'),true);assert.equal(s.ids['updates-body'].value,'');
 let resolve;s.setReply(new Promise(r=>resolve=r));const pending=s.ids['updates-refresh'].onclick();s.auth('SIGNED_OUT');resolve({data:{items:[{id:'late',body:'late',authorLabel:'管理者',createdAt:'2026-10-29',canDelete:true}],canPost:true}});await pending;
 assert.equal(s.ids['updates-list'].children.length,0);assert.equal(s.ids['updates-compose'].hidden,true);const before=s.calls.length;s.ids['updates-form'].onsubmit({preventDefault(){}});await tick();assert.equal(s.calls.length,before);
 const publicUI=setup(false);await tick();assert.equal(publicUI.ids['updates-list'].children[0].children.length,2);assert.equal(publicUI.ids['updates-form'].onsubmit,undefined);
 publicUI.access({allowed:false});assert.equal(publicUI.ids['updates-list'].children.length,0);
 const withPhotos=setup(true,true);await tick();assert.equal(withPhotos.ids['updates-list'].children[0].children[2].tag,'img');assert.equal(withPhotos.ids['updates-list'].children[0].children[2].loading,'lazy');withPhotos.ids['updates-photos'].files=[{type:'image/jpeg',size:100}];withPhotos.ids['updates-body'].value='写真つき';withPhotos.ids['updates-form'].onsubmit({preventDefault(){}});await tick();assert.equal(withPhotos.calls.find(c=>c.p_action==='post').p_images.length,1);
 const denied=setup();await tick();denied.access({allowed:true,admin:true,adminVerified:false});assert.equal(denied.ids['updates-compose'].hidden,true);
 console.log('PASS: safe text, paging, post payload/clear, logout late-response discard, no reader composer/delete, maintenance and verification gates');
})().catch(e=>{console.error(e);process.exitCode=1;});
