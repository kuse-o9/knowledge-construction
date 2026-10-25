/* Check unchanged meshes against the saved renderer and require solid new rail profiles. */
'use strict';
const fs=require('fs'),path=require('path'),z=require('zlib'),crypto=require('crypto'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const base=path.resolve(__dirname,'../../rail-games/priority/batch-001'),read=f=>fs.readFileSync(path.join(base,f)),unpack=f=>JSON.parse(z.gunzipSync(read(f))),baseline=fs.readFileSync(path.join(__dirname,'fixtures/model-builder-20261023.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BAYLINE_CHROMIUM,headless:true,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined,args:['--no-sandbox']});
 const report={pass:false,method:'Actual Cesium mesh math, exact unchanged station groups/passengers and solid third-track rail faces; no physical GPU or survey claim.',physicalGPU:false,inputHashes:Object.fromEntries(['games/model-builder.js','games/azusa.json.gz','games/kaiji.json.gz','engine/rail-core.js','../tunnel-runtime.js','../fixtures/model-builder-20261023.js','../../../development/route-batches/batch-001/sources/priority-platform-review.json'].map(f=>[f,crypto.createHash('sha256').update(read(f)).digest('hex')])),runs:[]};
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true});await page.goto('about:blank');await page.addScriptTag({url:'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Cesium.js'});await page.addScriptTag({content:read('engine/rail-core.js').toString()});await page.addScriptTag({content:read('../tunnel-runtime.js').toString()});await page.addScriptTag({content:baseline+'\nwindow.PreviousStationBuilder=window.BaylineBatchModels;'});await page.addScriptTag({content:read('games/model-builder.js').toString()});
  for(const id of['azusa','kaiji']){
   const result=await page.evaluate(({data,common,stock})=>{
    PreviousStationBuilder.initialize(data,common,stock);BaylineBatchModels.initialize(data,common,stock);let unchanged=0,solid=0,tracks=0,terminals=0;const C=Cesium,V=C.Cartesian3,decode=(s,T)=>new T(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
    for(const meta of [...RAIL_PREBUILT_MODELS.stations,...RAIL_PREBUILT_MODELS.tracks.filter((_,i)=>i%29===0)]){
     const current=BaylineBatchModels.build(meta);
     if(meta.terminalLayout){if(current.passengers.length!==128||!current.groups.some(g=>g.color==='#43484b')||!current.groups.some(g=>g.color==='#a6a89e'))throw Error('Terminal detail missing');const geo=RailCore.geometry(data.routes[meta.direction]);RailCore.applyElevation(geo,data.routes[meta.direction].groundHeights);const p=RailCore.position(geo,meta.platformCenterDistance),centre=V.fromDegrees(p.lon,p.lat,p.height),before=RailCore.position(geo,meta.platformCenterDistance-.3),after=RailCore.position(geo,meta.platformCenterDistance+.3),ahead=V.normalize(V.subtract(V.fromDegrees(after.lon,after.lat,after.height),V.fromDegrees(before.lon,before.lat,before.height),new V()),new V()),up=C.Ellipsoid.WGS84.geodeticSurfaceNormal(centre,new V()),left=V.normalize(V.cross(up,ahead,new V()),new V());const group=current.groups.find(g=>g.color==='#a6a89e'),v=decode(group.positions,Float32Array);let samples=0,minGap=Infinity;for(let i=0;i<v.length;i+=3){const q=V.subtract(V.add(new V(v[i],v[i+1],v[i+2]),new V(...current.origin),new V()),centre,new V());if(Math.abs(V.dot(q,ahead))<6&&V.dot(q,up)>1.08){minGap=Math.min(minGap,Math.abs(V.dot(q,left)));samples++;}}if(!samples||minGap<1.45)throw Error('Terminal platform intersects train '+meta.id+' '+minGap);terminals++;continue;}
     if(!meta.islandOuterTrack){const old=PreviousStationBuilder.build(meta);for(const key of['origin','radius','groups','passengers'])if(JSON.stringify(old[key])!==JSON.stringify(current[key]))throw Error('Unchanged mesh altered: '+meta.id+' '+key);if(meta.kind==='station')unchanged++;else tracks++;continue;}
     const rails=current.groups.find(g=>g.color==='#43484b');if(!rails)throw Error('Missing third rails '+meta.name);
     const geo=RailCore.geometry(data.routes[meta.direction]);RailCore.applyElevation(geo,data.routes[meta.direction].groundHeights);const p=RailCore.position(geo,meta.platformCenterDistance),up=C.Ellipsoid.WGS84.geodeticSurfaceNormal(V.fromDegrees(p.lon,p.lat,p.height),new V()),normals=decode(rails.normals,Int8Array);let sides=0,tops=0;
     for(let i=0;i<normals.length;i+=3){const dot=Math.abs(V.dot(new V(normals[i]/127,normals[i+1]/127,normals[i+2]/127),up));if(dot<.2)sides++;if(dot>.8)tops++;}
     if(!sides||!tops||current.passengers.length!==128)throw Error('Incomplete rail profile/passenger regression '+meta.name);solid++;
    }
    if(BaylineBatchModels.cacheSize>32)throw Error('Unbounded model cache');return {unchangedStations:unchanged,unchangedTrackChunks:tracks,solidThirdTrackStations:solid,terminalStations:terminals,cacheSize:BaylineBatchModels.cacheSize};
   },{data:unpack('games/'+id+'.json.gz').data,common:unpack('games/common.json.gz'),stock:unpack('games/e353.json.gz')});report.runs.push({id,...result});
  }
  if(report.runs.reduce((s,r)=>s+r.terminalStations,0)!==82)throw Error('Missing passenger topology cases');
  if(report.runs.reduce((s,r)=>s+r.solidThirdTrackStations,0)!==19)throw Error('Missing reviewed third tracks');report.pass=true;console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(path.join(base,'station-rail-profile-diagnostics.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
