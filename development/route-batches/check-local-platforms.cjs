/* Geometry inspection using the same Cesium math and actual station meshes. No physical GPU claim. */
'use strict';
const fs=require('fs'),path=require('path'),z=require('zlib'),crypto=require('crypto'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const base=path.join(__dirname,'batch-001'),read=f=>fs.readFileSync(path.join(base,f)),unpack=f=>JSON.parse(z.gunzipSync(read(f)));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BAYLINE_CHROMIUM,headless:true,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined,args:['--no-sandbox']});
 const report={pass:false,physicalGPU:false,method:'Actual station mesh and passenger clearance, Cesium Cartesian math; no surveyed placement claim.',inputHashes:Object.fromEntries(['games/model-builder.js','games/azusa.json.gz','games/kaiji.json.gz','engine/rail-core.js'].map(f=>[f,crypto.createHash('sha256').update(read(f)).digest('hex')])),runs:[]};
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true});await page.goto('about:blank');await page.addScriptTag({url:'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Cesium.js'});await page.addScriptTag({content:read('engine/rail-core.js').toString()});await page.addScriptTag({content:read('games/model-builder.js').toString()});
  for(const id of['azusa','kaiji']){
   const rows=await page.evaluate(({data,common,stock})=>{
    BaylineBatchModels.initialize(data,common,stock);const C=Cesium,V=C.Cartesian3,out=[];
    for(const meta of RAIL_PREBUILT_MODELS.stations.filter(s=>s.platformLine==='chuo-sobu-local')){
     const model=BaylineBatchModels.build(meta),geo=RailCore.geometry(data.routes[meta.direction]);RailCore.applyElevation(geo,data.routes[meta.direction].groundHeights);let minClearance=Infinity;
     for(const person of model.passengers){const p=RailCore.position(geo,meta.distance+person.distance),q=V.fromDegrees(p.lon,p.lat,p.height);minClearance=Math.min(minClearance,V.distance(new V(...person.position),q));}
     if(minClearance<5||model.passengers.length!==128||!model.groups.some(g=>g.color==='#b8bec0'))throw Error('Local platform/rail clearance or passenger regression');
     out.push({name:meta.name,direction:meta.direction,minPassengerDistanceFromRapidRail:minClearance,passengers:model.passengers.length,adjacentRails:true,placementEstimated:meta.platformPlacementEstimated});
    }
    if(out.length!==4)throw Error('Missing local-only station directions');return out;
   },{data:unpack('games/'+id+'.json.gz').data,common:unpack('games/common.json.gz'),stock:unpack('games/e353.json.gz')});report.runs.push(...rows.map(r=>({id,...r})));
  }
  report.pass=true;console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(path.join(base,'local-platform-diagnostics.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
