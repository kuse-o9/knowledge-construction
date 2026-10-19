'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function env(data,core){const c=vm.createContext({console,window:{},globalThis:null});c.globalThis=c;
 for(const text of [data,core,fs.readFileSync(path.join(__dirname,'rail-signals.js'),'utf8'),fs.readFileSync(path.join(__dirname,'rail-signal-runtime.js'),'utf8'),fs.readFileSync(path.join(__dirname,'rail-traffic-signalled.js'),'utf8')])vm.runInContext(text,c);
 return c;
}
const zlib=require('node:zlib');
function packet(name){const boot=fs.readFileSync(path.join(root,name+'.html'),'utf8'),inline=boot.match(/<script id="game-bundle"[^>]*>([\s\S]*?)<\/script>/);const files=[...boot.matchAll(/['"]([\w-]+-(?:bundle|data)-\d+\.bin)(?:\?[^'"]*)?['"]/g)].map(m=>m[1]);const bytes=inline?Buffer.from(inline[1],'base64'):Buffer.concat([...new Set(files)].map(p=>fs.readFileSync(path.join(root,p))));return JSON.parse(zlib.gunzipSync(bytes)).html;}

for(const name of ['yamanote','chuo','chuo-local','keihin','sobu'])test(name+': both directions, occupancy, caution, braking and solid signals',()=>{
 let html,data,core;
 if(name==='yamanote'){data=fs.readFileSync(path.join(root,'yamanote/rail-data.js'),'utf8');core=fs.readFileSync(path.join(root,'yamanote/rail-core.js'),'utf8');}
 else{html=packet(name);data=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.startsWith('window.RAIL_DATA='));core=fs.readFileSync(path.join(root,'development/signalled-routes',name,'rail-core.js'),'utf8');
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 }
 const c=env(data,core),D=c.window.RAIL_DATA,C=c.RailCore,R=c.BaylineSignalRuntime,T=c.RailTraffic;
 const geos=Object.fromEntries(Object.entries(D.routes).map(([key,route])=>[key,C.geometry(route)]));R.bind(geos);
 for(const [direction,g]of Object.entries(geos)){
  const {blocks}=R.layout(g);assert.ok(blocks.length>5);assert.equal(blocks.at(-1).end,g.length);
  for(const block of blocks){assert.ok(block.end>block.start);assert.ok(block.end-block.start<=600.001);}
  const index=2,b=blocks[index],lead={id:'lead',direction,distance:b.start+100,length:60,speed:0,next:1,dwell:9999},traffic={trains:[lead],reservations:[],elapsed:0};
  assert.equal(R.aspect(g,index,traffic,null,'player'),'RED');
  assert.equal(R.aspect(g,index-1,traffic,null,'player'),'YELLOW');
  assert.equal(R.aspect(g,index-2,traffic,null,'player'),'GREEN');
  const other=Object.keys(geos).find(k=>k!==direction);lead.direction=other;assert.equal(R.aspect(g,index,traffic,null,'player'),'GREEN');lead.direction=direction;
  const player={direction,distance:b.start-100,length:220};
  const state=C.create(g.route);Object.assign(state,{distance:player.distance,next:g.route.stops.findIndex(s=>s.distance>b.start+150),doors:false,startingDoors:false,running:true,mode:'manual',notch:5,speed:20});
  assert.ok(state.next>0);
  const stop=b.start-5;
  for(let i=0;i<1000;i++){player.distance=state.distance;R.update(state,geos,traffic,player);C.step(state,g,.1);assert.ok(state.distance<=stop+.001,'must not cross a red signal');}
  assert.equal(state.speed,0);assert.ok(state.atcBrake||state.distance<=stop);
  traffic.trains=[];player.distance=state.distance;R.update(state,geos,traffic,player);assert.equal(state.signalAspect,'GREEN');C.step(state,g,.1);assert.ok(state.speed>0,'green releases braking');
  // Reserve/align a configured switch; unresolved or conflicting routes stop trains.
  g.route.signalRoutes={2:{id:'own',trackId:direction,resources:['junction'],switchAligned:false}};assert.equal(R.aspect(g,2,traffic,null,'player'),'RED');
  g.route.signalRoutes[2].switchAligned=true;traffic.reservations=[{id:'other',resources:['junction'],active:true}];assert.equal(R.aspect(g,2,traffic,null,'player'),'RED');traffic.reservations=[];assert.equal(R.aspect(g,2,traffic,null,'player'),'GREEN');delete g.route.signalRoutes;
  const initial=T.create(geos,'rush',{direction,distance:g.route.stops[0].distance,length:220});assert.ok(initial.trains.some(t=>t.direction===direction));
  for(let i=0;i<30;i++)T.step(initial,geos,.1,{direction,distance:g.route.stops[0].distance,length:220});for(const t of initial.trains)assert.ok(Number.isFinite(t.distance)&&Number.isFinite(t.speed));
  // Solid entity geometry is built from the route frame, and old signals are culled.
  const entities=new Set(),vec=class{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}static add(a,b){return new vec(a.x+b.x,a.y+b.y,a.z+b.z)}static multiplyByScalar(a,s){return new vec(a.x*s,a.y*s,a.z*s)}};
  const Ces={Cartesian3:vec,Matrix3:class{static setColumn(){}},Quaternion:class{static fromRotationMatrix(){return {}}},Color:{fromCssColorString:s=>s}};
  const viewer={entities:{add:e=>(entities.add(e),e),remove:e=>entities.delete(e)}},frame=()=>({center:new vec(),forward:new vec(1,0,0),left:new vec(0,1,0),up:new vec(0,0,1)});
  R.render(viewer,Ces,geos,traffic,player,frame);assert.ok([...entities].some(e=>e.cylinder));assert.ok([...entities].some(e=>e.box));assert.ok([...entities].some(e=>e.ellipsoid));assert.ok(entities.size<60);
 }
});
test('loop boundary reads a train straddling zero in both affected blocks',()=>{
 const c=env('',"globalThis.RailCore={speedLimit:()=>80};"),R=c.BaylineSignalRuntime;
 const g={length:1800,route:{loop:true,stops:[]}};R.bind({forward:g});
 const t={trains:[{id:'lead',direction:'forward',distance:20,length:220}],reservations:[]};
 assert.equal(R.aspect(g,0,t,null,'player'),'RED');assert.equal(R.aspect(g,2,t,null,'player'),'RED');
 assert.equal(R.control(g,t,{id:'player',direction:'forward',distance:1400},null).stopDistance,155);
});

for(const segment of ['west','ome','okutama','fuji','lake'])test('chuo extension '+segment+': both directions use the common signal and brake model',()=>{
 const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'chuo-'+segment+'.bin'))));
 const c=env('window.RAIL_DATA='+JSON.stringify(d.data)+';',fs.readFileSync(path.join(root,'development/signalled-routes/chuo/rail-core.js'),'utf8'));
 const geos=Object.fromEntries(Object.entries(d.data.routes).map(([key,r])=>[key,c.RailCore.geometry(r)]));c.BaylineSignalRuntime.bind(geos);
 for(const [direction,g]of Object.entries(geos)){
  assert.ok(c.BaylineSignalRuntime.layout(g).blocks.length>2);
  const traffic={trains:[],reservations:[]},p={direction,distance:0,length:260},s=c.RailCore.create(g.route);
  c.BaylineSignalRuntime.update(s,geos,traffic,p);assert.equal(s.signalAspect,'GREEN');
  const b=c.BaylineSignalRuntime.layout(g).blocks[1];traffic.trains=[{id:'lead',direction,distance:b.start+30,length:20}];
  assert.equal(c.BaylineSignalRuntime.aspect(g,1,traffic,null,'player'),'RED');
 }
});
