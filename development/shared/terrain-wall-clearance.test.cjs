'use strict';
// Actual retained routes + Cesium mathematics, without a physical GPU claim.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),Ces=require(process.env.CESIUM_MODULE||path.resolve(root,'../work/cesium-runtime/node_modules/cesium'));
const V=Ces.Cartesian3,source=read('development/shared/rail-tunnel-runtime.js'),ctx=vm.createContext({});vm.runInContext(source,ctx);const T=ctx.BaylineTunnels;
const p=(x,y,z=0)=>new V(x,y,z);
assert.equal(T.segmentGap2(p(0,0),p(10,0),p(5,-5),p(5,5)),0);
assert.equal(T.segmentGap2(p(0,0),p(10,0),p(0,3),p(10,3)),9);
assert.equal(T.segmentGap2(p(0,0),p(0,0),p(0,4),p(0,4)),16);
const fixture=read('development/shared/rail-route-upgrade.test.js'),prefix=fixture.slice(fixture.indexOf('function packet('),fixture.indexOf("for(const name of ['yamanote'")),fixtures={};
vm.runInNewContext(prefix+'\nfixtures.context=context;',{fixtures,fs,path,zlib,vm,root,read,console,Buffer});
const cases=[];
for(const name of ['yamanote','chuo','chuo-local','keihin','sobu','west','ome','okutama','fuji','lake']){
 const {C,D,M}=fixtures.context(name);cases.push({name,C,geos:Object.fromEntries(Object.entries(D.routes).map(([k,r])=>{const g=C.geometry(r);C.applyElevation(g,M.groundHeights[k]);return[k,g];}))});
}
for(const name of ['azusa','kaiji']){
 const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'rail-games/priority/batch-001/games/'+name+'.json.gz')))).data,c=vm.createContext({});vm.runInContext(read('rail-games/priority/batch-001/engine/rail-core.js'),c);const C=c.RailCore;
 cases.push({name,C,geos:Object.fromEntries(Object.entries(d.routes).map(([k,r])=>{const g=C.geometry(r);C.applyElevation(g,r.groundHeights);return[k,g];}))});
}
{
 const c=vm.createContext({window:{}});for(const f of ['railway/rail-data.js','railway/rail-core.js','railway/rail-models.js'])vm.runInContext(read(f),c);const C=c.RailCore,D=c.window.RAIL_DATA,M=c.window.RAIL_PREBUILT_MODELS;
 cases.push({name:'yurikamome',C,geos:Object.fromEntries(Object.entries(D.routes).map(([k,r])=>{const g=C.geometry(r);C.applyElevation(g,M.groundHeights[k]);return[k,g];}))});
}
let directions=0,panels=0,conflicts=0,retained=0,indexedSegments=0,repro;
for(const test of cases){
 const {C,geos}=test,at=(g,d)=>{const r=C.position(g,d);return V.fromDegrees(r.lon,r.lat,r.height);};
 const frame=(g,d)=>{const center=at(g,d),forward=V.normalize(V.subtract(at(g,d+.3),at(g,d-.3),new V()),new V()),radial=Ces.Ellipsoid.WGS84.geodeticSurfaceNormal(center,new V()),left=V.normalize(V.cross(radial,forward,new V()),new V()),up=V.normalize(V.cross(forward,left,new V()),new V());return {center,forward,left,up};};
 const side=(f,n)=>V.add(f.center,V.multiplyByScalar(f.left,n,new V()),new V());
 const index=T.clearanceIndex(geos,frame);indexedSegments+=index.segments;
 for(const g of Object.values(geos)){directions++;for(const r of T.ranges(g))for(let d=r.start;d<r.end;d+=12){const end=Math.min(r.end,d+12),f0=frame(g,d),f1=frame(g,end);for(const sign of[-1,1]){panels++;if(index.blocked(side(f0,sign*9.6),side(f1,sign*9.6)))conflicts++;else retained++;}}}
 if(test.name==='azusa'){
  const g=geos.reverse,d=g.route.stops.find(s=>s.name==='岡谷').distance-7400,f=frame(g,d),eye=V.add(f.center,V.multiplyByScalar(f.up,3.2,new V()),new V()),end=V.add(eye,V.multiplyByScalar(f.forward,40,new V()),new V());let before=0,after=0;
  for(const other of Object.values(geos))for(const r of T.ranges(other))for(let a=r.start;a<r.end;a+=12){const b=Math.min(r.end,a+12),f0=frame(other,a),f1=frame(other,b);if(V.distance(f0.center,f.center)>120)continue;for(const sign of[-1,1]){const a0=side(f0,sign*9.6),b0=side(f1,sign*9.6),a1=V.add(a0,V.multiplyByScalar(f0.up,8.5,new V()),new V()),b1=V.add(b0,V.multiplyByScalar(f1.up,8.5,new V()),new V());const hit=Ces.IntersectionTests.lineSegmentTriangle(eye,end,a0,b0,b1,false)||Ces.IntersectionTests.lineSegmentTriangle(eye,end,a0,b1,a1,false);if(hit){before++;if(!index.blocked(a0,b0))after++;}}}
  assert(before>0,'The reported near-Okaya obstruction was not reproduced');assert.equal(after,0,'Wall still crosses the camera sightline');repro={before,after,distance:d};
 }
}
assert(conflicts>0);assert(retained>0,'All tunnel walls were removed');
console.log(JSON.stringify({pass:true,routes:cases.length,directions,panels,conflictsRemoved:conflicts,outerPanelsRetained:retained,indexedSegments,reproducedOkayaSightline:repro,physicalGpu:false}));
