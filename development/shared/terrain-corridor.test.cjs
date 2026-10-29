'use strict';
// CPU geometry/ownership checks. This does not certify physical GPU rendering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('development/shared/rail-tunnel-runtime.js');
for(const file of ['shared/rail-tunnel-runtime.js','shared/rail-scene-shared.js','rail-games/priority/batch-001/games/shared.js'])assert.ok(read(file).includes(source.trim()),'same terrain runtime: '+file);
const fixture=read('development/shared/rail-route-upgrade.test.js');
const prefix=fixture.slice(fixture.indexOf('function packet('),fixture.indexOf("for(const name of ['yamanote'"));
const fixtures={};vm.runInNewContext(prefix+'\nfixtures.context=context;',{fixtures,fs,path,zlib,vm,root,read,console,Buffer});
class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}static add(a,b){return new V(a.x+b.x,a.y+b.y,a.z+b.z);}static multiplyByScalar(a,n){return new V(a.x*n,a.y*n,a.z*n);}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}}
class Collection{static isSupported(){return true;}constructor(o){this.polygons=o.polygons||[];}}
const Ces={Cartesian3:V,ClippingPolygonCollection:Collection,ClippingPolygon:class{constructor(o){this.positions=o.positions;}},Color:{fromCssColorString:s=>s}};
function contains(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
let directions=0,samples=0,peakEntities=0,reused=0;
function scan(name,C,geos,T){
 const entities=new Set(),viewer={scene:{globe:{},screenSpaceCameraController:{},requestRender(){}},entities:{add:e=>(entities.add(e),e),remove:e=>entities.delete(e)}};
 const frame=(geo,d)=>{const p=C.position(geo,d);return {center:new V(p.lon*90400,p.lat*111200,p.height),left:new V(Math.cos(p.heading),-Math.sin(p.heading),0),up:new V(0,0,1)};};
 T.setup(viewer,Ces,geos,frame);
 for(const [direction,geo] of Object.entries(geos)){
  directions++;const distances=new Set([0,geo.length-1,...geo.route.stops.map(s=>s.distance)]);for(let d=0;d<geo.length;d+=500)distances.add(d);
  for(const distance of [...distances].sort((a,b)=>a-b)){
   T.render({direction,distance});const polys=viewer.scene.globe.clippingPolygons.polygons;
   for(const offset of [-600,3.21,700]){const target=Math.max(.1,Math.min(geo.length-.1,distance+offset)),p=frame(geo,target).center;
    assert.ok(polys.some(poly=>contains(p,poly.positions)),name+' '+direction+' uncut at '+distance+' / '+target);samples++;
   }
   for(const e of entities)if(e.polygon)for(const p of e.polygon.hierarchy)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
   peakEntities=Math.max(peakEntities,entities.size);
  }
  const distance=Math.min(2000,geo.length/2);T.render({direction,distance});const previous=new Set(entities);T.render({direction,distance:distance+121});reused+=[...entities].filter(e=>previous.has(e)).length;
 }
 T.dispose();assert.equal(entities.size,0);assert.equal(viewer.scene.globe.clippingPolygons,undefined);
}
for(const name of ['yamanote','chuo','chuo-local','keihin','sobu','west','ome','okutama','fuji','lake']){
 const {c,C,D,M}=fixtures.context(name);const geos=Object.fromEntries(Object.entries(D.routes).map(([k,r])=>{const g=C.geometry(r);C.applyElevation(g,M.groundHeights[k]);return[k,g];}));scan(name,C,geos,c.BaylineTunnels);
}
for(const name of ['azusa','kaiji']){
 const packet=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'rail-games/priority/batch-001/games/'+name+'.json.gz'))));const c=vm.createContext({console});vm.runInContext(read('rail-games/priority/batch-001/engine/rail-core.js'),c);vm.runInContext(source,c);const C=c.RailCore;
 const geos=Object.fromEntries(Object.entries(packet.data.routes).map(([k,r])=>{const g=C.geometry(r);C.applyElevation(g,r.groundHeights);return[k,g];}));scan(name,C,geos,c.BaylineTunnels);
}
{
 const c=vm.createContext({window:{},console});for(const file of ['railway/rail-data.js','railway/rail-core.js','railway/rail-models.js'])vm.runInContext(read(file),c);vm.runInContext(source,c);const C=c.RailCore,D=c.window.RAIL_DATA,M=c.window.RAIL_PREBUILT_MODELS;
 const geos=Object.fromEntries(Object.entries(D.routes).map(([key,r])=>{const g=C.geometry(r);C.applyElevation(g,M.groundHeights[key]);return [key,g];}));scan('yurikamome',C,geos,c.BaylineTunnels);
}
assert.deepEqual(Array.from(cutFixture()),[0,2,8,12]);
function cutFixture(){const c=vm.createContext({});vm.runInContext(source,c);return c.BaylineTunnels.floorCuts({cumulative:[0,2,12]},0,12);}

// No underground intervals used to disable all surface protection.
const c=vm.createContext({RailCore:{position:(_,d)=>({lon:d,lat:0,height:0})}});vm.runInContext(source,c);
const geo={length:3000,cumulative:[0,3000],route:{trackOffsets:[5,5],stops:[]}};scan('surface-only',{position:(_,d)=>({lon:d/90400,lat:0,height:0,heading:Math.PI/2})},{forward:geo},c.BaylineTunnels);
assert.ok(reused>0);console.log(JSON.stringify({pass:true,routes:14,directions,samples,peakEntities,reused,physicalGpu:false}));
