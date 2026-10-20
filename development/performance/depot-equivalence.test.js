'use strict';
// UI/geometry simulation only. A stub GL validates uploads and calls, NOT GPU output.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const floors=JSON.parse(fs.readFileSync(path.join(__dirname,'../game-room/operator-floors.json'))).floors;
async function boot(old=false,reducedMotion=true){const gpu=true;
  const nodes=new Map(),events={},draws=[],uploads=[];const {createHash}=require('node:crypto'),hash=data=>createHash('sha256').update(Buffer.from(data.buffer,data.byteOffset,data.byteLength)).digest('hex');let bound=null,elevation=0,view='',projection='',locations=0;const buffers=new Map();let count=0,now=0;const frames=[];
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
    bindBuffer:(type,buffer)=>bound=buffer,bufferData:(type,data)=>{assert.ok([...data].every(Number.isFinite));uploads.push(data.length);buffers.set(bound,hash(data));},getUniformLocation:(program,name)=>{locations++;return name;},getAttribLocation:(program,name)=>{locations++;return name==='position'?0:1;},uniform1f:(name,value)=>{if(name==='elevation')elevation=value;},uniformMatrix4fv:(name,transpose,data)=>{if(name==='view')view=hash(data);else projection=hash(data);},
    drawArrays:(...args)=>draws.push([buffers.get(bound),elevation,view,projection,...args])
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
  await vm.runInContext(fs.readFileSync(path.join(__dirname,old?'baseline/depot-webgl.js':'../game-room/depot-webgl.js'),'utf8'),context);
  const flush=async(n=4)=>{for(let i=0;i<n;i++){now+=50;const batch=frames.splice(0);for(const fn of batch)fn(now);await new Promise(r=>setImmediate(r));}};await flush();
  return {nodes,draws,uploads,location,flush,events,get locations(){return locations}};
}

test('every depot draw submits the same geometry, colors, camera and height; static buffers are reused',async()=>{
 const old=await boot(true,false),now=await boot(false,false),canvas=x=>x.nodes.get('depot');
 for(let i=0;i<24;i++)for(const b of [old,now]){b.events.resize();await b.flush();}
 assert.deepEqual(now.draws,old.draws);const idle={oldUploads:old.uploads.length,newUploads:now.uploads.length,oldLocations:old.locations,newLocations:now.locations};
 assert.ok(idle.newUploads<idle.oldUploads/5);assert.ok(idle.newLocations<idle.oldLocations/5);
 for(const key of ['w','a','s','d']){for(const b of [old,now])canvas(b).events.keydown({key,preventDefault(){}});await old.flush(12);await now.flush(12);for(const b of [old,now])b.events.keyup({key});await old.flush();await now.flush();}
 assert.deepEqual(now.draws,old.draws);
 for(const b of [old,now]){b.nodes.get('floor').value=1;b.nodes.get('floor').onchange();}await old.flush(120);await now.flush(120);assert.deepEqual(now.draws,old.draws);
 for(const b of [old,now]){canvas(b).events.webglcontextlost({preventDefault(){}});canvas(b).events.webglcontextrestored();}await old.flush();await now.flush();assert.deepEqual(now.draws,old.draws);
 fs.writeFileSync(path.join(__dirname,'depot-comparison.json'),JSON.stringify({identicalGpuInputs:true,comparedDraws:now.draws.length,idle},null,2));
});
