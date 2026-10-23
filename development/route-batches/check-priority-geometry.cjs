/* Actual scene regression: underground -> surface -> underground, no hidden Cesium errors. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const ROOT=path.resolve(__dirname,'../..'),DEST=path.join(__dirname,'batch-001'),BASE='https://kuse-o9.github.io/knowledge-construction/';
let diagnosticPage;
const modelsOnly=process.env.BAYLINE_MODELS_ONLY==='1';
const report={method:modelsOnly?'Station mesh, grade and cache validation in the actual game; no scene rendering claim.':'Direct diagnostic positioning, software ANGLE WebGL. Not full-route real-time driving or physical GPU testing.',releaseReady:false,physicalGPU:false,runs:[],errors:[],inputHashes:{}};
for(const f of ['games/azusa.json.gz','games/kaiji.json.gz','games/shared.js','games/model-builder.js','games/rail.js','engine/train-scene.js'])report.inputHashes[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(DEST,f))).digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BAYLINE_CHROMIUM,headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'true',EGL_PLATFORM:'surfaceless'},proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined,args:['--no-sandbox','--ignore-gpu-blocklist','--use-gl=angle','--use-angle='+(process.env.BAYLINE_ANGLE||'gl-egl'),'--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-gpu-compositing']});
 try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:850}});
 await context.route(BASE+'**',r=>{const rel=decodeURIComponent(new URL(r.request().url()).pathname.slice('/knowledge-construction/'.length)),file=path.resolve(ROOT,rel);if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return r.fulfill({status:404});return r.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
 for(const id of ['azusa','kaiji']){
 const page=await context.newPage();diagnosticPage=page;
 await page.addInitScript(modelsOnly=>{let starter;Object.defineProperty(window,'BaylineSceneStart',{configurable:true,get:()=>starter,set:value=>{starter=value;const original=value.create;value.create=(...args)=>{const v=original(...args);v.useDefaultRenderLoop=false;Object.defineProperty(v,"useDefaultRenderLoop",{get:()=>false,set:()=>{}});return v;};}});window.__qaRenderEnabled=!modelsOnly;setInterval(()=>{const v=window.BaylineGame?.viewer;if(v&&window.__qaRenderEnabled&&!v.isDestroyed()){v.resize();v.render();}},1000);},modelsOnly);
 page.on('pageerror',e=>report.errors.push(e.stack));page.on('dialog',d=>d.accept());
 await page.goto(BASE+'development/route-batches/batch-001/games/'+id+'.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.BaylineGame?.sceneReady||window.BaylineGame?.sceneFailure,null,{timeout:120000});
 await page.evaluate(()=>{if(!BaylineGame.sceneReady)throw Error(BaylineGame.sceneFailure);window.__qaRenderEnabled=false;window.__renderErrors=[];BaylineGame.viewer.scene.renderError.addEventListener((s,e)=>__renderErrors.push(e.stack||String(e)));});
 const models=await page.evaluate(()=>{
 let stations=0,vertices=0,maxGrade=0;const decode=(s,T)=>{const a=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new T(a.buffer);};
 for(const [direction,route]of Object.entries(BaylineGame.data.routes)){
  const geo=RailCore.geometry(route);RailCore.applyElevation(geo,route.groundHeights);
  for(let i=1;i<geo.cumulative.length;i++)maxGrade=Math.max(maxGrade,Math.abs((route.groundHeights[i]+route.trackOffsets[i]-route.groundHeights[i-1]-route.trackOffsets[i-1])/(geo.cumulative[i]-geo.cumulative[i-1])));
 }
 for(const meta of RAIL_PREBUILT_MODELS.stations){const model=BaylineBatchModels.build(meta);if(model.passengers.length!==128)throw Error('Passenger detail reduced');
  for(const group of model.groups){const ps=decode(group.positions,Float32Array),ix=decode(group.indices,group.indexType===32?Uint32Array:Uint16Array);if(!ps.every(Number.isFinite)||!ix.every(i=>i<ps.length/3))throw Error('Invalid station mesh');vertices+=ps.length/3;}stations++;
 }
 if(BaylineBatchModels.cacheSize>32||maxGrade>.035)throw Error('Station cache or grade regression');return {stations,vertices,maxGradePerMille:maxGrade*1000,cacheSize:BaylineBatchModels.cacheSize,platformEdgeOffset:1.58,platformGeometryVerified:false};
 });report.runs.push({id,kind:'station-models',...models,pass:true});
 if(modelsOnly){await page.close();continue;}
 const targets=await page.evaluate(()=>{
 const g=BaylineGame,geo=g.geometry,structures=g.route.structures,tunnel=structures.filter(s=>s.kind==='tunnel').sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0],bridge=structures.filter(s=>s.kind==='bridge-or-viaduct'&&s.maxRailAboveTerrain>3).sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0];
 if(!tunnel||!bridge)throw Error('Missing classified diagnostic locations');return [48200,61440,65590].map((d,i)=>({kind:'tunnel-fragment-'+i,distance:document.querySelector('#direction').value==='reverse'?geo.length-d:d})).concat([{kind:'tunnel',distance:(tunnel.start+tunnel.end)/2},{kind:'tunnel-window',distance:(tunnel.start+tunnel.end)/2+245},{kind:'bridge',distance:(bridge.start+bridge.end)/2},{kind:'tunnel-return',distance:(tunnel.start+tunnel.end)/2+125},{kind:'bridge-return',distance:(bridge.start+bridge.end)/2+125}]);});
 for(const target of targets){
 console.log('POSITION',id,target);
 await page.evaluate(t=>{const g=BaylineGame;g.state.running=false;g.state.speed=0;g.state.distance=t.distance;g.state.doors=false;window.__terrainReadySince=0;const previous=g.viewer.scene.globe.clippingPolygons;BaylineTunnels.render({direction:document.querySelector('#direction').value,distance:t.distance});if(t.kind==='tunnel-window'&&g.viewer.scene.globe.clippingPolygons===previous)throw Error('Clipping texture window was reused');},target);
 await page.locator(target.kind.startsWith('tunnel')?'#view-cab':'#view-chase').click({timeout:60000});await page.evaluate(()=>{window.__qaRenderEnabled=true;BaylineGame.viewer.resize();BaylineGame.viewer.render();});console.log('SCENE_STATE',await page.evaluate(()=>{const v=BaylineGame.viewer,cp=v.scene.globe.clippingPolygons;return {webgl2:v.scene.context.webgl2,supported:Cesium.ClippingPolygonCollection.isSupported(v.scene),polygons:cp?.length,enabled:cp?.enabled,texture:!!cp?.clippingTexture,canvas:[v.canvas.width,v.canvas.height],status:document.getElementById('scene-status').textContent};}));
 await page.waitForFunction(t=>{if(__renderErrors.length)return true;const v=BaylineGame.viewer,cp=v.scene.globe.clippingPolygons;if(t.kind.startsWith('tunnel'))return cp?.enabled&&cp.clippingTexture;const p=RailCore.position(BaylineGame.geometry,t.distance),ready=v.scene.globe.tilesLoaded&&Number.isFinite(v.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(p.lon,p.lat)));if(!ready){window.__terrainReadySince=0;return false;}window.__terrainReadySince ||= performance.now();return performance.now()-window.__terrainReadySince>2000;},target,{timeout:120000});
 await page.waitForTimeout(1500);
 const result=await page.evaluate(()=>{window.__qaRenderEnabled=false;if(__renderErrors.length)throw Error(__renderErrors.join('\n'));if(document.querySelector('.cesium-widget-errorPanel'))throw Error('Cesium error panel');const v=BaylineGame.viewer;v.render();v.scene.context._gl.finish();return {glError:v.scene.context._gl.getError(),clippingPolygons:v.scene.globe.clippingPolygons?.length||0,clippingEnabled:v.scene.globe.clippingPolygons?.enabled||false,tilesLoaded:v.scene.globe.tilesLoaded,primitives:v.scene.primitives.length,tunnelRoofs:v.entities.values.filter(e=>e.name==='tunnel-roof').length};});
 if(target.kind.startsWith('tunnel-fragment')&&result.tunnelRoofs===0)throw Error('Reviewed tunnel roof missing');
 if(result.glError||result.clippingPolygons>100||target.kind.startsWith('bridge')&&!result.tilesLoaded)throw Error('Invalid scene state');
 await page.screenshot({path:path.join(DEST,'games',id+'-'+target.kind+'.png')});report.runs.push({id,...target,...result,pass:true});console.log('PASS',id,target.kind,result);
 }
 await page.close();
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));report.pass=true;
 }catch(e){report.pass=false;report.fatal=e.stack;try{report.debug=await diagnosticPage?.evaluate(()=>{const v=window.BaylineGame?.viewer,cp=v?.scene.globe.clippingPolygons;return {renderErrors:window.__renderErrors,webgl2:v?.scene.context.webgl2,polygons:cp?.length,enabled:cp?.enabled,texture:!!cp?.clippingTexture,canvas:[v?.canvas.width,v?.canvas.height],status:document.getElementById('scene-status')?.textContent};});console.log('FAILURE_STATE',report.debug);}catch{}throw e;}finally{fs.writeFileSync(path.join(DEST,modelsOnly?'station-model-diagnostics.json':'geometry-review-diagnostics.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
