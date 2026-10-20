'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function packet(name){const boot=read(name+'.html'),inline=boot.match(/<script id="game-bundle"[^>]*>([\s\S]*?)<\/script>/),prefix=name==='sobu'?'sobu-data':name+'-bundle';return JSON.parse(zlib.gunzipSync(inline?Buffer.from(inline[1],'base64'):Buffer.concat([0,1].map(i=>fs.readFileSync(path.join(root,prefix+'-'+i+'.bin')))))).html;}
function context(name){const c=vm.createContext({window:{},console});let data,models,main,core;
 if(name==='yamanote'){data=read('yamanote/rail-data.js');models='window.RAIL_PREBUILT_MODELS='+zlib.gunzipSync(Buffer.concat([0,1].map(i=>fs.readFileSync(path.join(root,'yamanote/rail-models-'+i+'.bin'))))).toString();main=read('yamanote/rail.js');core=read('yamanote/rail-core.js');}
 else if(['west','ome','okutama','fuji','lake'].includes(name)){const p=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'chuo-'+name+'.bin'))));data='window.RAIL_DATA='+JSON.stringify(p.data);models='window.RAIL_PREBUILT_MODELS='+JSON.stringify(p.models);core=read('development/signalled-routes/chuo/rail-core.js');}
 else {const scripts=[...packet(name).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);data=scripts.find(s=>s.startsWith('window.RAIL_DATA='));models=scripts.find(s=>s.startsWith('window.RAIL_PREBUILT_MODELS='));core=read('development/signalled-routes/'+name+'/rail-core.js');main=read('development/signalled-routes/'+name+'/rail.js');}
 for(const s of [data,models,core,read('development/shared/rail-tunnel-runtime.js')])vm.runInContext(s,c);return {c,C:c.RailCore,D:c.window.RAIL_DATA,M:c.window.RAIL_PREBUILT_MODELS,main};
}
for(const name of ['yamanote','chuo','chuo-local','keihin','sobu','west','ome','okutama','fuji','lake'])test(name+': all stations and directions, section speeds, smooth geometry and full automatic run',()=>{
 const {C,D,M}=context(name);assert.equal(M.curveRevision,'smooth-track-v1');
 for(const [direction,r]of Object.entries(D.routes)){
  const geo=C.geometry(r);C.applyElevation(geo,M.groundHeights[direction]);assert.ok(geo.length>1000);
  // Every displayed limit transition belongs to a real physical station boundary.
  for(let d=0;d<geo.length;d+=73){const value=C.speedLimit(geo,d);assert.ok(Number.isFinite(value)&&value>=40&&value<=120);const next=C.speedLimit(geo,d+1);if(value!==next)assert.ok(r.stationSpeeds.some(s=>s.distance>d&&s.distance<=d+1));const p=C.position(geo,d);assert.ok([p.lon,p.lat,p.height,p.heading].every(Number.isFinite));}
  for(const boundary of r.stationSpeeds){assert.ok((r.physicalStops||r.stops).some(s=>s.code===boundary.code&&s.distance===boundary.distance));}
  const s=C.create(r);s.running=true;let steps=0;
  while(!s.complete&&steps++<180000){C.step(s,geo,.1);assert.ok(Number.isFinite(s.distance)&&Number.isFinite(s.speed));}
  assert.equal(s.complete,true,name+' '+direction+' completes');assert.equal(s.missed.length,0);assert.equal(s.visited.length,r.stops.length);assert.equal(s.speed,0);assert.ok(Math.abs(s.distance-r.stops.at(-1).distance)<1);
  for(const station of M.stations.filter(x=>x.direction===direction))assert.ok(r.stops.some(s=>s.code===station.code),'station model retained');
 }
});
test('a sharp curve never lowers the line speed; approaching a station limit still brakes',()=>{
 const {C,c}=context('chuo');const r={points:[[139,35],[139.001,35],[139.001,35.001]],stops:[{code:'A',distance:0},{code:'B',distance:120}],gameMaximum:100,stationSpeeds:[{code:'A',distance:0,limit:100},{code:'B',distance:120,limit:65}]},geo=C.geometry(r);
 assert.equal(C.speedLimit(geo,110),100);assert.equal(C.speedLimit(geo,120),65);assert.ok(C.approachLimit(geo,110)<100);assert.equal(C.speedLimit(geo,40),100);
 const s=C.create(r);Object.assign(s,{doors:false,next:1,distance:100,speed:25,signalLimit:0});assert.equal(C.atcLimit(s,geo),0);
 assert.equal(c.BaylineRouteProfile.stations({...r,physicalStops:[...r.stops,{code:'P',distance:60}]}).find(x=>x.code==='P').pass,true);
});
test('central special and Keihin rapid keep physical stations and a stable stopping index',()=>{
 for(const name of ['chuo','keihin']){const {D,C,c,main}=context(name);for(const base of Object.values(D.routes)){
  const route={...base,physicalStops:base.stops,stops:base.stops.filter(s=>name==='chuo'?[1,2,3,4,5,6,12,16].includes(Number(s.code.slice(2)))||Number(s.code.slice(2))>=19:!['新橋','有楽町','鶯谷','日暮里','西日暮里','御徒町'].includes(s.name))};C.geometry(route);const all=c.BaylineRouteProfile.stations(route);assert.equal(all.length,base.stops.length);assert.ok(all.some(s=>s.pass));assert.ok(main.includes('li.dataset.stopIndex=String(i)'));assert.ok(main.includes('const i=Number(li.dataset.stopIndex)'));}
 }
});
test('Sobu passes local platforms on their original adjacent alignment, without stopping there',()=>{
 const {D,M,c}=context('sobu');for(const [direction,r]of Object.entries(D.routes)){assert.equal(r.stops.length,10);assert.equal(r.physicalStops.length,21);const local=M.stations.filter(s=>s.direction==='local-'+direction);assert.equal(local.length,11);for(const s of local){assert.ok(r.physicalStops.some(p=>p.code===s.code&&p.localPlatform));assert.ok(!r.stops.some(p=>p.code===s.code));assert.ok(c.BaylineRouteProfile.stations(r).find(p=>p.code===s.code).pass);}}
});
test('tunnel polygons are local to the subterranean section; unsupported GPUs retain terrain',()=>{
 const {C,D,c}=context('sobu'),T=c.BaylineTunnels;const geos=Object.fromEntries(Object.entries(D.routes).map(([k,r])=>[k,C.geometry(r)]));
 for(const geo of Object.values(geos)){const rs=T.ranges(geo);assert.equal(rs.length,1);assert.ok(rs[0].end-rs[0].start>2000&&rs[0].end-rs[0].start<6000);assert.ok(!T.near(geo,(rs[0].start+rs[0].end)/2+15000));}
 const viewer={scene:{globe:{},screenSpaceCameraController:{}},entities:{remove(){}}};let result=T.setup(viewer,{ClippingPolygonCollection:{isSupported:()=>false}},geos,()=>{});assert.equal(result.supported,false);assert.equal(viewer.scene.globe.clippingPolygons,undefined);const rs=T.ranges(geos.reverse);assert.equal(T.canRender(geos.reverse,(rs[0].start+rs[0].end)/2),false);
});
test('supported tunnel setup actually assigns globe clipping and renders bounded walls, roof and lights',()=>{
 const {C,D,M,c}=context('sobu'),T=c.BaylineTunnels,geos=Object.fromEntries(Object.entries(D.routes).map(([k,r])=>[k,C.geometry(r)]));
 for(const [key,geo]of Object.entries(geos))C.applyElevation(geo,M.groundHeights[key]);
 class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}static add(a,b){return new V(a.x+b.x,a.y+b.y,a.z+b.z);}static multiplyByScalar(a,n){return new V(a.x*n,a.y*n,a.z*n);}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}}
 class Collection{static isSupported(){return true;}constructor(o){this.polygons=o.polygons;}}
 const Ces={Cartesian3:V,ClippingPolygonCollection:Collection,ClippingPolygon:class{constructor(o){this.positions=o.positions;}},Color:{fromCssColorString:s=>s}},entities=new Set(),viewer={scene:{globe:{},screenSpaceCameraController:{},requestRender(){}},entities:{add:e=>(entities.add(e),e),remove:e=>entities.delete(e)}};
 const frame=(geo,d)=>{const p=C.position(geo,d);return {center:new V(p.lon*90400,p.lat*111200,p.height),left:new V(Math.cos(p.heading),-Math.sin(p.heading),0),up:new V(0,0,1)};};
 const result=T.setup(viewer,Ces,geos,frame);assert.equal(result.supported,true);assert.ok(viewer.scene.globe.clippingPolygons.polygons.length>4);for(const p of viewer.scene.globe.clippingPolygons.polygons)assert.ok(p.positions.length>=4);
 const range=T.ranges(geos.reverse)[0];T.render({direction:'reverse',distance:(range.start+range.end)/2});assert.ok([...entities].some(e=>e.wall));assert.ok([...entities].some(e=>e.polygon));assert.ok([...entities].some(e=>e.ellipsoid));assert.ok(entities.size<1000);
 const floors=[...entities].filter(e=>e.name==='tunnel-floor');assert.ok(floors.length>0,'clipped ground must have a floor below the retained rails');
 for(const floor of floors){const ps=floor.polygon.hierarchy;assert.equal(ps.length,4);assert.equal(floor.polygon.perPositionHeight,true);for(const p of ps)assert.ok([p.x,p.y,p.z].every(Number.isFinite));assert.ok(Math.abs(V.distance(ps[0],ps[3])-20)<1e-6,'floor spans the full 20m opening');assert.ok(Math.abs(V.distance(ps[1],ps[2])-20)<1e-6);}
 T.render({direction:'reverse',distance:range.end-50});assert.ok([...entities].some(e=>e.name==='tunnel-floor'),'portal transition keeps its floor');
 const model=M.tracks.find(m=>m.direction==='reverse'&&m.start===0),filtered=T.model(model);assert.ok(filtered.groups.length<model.groups.length);assert.ok(filtered.groups.some(g=>g.color==='#858d8a'));
 T.render({direction:'reverse',distance:30000});assert.equal(entities.size,0);T.dispose();assert.equal(viewer.scene.globe.clippingPolygons,undefined);
});

test('every through boundary shares coordinates and height in both directions',()=>{
 const all=Object.fromEntries(['chuo','west','ome','okutama','fuji','lake'].map(n=>[n,context(n)]));
 const pairs=[['chuo','west','高尾'],['chuo','ome','立川'],['ome','okutama','青梅'],['west','fuji','大月'],['fuji','lake','富士山']];
 for(const [a,b,name]of pairs)for(const direction of ['reverse','forward']){
  const point=k=>{const {D,M}=all[k],r=D.routes[direction],s=r.stops.find(s=>s.name===name);return [s.lon,s.lat,M.groundHeights[direction][s.index]+r.trackOffsets[s.index]];};
  const x=point(a),y=point(b);assert.ok(Math.hypot((x[0]-y[0])*90400,(x[1]-y[1])*111200)<.01,name+' coordinates');assert.ok(Math.abs(x[2]-y[2])<.01,name+' altitude');
 }
});
test('Yamanote model loader reassembles its compressed package before game initialization',async()=>{
 const c=vm.createContext({window:{},Uint8Array,Response,Blob,DecompressionStream,fetch:async p=>new Response(fs.readFileSync(path.join(root,'yamanote',p.split('?')[0])))});
 vm.runInContext(read('yamanote/rail-models.js'),c);await c.window.RAIL_MODELS_READY;
 assert.equal(c.window.RAIL_PREBUILT_MODELS.curveRevision,'smooth-track-v1');assert.equal(c.window.RAIL_PREBUILT_MODELS.assetRevision,'curves1');assert.ok(read('yamanote/rail.js').includes('await window.RAIL_MODELS_READY'));
});

test('actual acceleration reaches the configured 100/120 km/h instead of the legacy 90 km/h cap',()=>{
 const {C}=context('sobu');
 for(const limit of [100,120]){
  const route={points:[[139,35],[140,35]],stops:[{code:'A',distance:0},{code:'B',distance:80000}],gameMaximum:limit,stationSpeeds:[{code:'A',distance:0,limit}]},geo=C.geometry(route),state=C.create(route);state.running=true;
  for(let i=0;i<2000;i++)C.step(state,geo,.1);
  assert.ok(state.speed*3.6>limit-.1);assert.ok(state.speed*3.6<=limit+.1);
 }
});

test('saving at 100/120 km/h preserves progress on reload while invalid speed is rejected',()=>{
 for(const name of ['yamanote','chuo','chuo-local','keihin','sobu']){
  const {C,D}=context(name),route=D.routes.forward,s=C.create(route);s.distance+=50;s.elapsed=10;
  for(const speed of [100/3.6,120/3.6]){const restored=C.restore({version:1,state:{...s,speed}},route);assert.ok(restored,name+' restores high-speed save');assert.equal(restored.distance,s.distance);assert.equal(restored.speed,0);assert.equal(restored.running,false);}
  assert.equal(C.restore({version:1,state:{...s,speed:50}},route),null);
 }
});
