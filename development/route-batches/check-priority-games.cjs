/* Exercise the actual retained UI, controls, persistence and software renderer. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const ROOT=path.resolve(__dirname,'../..'),DEST=path.join(__dirname,'batch-001'),BASE='https://kuse-o9.github.io/knowledge-construction/';
const report={method:'Actual browser interaction with local development builds; software ANGLE WebGL. No physical device or completed-route claim.',releaseReady:false,physicalGPU:false,realTimeFullRoute:false,runs:[],errors:[],networkErrors:[]};
report.inputHashes=Object.fromEntries(['azusa.html','kaiji.html','azusa.json.gz','kaiji.json.gz','common.json.gz','e353.json.gz','rail.js','shared.js','rail-audio.js','loader.js','model-builder.js','scene-start.js','announcements-reviewed.js'].map(file=>['games/'+file,crypto.createHash('sha256').update(fs.readFileSync(path.join(DEST,'games',file))).digest('hex')]));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BAYLINE_CHROMIUM,headless:true,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'true',EGL_PLATFORM:'surfaceless'},proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined,args:['--no-sandbox','--ignore-gpu-blocklist','--use-gl=angle','--use-angle='+(process.env.BAYLINE_ANGLE||'gl-egl'),'--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-gpu-compositing']});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:850}});
  await context.route(BASE+'**',async route=>{const url=new URL(route.request().url()),rel=decodeURIComponent(url.pathname.slice('/knowledge-construction/'.length)),file=path.resolve(ROOT,rel);if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing local asset: '+rel});const ext=path.extname(file),type={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png'}[ext]||'application/octet-stream';return route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});});
  for(const id of ['azusa','kaiji']){
   const page=await context.newPage(),errors=[];
   await page.addInitScript(()=>{let starter;Object.defineProperty(window,'BaylineSceneStart',{configurable:true,get:()=>starter,set:value=>{starter=value;const original=value.create;value.create=(...args)=>{const v=original(...args);v.useDefaultRenderLoop=false;Object.defineProperty(v,'useDefaultRenderLoop',{get:()=>false,set:()=>{}});return v;};}});window.__qaRenderEnabled=false;setInterval(()=>{const v=window.BaylineGame?.viewer;if(v&&window.__qaRenderEnabled&&!v.isDestroyed()){v.resize();v.render();}},1000);});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('response',r=>{if(r.status()>=400&&report.networkErrors.length<20)report.networkErrors.push({status:r.status(),url:r.url()});});page.setDefaultTimeout(60000);
   await page.goto(BASE+'development/route-batches/batch-001/games/'+id+'.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.BaylineGame||document.body.dataset.loadError,null,{timeout:60000});
   const loadError=await page.evaluate(()=>document.body.dataset.loadError);if(loadError)throw Error(loadError);
   if(!await page.locator('#development-banner').isVisible()||!await page.evaluate(()=>/^[0-9a-f]{64}$/.test(document.body.dataset.packetSha||'')))throw Error('Development status or packet integrity binding missing');
   for(const direction of ['forward','reverse']){
    console.log('CONTROLS',id,direction);
    await page.locator('#view-map').click();await page.locator('#settings-button').click();await page.locator('#direction').selectOption(direction);await page.locator('#trip-mode').selectOption('timetable');await page.locator('#settings-close').click();await page.locator('#sound').uncheck();
    await page.locator('#route-button').click();const physicalCount=await page.locator('#station-list li').count();await page.locator('#route-close').click();
    if(physicalCount!==(id==='azusa'?64:42))throw Error('Physical station inventory missing');
    await page.locator('#mode-manual').click();await page.locator('#start').click();await page.waitForFunction(()=>BaylineGame.state.dwell>=4.5);await page.locator('#door').click();
    let state=await page.evaluate(()=>({doors:BaylineGame.state.doors,mode:BaylineGame.state.mode,departure:RailCore.canDepart(BaylineGame.state),dwell:BaylineGame.state.dwell,earlySeconds:BaylineGame.state.schedule.stops[0].departure-RailCore.clock(BaylineGame.state)}));if(state.doors||state.mode!=='manual'||!state.departure||state.earlySeconds<=0)throw Error('Manual early departure blocked: '+JSON.stringify(state));
    await page.locator('#power').click();await page.waitForFunction(()=>BaylineGame.state.speed>.05);
    await page.locator('#emergency').click();await page.waitForFunction(()=>BaylineGame.state.speed<.05);await page.locator('#start').click();
    const snapshot=await page.evaluate(()=>({direction:document.getElementById('direction').value,distance:BaylineGame.state.distance,routeId:BaylineGame.data.id}));
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.BaylineGame||document.body.dataset.loadError);
    const restored=await page.evaluate(()=>({direction:document.getElementById('direction').value,distance:BaylineGame.state.distance,running:BaylineGame.state.running,routeId:BaylineGame.data.id}));
    if(restored.direction!==snapshot.direction||restored.running||restored.routeId!==snapshot.routeId||Math.abs(restored.distance-snapshot.distance)>1)throw Error('Save/restore failed');
    // Start at a different selected station through the real settings UI.
    await page.locator('#view-map').click();await page.locator('#mode-auto').click();await page.locator('#settings-button').click();await page.locator('#start-station').selectOption('1');await page.locator('#restart').click();await page.locator('#settings-close').click();
    await page.waitForFunction(()=>!BaylineGame.state.doors&&BaylineGame.state.speed>.05,null,{timeout:45000});
    await page.locator('#start').click();await page.locator('#view-map').click();await page.waitForTimeout(200);
    report.runs.push({id,direction,physicalCount,manualPowerBrakeDoors:true,earlyDeparture:true,saveRestore:true,startStationSelection:true,automaticDeparture:true,mapView:true,pass:true});
    console.log('CONTROLS_PASS',id,direction);
   }
   await page.waitForFunction(()=>BaylineGame.sceneReady||!BaylineGame.sceneLoading,null,{timeout:60000});
   if(!await page.evaluate(()=>BaylineGame.sceneReady)){console.log('SCENE_RETRY',id,await page.evaluate(()=>BaylineGame.sceneFailure));await page.locator('#view-chase').click();await page.waitForFunction(()=>BaylineGame.sceneReady||!BaylineGame.sceneLoading,null,{timeout:60000});}
   if(!await page.evaluate(()=>BaylineGame.sceneReady))throw Error('3D initialization failed: '+await page.evaluate(()=>BaylineGame.sceneFailure));await page.locator('#view-chase').click();
   await page.evaluate(()=>{window.__qaRenderEnabled=true;});await page.waitForFunction(()=>{const v=BaylineGame.viewer,p=RailCore.position(BaylineGame.geometry,BaylineGame.state.distance),h=v.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(p.lon,p.lat));return Number.isFinite(h)&&v.scene.globe.tilesLoaded;},null,{timeout:90000});
   const scene=await page.evaluate(()=>{window.__qaRenderEnabled=false;const v=BaylineGame.viewer;v.resize();v.render();v.scene.context._gl.finish();return {webgl2:v.scene.context.webgl2,error:v.scene.context._gl.getError(),primitives:v.scene.primitives.length,ready:v.scene.primitives._primitives.filter(p=>p.ready).length};});
   if(!scene.webgl2||scene.error||scene.primitives<10)throw Error('Integrated 3D scene not rendered');
   await page.screenshot({path:path.join(DEST,'games',id+'-integration.png')});report.runs.push({id,scene,softwareRendering:true,pass:true});
   if(errors.length)throw Error(errors.join('; '));const renderError=await page.evaluate(()=>BaylineGame.sceneFailure);if(renderError)throw Error(renderError);if(await page.locator('.cesium-widget-errorPanel').count())throw Error('Cesium error panel present');await page.close();
  }
  report.pass=true;
 }catch(e){report.pass=false;report.fatal=e.message;report.errors.push(e.stack);throw e;}
 finally{fs.writeFileSync(path.join(DEST,'integrated-game-diagnostics.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1)});
