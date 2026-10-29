// Static passenger-footprint check; no GPU rendering or moving-boarder claim.
const fs=require('fs'),vm=require('vm'),z=require('zlib'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../..'),Ces=require(process.env.CESIUM_MODULE||path.resolve(root,'../work/cesium-runtime/node_modules/cesium')),V=Ces.Cartesian3,read=p=>fs.readFileSync(root+'/'+p,'utf8'),packet=p=>JSON.parse(z.gunzipSync(fs.readFileSync(root+'/rail-games/priority/batch-001/games/'+p+'.json.gz')));
const reports=[];
for(const name of ['azusa','kaiji']){
 const ctx=vm.createContext({Cesium:Ces,atob,btoa,console});ctx.window=ctx;vm.runInContext(read('rail-games/priority/batch-001/engine/rail-core.js'),ctx);vm.runInContext(read('shared/rail-tunnel-runtime.js'),ctx);
 let src=read('rail-games/priority/batch-001/games/model-builder.js');const a=src.indexOf(' function quad('),b=src.indexOf(' function strip(',a);src=src.slice(0,a)+' function quad(){} function box(){} function ribbon(){}\n'+src.slice(b);vm.runInContext(src,ctx);
 const d=packet(name).data;ctx.BaylineBatchModels.initialize(d,packet('common'),packet('e353'));const C=ctx.RailCore,geos=Object.fromEntries(Object.entries(d.routes).map(([k,r])=>{const g=C.geometry(r);C.applyElevation(g,r.groundHeights);return[k,g];}));
 const frame=(g,d)=>{const at=n=>{const p=C.position(g,n);return V.fromDegrees(p.lon,p.lat,p.height);},center=at(d),forward=V.normalize(V.subtract(at(d+.3),at(d-.3),new V()),new V()),radial=Ces.Ellipsoid.WGS84.geodeticSurfaceNormal(center,new V()),left=V.normalize(V.cross(radial,forward,new V()),new V()),up=V.normalize(V.cross(forward,left,new V()),new V());return{center,forward,left,up};};
 const index=ctx.BaylineTunnels.clearanceIndex(geos,frame);let people=0;const conflicts=[];
 for(const meta of ctx.RAIL_PREBUILT_MODELS.stations){let n=0;const model=ctx.BaylineBatchModels.build(meta);for(const person of model.passengers){people++;const f=frame(geos[meta.direction],meta.distance+person.distance),p=new V(...person.position),corners=[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]].map(([x,y])=>V.add(p,V.add(V.multiplyByScalar(f.forward,x,new V()),V.multiplyByScalar(f.left,y,new V()),new V()),new V())),out=index.clipPolygon(corners);if(out.length!==1||out[0]!==corners)n++;}if(n)conflicts.push({station:meta.name,direction:meta.direction,count:n});}
 assert.strictEqual(people,ctx.RAIL_PREBUILT_MODELS.stations.length*128,'Passenger count changed');assert.strictEqual(conflicts.length,0,'Static passenger footprint intrudes into rail space');reports.push({name,people,conflicts});
}
console.log(JSON.stringify(reports));
