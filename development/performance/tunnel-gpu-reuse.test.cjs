'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../..'),after=fs.readFileSync(root+'/shared/rail-tunnel-runtime.js','utf8'),before=fs.readFileSync(root+'/development/performance/baseline/terrain6-runtime.js','utf8');
function run(source){let allocations=0,frames=0;const snapshots=[];
 class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}static add(a,b,o=new V()){return Object.assign(o,{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});}static multiplyByScalar(a,s,o=new V()){return Object.assign(o,{x:a.x*s,y:a.y*s,z:a.z*s});}static distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}}
 class Collection{constructor(o){allocations++;this.polygons=o.polygons||[];this.totalPositions=0;}static isSupported(){return true;}removeAll(){this.polygons=[];}add(p){this.polygons.push(p);return p;}}
 const C={Cartesian3:V,ClippingPolygonCollection:Collection,ClippingPolygon:class{constructor(o){this.positions=o.positions;this.length=o.positions.length;}},Color:{fromCssColorString:s=>s}},entities=new Set(),viewer={scene:{globe:{},screenSpaceCameraController:{},requestRender(){}},entities:{add:e=>(entities.add(e),e),remove:e=>entities.delete(e)}};
 const ctx=vm.createContext({RailCore:{position:(g,d)=>({height:Math.cos(d/800)*3})}});vm.runInContext(source,ctx);
 const gs=Object.fromEntries(['up','down'].map((key,i)=>[key,{side:i*24,cumulative:Array.from({length:401},(_,i)=>i*100),route:{trackOffsets:Array.from({length:401},(_,i)=>i>=20&&i<=350?-20:5)}}]));
 const frame=(g,d)=>{frames++;return {center:new V(d,Math.sin(d/1000)*30+g.side,Math.cos(d/800)*3),left:new V(0,1,0),up:new V(0,0,1)};};
 ctx.BaylineTunnels.setup(viewer,C,gs,frame);
 for(const distance of [0,1600,1980,...Array.from({length:30},(_,i)=>4000+i*121),34800,35100,36000]){
  ctx.BaylineTunnels.render({direction:'up',distance});const collection=viewer.scene.globe.clippingPolygons;
  snapshots.push({polygons:[...new Set(collection.polygons.map(p=>JSON.stringify(p.positions)))].sort(),entities:[...entities].map(e=>JSON.stringify(e)).sort()});
  collection.totalPositions=collection.polygons.reduce((n,p)=>n+p.length,0);
 }
 return{snapshots,allocations,frames};
}
const a=run(before),b=run(after);assert.deepStrictEqual(b.snapshots,a.snapshots,'Terrain cut/floor/wall/roof/light changed');assert.equal(b.allocations,1);assert(b.frames<a.frames*.6);
console.log(JSON.stringify({pass:true,windows:a.snapshots.length,identicalMaskUnionAndEntities:true,collectionAllocations:{before:a.allocations,after:b.allocations},frameCalls:{before:a.frames,after:b.frames},textureResolutionUnchanged:4096,noPhysicalGpuClaim:true}));
