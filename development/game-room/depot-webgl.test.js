'use strict';
// UI/geometry simulation only. A stub GL validates uploads and calls, NOT GPU output.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const floors=JSON.parse(fs.readFileSync(path.join(__dirname,'operator-floors.json'))).floors;
async function boot(gpu=true,reducedMotion=true){
  const nodes=new Map(),events={},draws=[],uploads=[];let count=0,now=0;const frames=[];
  function node(id=''){
    return {id,hidden:false,disabled:false,value:'',textContent:'',dataset:{},style:{setProperty(){}},children:[],classList:{toggle(){}},
      clientWidth:1000,clientHeight:680,width:0,height:0,
      append(x){this.children.push(x)},replaceChildren(){this.children=[]},
      addEventListener(name,fn){(this.events??={})[name]=fn},
      getBoundingClientRect(){return {left:0,top:0,width:1000,height:680}},
      focus(){},setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){}};
  }
  const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getError:()=>0,
    getAttribLocation:()=>0,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({}),
    bufferData:(type,data)=>{assert.ok([...data].every(Number.isFinite));uploads.push(data.length)},
    drawArrays:(...args)=>draws.push(args)
  },{get:(t,k)=>k in t?t[k]:/^[A-Z_]+$/.test(k)?1:()=>{}});
  const document={currentScript:{src:'http://localhost/development/game-room/depot-webgl.js'},
    getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id)},
    createElement:()=>node(),querySelectorAll:()=>nodes.get('routes')?.children||[]};
  document.getElementById('depot').getContext=()=>gpu?gl:null;
  const location={href:'http://localhost/depot-3d.html'};
  const context=vm.createContext({document,location,URL,Float32Array,Set,Map,Math,Promise,console:{error(){}},
    devicePixelRatio:1,performance:{now:()=>now},matchMedia:()=>({matches:reducedMotion}),
    requestAnimationFrame:fn=>{frames.push(fn);return ++count},
    ResizeObserver:class{observe(){}},addEventListener:(name,fn)=>events[name]=fn,
    fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.pathname)))})});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'depot-webgl.js'),'utf8'),context);
  const flush=async(n=4)=>{for(let i=0;i<n;i++){now+=50;const batch=frames.splice(0);for(const fn of batch)fn(now);await new Promise(r=>setImmediate(r));}};await flush();
  return {nodes,draws,uploads,location,flush,events};
}
test('JR five routes, finite 3D mesh upload, and all 23 independent floors',async()=>{
  const b=await boot(),n=id=>b.nodes.get(id);
  assert.equal(n('train-count').textContent,'5編成 待機中');assert.equal(n('routes').children.length,5);
  assert.equal(n('floor').children.length,23);assert.ok(b.draws.length);assert.ok(b.uploads[0]>10000);
  for(const floor of floors){
    n('floor').value=floor.floor;n('floor').onchange();await b.flush();
    assert.equal(n('depot').dataset.floor,String(floor.floor));
    assert.equal(n('depot').dataset.elevation,String((floor.floor-1)*14));
    assert.equal(n('scene-title').textContent,floor.operator);
    assert.equal(n('route-count').textContent,floor.trains.length+'路線');
    const links=n('routes').children.filter(a=>a.href);
    assert.equal(links.length,floor.trains.length);
    for(const a of links)assert.ok(fs.existsSync(path.join(root,new URL(a.href).pathname)));
    assert.equal(n('down').disabled,floor.floor===1);assert.equal(n('up').disabled,floor.floor===23);
  }
  assert.match(n('train-count').textContent,/1編成/);
});
test('walk up ramp, stop at train and platform walls, board only nearby, reset on travel',async()=>{
  const b=await boot(),c=b.nodes.get('depot'),n=id=>b.nodes.get(id);
  const pos=()=>JSON.parse(c.dataset.player);
  const walk=async(key,frames)=>{c.events.keydown({key,preventDefault(){}});await b.flush(frames);b.events.keyup({key});await b.flush();};
  assert.equal(pos().y,0);assert.equal(n('board').disabled,true);
  c.events.keydown({key:'e',preventDefault(){}});assert.match(b.location.href,/depot-3d/);
  await walk('w',22);assert.ok(pos().y>.9,'ramp reaches platform height');
  await walk('w',60);assert.equal(c.dataset.nearby,'yamanote/index.html');assert.equal(n('board').disabled,false);
  await walk('a',20);assert.ok(pos().x>-18.11,'cannot walk through platform side or train');
  c.events.keydown({key:'e',preventDefault(){}});assert.equal(b.location.href,'http://localhost/yamanote/index.html');
  n('reset').onclick();await b.flush();assert.equal(pos().y,0);assert.equal(pos().z,24.8);
  await walk('d',7);await walk('w',45);await walk('a',20);assert.ok(pos().x>-16.51,'platform wall stops sideways entry');
  n('floor').value=23;n('floor').onchange();await b.flush(8);
  assert.equal(pos().x,2.7);assert.equal(pos().y,0);assert.equal(n('board').disabled,true);
  await walk('w',85);assert.equal(c.dataset.nearby,'railway/index.html');
  n('board').onclick();assert.equal(b.location.href,'http://localhost/railway/index.html');
});
test('no WebGL keeps six route links available',async()=>{
  const b=await boot(false);assert.equal(b.nodes.get('routes').children.length,6);
  assert.match(b.nodes.get('loading').textContent,/3D表示を開始できません/);
});

test('elevator carries the avatar through real intermediate heights with physical doors and stationary floor levels',async()=>{
 const b=await boot(true,false),c=b.nodes.get('depot'),floor=b.nodes.get('floor');floor.value=1;floor.onchange();await b.flush(20);
 assert.equal(c.dataset.floor,'18');assert.ok(Number(c.dataset.elevation)>0&&Number(c.dataset.elevation)<238);assert.equal(c.dataset.liftPhase,'travelling');assert.equal(JSON.parse(c.dataset.player).x,-23);
 await b.flush(120);assert.equal(c.dataset.floor,'1');assert.equal(c.dataset.elevation,'0');assert.equal(c.dataset.liftPhase,'open');assert.equal(floor.disabled,false);
});
