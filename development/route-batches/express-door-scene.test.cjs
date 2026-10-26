'use strict';
const fs=require('fs'),vm=require('vm'),z=require('zlib'),path=require('path'),assert=require('assert/strict');
const C=require(process.env.CESIUM_MODULE||path.resolve('work/cesium-runtime/node_modules/cesium')),root=path.resolve(__dirname,'../../rail-games/priority/batch-001'),ctx={atob,console};ctx.window=ctx;
for(const p of ['engine/rail-core.js','games/express-service.js','engine/train-scene.js'])vm.runInNewContext(fs.readFileSync(root+'/'+p,'utf8'),ctx);
const stock=JSON.parse(z.gunzipSync(fs.readFileSync(root+'/games/e353.json.gz')));let cases=0;
for(const key of ['azusa','kaiji'])for(const direction of ['forward','reverse']){
 const p=JSON.parse(z.gunzipSync(fs.readFileSync(root+'/games/'+key+'.json.gz'))),route=p.data.routes[direction],geo=ctx.RailCore.geometry(route);ctx.RailCore.applyElevation(geo,route.groundHeights);const all=[],viewer={scene:{primitives:{add(p){all.push(p);return p;},remove(p){all.splice(all.indexOf(p),1);}}}},formation=p.data.train.formations[direction],scene=ctx.BaylineTrainScene.mount(viewer,C,ctx.RailCore,geo,stock,formation),front=route.stops[0].distance,side=route.stops[0].side;
 scene.setFront(front,true,{opening:0,side});const closed=all.map(p=>C.Matrix4.clone(p.modelMatrix));scene.setFront(front,true,{opening:1,side});const moved=all.filter((p,i)=>!C.Matrix4.equalsEpsilon(p.modelMatrix,closed[i],1e-9));assert.equal(moved.length,formation.reduce((n,c)=>n+c.doorCentres.length,0));
 for(const p of moved){const i=all.indexOf(p),a=C.Matrix4.getTranslation(closed[i],new C.Cartesian3()),b=C.Matrix4.getTranslation(p.modelMatrix,new C.Cartesian3());assert(Math.abs(C.Cartesian3.distance(a,b)-Math.hypot(.99,.085))<1e-7);}
 scene.setFront(front,false,{opening:1,side});assert(all.every(p=>p.show===false));scene.destroy();assert.equal(all.length,0);cases++;
}
console.log(JSON.stringify({pass:true,cases,cesiumVersion:C.VERSION,method:'Actual Cesium geometry and matrices; no GPU rendering claim',singleLeavesPerPlatform:10,offsideRemainsClosed:true}));
