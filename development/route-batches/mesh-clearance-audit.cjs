'use strict';
// Stream actual generated railway/station triangles through a train-space box.
// Ballast/rail/sleeper triangles below the vehicle are expected, not obstructions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),z=require('node:zlib');
const root=path.resolve(__dirname,'../..'),Ces=require(process.env.CESIUM_MODULE||path.resolve(root,'../work/cesium-runtime/node_modules/cesium')),V=Ces.Cartesian3;
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),packet=p=>JSON.parse(z.gunzipSync(fs.readFileSync(path.join(root,'rail-games/priority/batch-001/games/'+p+'.json.gz'))));
function overlaps(vertices,probe){
 const tri=vertices.map(v=>{const r=V.subtract(v,probe.center,new V());return [V.dot(r,probe.forward),V.dot(r,probe.left),V.dot(r,probe.up)];}),half=[1.1,1.5,1.9];
 const axis=a=>{if(a.every(x=>Math.abs(x)<1e-12))return true;const p=tri.map(v=>v.reduce((s,n,i)=>s+n*a[i],0)),r=half.reduce((s,n,i)=>s+n*Math.abs(a[i]),0);return Math.min(...p)<=r&&Math.max(...p)>=-r;};
 for(let i=0;i<3;i++)if(!axis([0,1,2].map(j=>+(i===j))))return false;
 const edges=tri.map((v,i)=>v.map((n,j)=>tri[(i+1)%3][j]-n)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 if(!axis(cross(edges[0],edges[1])))return false;
 for(const e of edges)for(const a of [[1,0,0],[0,1,0],[0,0,1]])if(!axis(cross(e,a)))return false;
 return true;
}
const reports=[];
for(const name of ['azusa','kaiji']){
 const ctx=vm.createContext({Cesium:Ces,atob,btoa,console});ctx.window=ctx;
 for(const p of ['rail-games/priority/batch-001/engine/rail-core.js','shared/rail-tunnel-runtime.js','rail-games/priority/batch-001/games/model-builder.js'])vm.runInContext(read(p),ctx);
 const d=packet(name).data;ctx.BaylineBatchModels.initialize(d,packet('common'),packet('e353'));
 const C=ctx.RailCore,geos=Object.fromEntries(Object.entries(d.routes).map(([key,r])=>{const g=C.geometry(r);C.applyElevation(g,r.groundHeights);return[key,g];})),cells=new Map();let probes=0,triangles=0,models=0;
 const key=p=>[p.x,p.y,p.z].map(n=>Math.floor(n/32)).join(',');
 for(const [direction,g]of Object.entries(geos))for(const distance of C.sampleDistances(g,2)){
  const point=n=>{const p=C.position(g,n);return V.fromDegrees(p.lon,p.lat,p.height);},base=point(distance),forward=V.normalize(V.subtract(point(distance+.3),point(distance-.3),new V()),new V()),radial=Ces.Ellipsoid.WGS84.geodeticSurfaceNormal(base,new V()),left=V.normalize(V.cross(radial,forward,new V()),new V()),up=V.normalize(V.cross(forward,left,new V()),new V()),center=V.add(base,V.multiplyByScalar(up,2.2,new V()),new V()),probe={center,forward,left,up,direction,distance};
  const id=key(center);if(!cells.has(id))cells.set(id,[]);cells.get(id).push(probe);probes++;
 }
 const findings=new Map(),railColors=new Set(['#85847b','#727a79','#43484b','#b8bec0','#8b9395','#b7b5a8']);
 const inspect=model=>{
  models++;if(models%100===0)(console.error(name+' models='+models+' triangles='+triangles),process.env.CLEARANCE_PROGRESS&&fs.appendFileSync(process.env.CLEARANCE_PROGRESS,name+' models='+models+' triangles='+triangles+'\n'));const origin=new V(...model.origin);
  for(const group of model.groups){if(model.kind==='track'&&railColors.has(group.color))continue;
   const pbuf=Buffer.from(group.positions,'base64'),ibuf=Buffer.from(group.indices,'base64'),P=new Float32Array(pbuf.buffer,pbuf.byteOffset,pbuf.length/4),I=group.indexType===32?new Uint32Array(ibuf.buffer,ibuf.byteOffset,ibuf.length/4):new Uint16Array(ibuf.buffer,ibuf.byteOffset,ibuf.length/2);
   for(let i=0;i<I.length;i+=3){triangles++;const vertices=[I[i],I[i+1],I[i+2]].map(n=>V.add(origin,new V(P[n*3],P[n*3+1],P[n*3+2]),new V())),bounds=['x','y','z'].map(k=>[Math.floor((Math.min(...vertices.map(v=>v[k]))-3)/32),Math.floor((Math.max(...vertices.map(v=>v[k]))+3)/32)]);let hit=null;
    outer:for(let x=bounds[0][0];x<=bounds[0][1];x++)for(let y=bounds[1][0];y<=bounds[1][1];y++)for(let z=bounds[2][0];z<=bounds[2][1];z++)for(const probe of cells.get(x+','+y+','+z)||[])if(overlaps(vertices,probe)){hit=probe;break outer;}
    if(hit){const id=model.id+'|'+group.color;let row=findings.get(id);if(!row){row={id:model.id,kind:model.kind,color:group.color,station:model.name||model.code,direction:hit.direction,distance:Math.round(hit.distance),hits:0};findings.set(id,row);}row.hits++;}
   }
  }
 };
 const metadata=[...ctx.RAIL_PREBUILT_MODELS.stations,...ctx.RAIL_PREBUILT_MODELS.tracks];
 if(!process.argv.includes('--city-only'))for(const meta of metadata)inspect(ctx.BaylineBatchModels.build(meta));
 for(const chunk of packet('common').city.chunks)inspect({...chunk,id:'city:'+chunk.id,kind:'city'});
 reports.push({name,probes,models,triangles,findings:[...findings.values()]});console.error(name+' complete: '+findings.size+' finding groups');if(process.env.CLEARANCE_CHECKPOINT)fs.writeFileSync(process.env.CLEARANCE_CHECKPOINT,JSON.stringify({reports}));
}
console.log(JSON.stringify({method:'Actual Cesium coordinates and triangle/vehicle-box separating-axis test; CPU only',reports}));
