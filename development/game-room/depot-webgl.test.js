'use strict';
// UI/geometry simulation only. A stub GL validates uploads and calls, NOT GPU output.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const floors=JSON.parse(fs.readFileSync(path.join(__dirname,'operator-floors.json'))).floors;
async function boot(gpu=true){
  const nodes=new Map(),events={},draws=[],uploads=[];let count=0;
  function node(id=''){
    return {id,hidden:false,disabled:false,value:'',textContent:'',dataset:{},style:{setProperty(){}},children:[],classList:{toggle(){}},
      clientWidth:1000,clientHeight:680,width:0,height:0,
      append(x){this.children.push(x)},replaceChildren(){this.children=[]},
      addEventListener(name,fn){(this.events??={})[name]=fn},
      getBoundingClientRect(){return {left:0,top:0,width:1000,height:680}},
      setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){}};
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
    devicePixelRatio:1,performance:{now:()=>0},matchMedia:()=>({matches:true}),
    requestAnimationFrame:fn=>{setImmediate(()=>fn(1000));return ++count},
    ResizeObserver:class{observe(){}},addEventListener:(name,fn)=>events[name]=fn,
    fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.pathname)))})});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'depot-webgl.js'),'utf8'),context);
  const flush=()=>new Promise(r=>setImmediate(()=>setImmediate(r)));await flush();
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
test('ray click selects the actual visible JR train; dragging never navigates',async()=>{
  const b=await boot(),c=b.nodes.get('depot');
  // Project a point on the front of the original green train using initial camera.
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const norm=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const eye=[Math.sin(.25)*Math.cos(.12)*68,3+Math.sin(.12)*68,Math.cos(.25)*Math.cos(.12)*68-5];
  const f=norm(sub([0,3,-5],eye)),r=norm(cross(f,[0,1,0])),u=cross(r,f),v=sub([-20,2.5,12.17],eye),z=dot(v,f),t=Math.tan(Math.PI/8);
  const e={clientX:500+dot(v,r)/z/t*340,clientY:340-dot(v,u)/z/t*340,button:0,pointerId:1};
  c.events.pointermove(e);assert.match(b.nodes.get('hover-note').textContent,/山手線で出発/);
  c.events.pointerdown(e);c.events.pointermove({...e,clientX:e.clientX+70});c.events.pointerup(e);
  assert.equal(b.location.href,'http://localhost/depot-3d.html');
  b.nodes.get('reset').onclick();await b.flush();
  c.events.pointerdown(e);c.events.pointerup(e);assert.equal(b.location.href,'http://localhost/yamanote/index.html');
});
test('no WebGL keeps six route links available',async()=>{
  const b=await boot(false);assert.equal(b.nodes.get('routes').children.length,6);
  assert.match(b.nodes.get('loading').textContent,/3D表示を開始できません/);
});
