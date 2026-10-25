/* Check the reusable consist component on actual source alignments.
 * Meshes/formation/ground grades are provisional; this is not a released game.
 */
'use strict';
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'),fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const DEST=path.resolve(__dirname,'../../rail-games/priority/batch-001'),read=(...p)=>fs.readFileSync(path.join(DEST,...p)),unpack=(...p)=>JSON.parse(zlib.gunzipSync(read(...p)));
const report={method:'Software WebGL2 integration of a provisional nine-car E353 consist with buffered source alignments. No physical GPU, rail-grade verification, platform validation or completed game is implied.',releaseReady:false,physicalGPU:false,realTime:false,runs:[],errors:[]};
report.inputHashes=Object.fromEntries(['engine/rail-core.js','engine/train-scene.js','games/e353.json.gz','alignments/azusa.json.gz','alignments/kaiji.json.gz','games/azusa.json.gz','games/kaiji.json.gz'].map(file=>[file,crypto.createHash('sha256').update(read(file)).digest('hex')]));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BAYLINE_CHROMIUM,headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'true',EGL_PLATFORM:'surfaceless'},proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined,args:['--no-sandbox','--ignore-gpu-blocklist','--use-gl=angle','--use-angle='+(process.env.BAYLINE_ANGLE||'swiftshader'),'--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-gpu-compositing']});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1200,height:700}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('https://kuse-o9.github.io/knowledge-construction/consist-inspection',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Widgets/widgets.css"><style>html,body,#scene{width:100%;height:100%;margin:0;overflow:hidden}#note{position:absolute;z-index:5;color:white;background:#1238;padding:14px;font:16px sans-serif}</style></head><body><div id="note">E353 CONSIST / DEVELOPMENT COMPONENT / FORMATION AND RAIL GRADES UNVERIFIED</div><div id="scene"></div></body></html>'}));
  await page.goto('https://kuse-o9.github.io/knowledge-construction/consist-inspection');
  await page.addScriptTag({url:'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Cesium.js'});
  await page.addScriptTag({content:read('engine/rail-core.js').toString()});await page.addScriptTag({content:read('engine/train-scene.js').toString()});
  await page.evaluate(()=>{const C=Cesium;C.Ion.defaultAccessToken='';window.viewer=new C.Viewer('scene',{animation:false,timeline:false,baseLayerPicker:false,baseLayer:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,skyBox:false,skyAtmosphere:false,requestRenderMode:true});viewer.useDefaultRenderLoop=false;viewer.scene.globe.show=false;viewer.scene.backgroundColor=C.Color.fromCssColorString('#25444f');viewer.scene.light=new C.DirectionalLight({direction:new C.Cartesian3(.3,-.3,-1),intensity:2});});
  const stock=unpack('games/e353.json.gz');
  for(const id of ['azusa','kaiji'])for(const direction of ['forward','reverse']){
   const alignment=unpack('alignments',id+'.json.gz'),packet=unpack('games',id+'.json.gz');
   const result=await page.evaluate(({alignment,stock,direction,packet})=>{
    window.consist?.destroy();const C=Cesium,Core=RailCore,reverse=direction==='reverse',points=reverse?alignment.points.slice().reverse():alignment.points;
    const route=packet.data.routes[direction],geo=Core.geometry(route);Core.applyElevation(geo,route.groundHeights);
    const stations=route.physicalStops,formation=packet.data.train.formations[direction];
    let invalidRejected=false;try{BaylineTrainScene.mount(viewer,C,Core,geo,stock,[{...formation[0],pitch:Infinity}]);}catch{invalidRejected=true;}if(!invalidRejected)throw Error('Invalid formation was accepted');
    const consist=window.consist=BaylineTrainScene.mount(viewer,C,Core,geo,stock,formation);window.previewGeo=geo;
    let checked=0;const locations=[];
    for(let i=0;i<stations.length;i++){locations.push(stations[i].distance);if(i+1<stations.length)locations.push((stations[i].distance+stations[i+1].distance)/2);}
    for(const distance of locations){const poses=consist.setFront(distance);for(const p of poses){for(const f of [p.body,...p.bogies])for(const v of [f.center,f.forward,f.left,f.up])if(![v.x,v.y,v.z].every(Number.isFinite))throw Error('Non-finite train pose');if(Math.abs(C.Cartesian3.dot(p.body.forward,p.body.up))>1e-8)throw Error('Invalid pose axes');}if(poses[0].distance-poses.at(-1).distance<160)throw Error('Consist collapsed at a path endpoint');checked++;}
    window.previewDistance=stations[0].distance;consist.setFront(previewDistance);const anchor=Core.position(geo,previewDistance-85);viewer.camera.lookAt(C.Cartesian3.fromDegrees(anchor.lon,anchor.lat,anchor.height),new C.HeadingPitchRange(anchor.heading+1.15,-.40,210));viewer.resize();for(let i=0;i<3;i++)viewer.render();viewer.scene.context._gl.finish();
    const gl=viewer.scene.context._gl,debug=gl.getExtension('WEBGL_debug_renderer_info'),canvas=viewer.canvas.getBoundingClientRect();return {direction,checkedLocations:checked,cars:formation.length,primitives:consist.primitives.length,ready:consist.primitives.filter(p=>p.ready).length,webgl2:viewer.scene.context.webgl2,glError:gl.getError(),canvasSize:[canvas.width,canvas.height],renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown'};
   },{alignment,stock,direction,packet});
   if(!result.webgl2||result.glError||result.ready!==result.primitives||result.canvasSize[0]!==1200||result.canvasSize[1]!==700)throw Error('Invalid WebGL consist scene or viewport');
   if(id==='azusa'){const file='e353-consist-'+direction+'.png';await page.screenshot({path:path.join(DEST,'vehicles',file)});result.image='vehicles/'+file;}
   report.runs.push({id,...result,pass:true});
  }
  if(report.errors.length)throw Error(report.errors.join('; '));report.pass=true;
 }catch(e){report.pass=false;report.fatal=e.message;throw e;}
 finally{fs.writeFileSync(path.join(DEST,'train-scene-diagnostics.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1)});
