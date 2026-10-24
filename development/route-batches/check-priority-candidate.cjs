/* Publication integration: use the current helper; mock catalogue responses only. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=path.resolve(process.env.BAYLINE_CANDIDATE_ROOT||'../qa/priority-candidate');
const BASE='https://kuse-o9.github.io/knowledge-construction/';
const prefix='rail-games/priority/batch-001/games/';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'candidate-manifest.json')));
const report={pass:false,method:'Relocated entries, current production publication helper and packet integrity; catalogue responses mocked. 3D deliberately unavailable in this packaging check.',physicalGPU:false,softwareRendering:false,inputHashes:{},runs:[]};
for(const row of [...manifest.assets,...manifest.productionDependencies]){
 const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,row.path))).digest('hex');
 assert.equal(actual,row.sha256,row.path);report.inputHashes[row.path]=actual;
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BAYLINE_CHROMIUM,headless:true,args:['--no-sandbox']});
 try{
  for(const id of ['azusa','kaiji'])for(const mode of ['visible','hidden','absent','offline','corrupt']){
   const context=await browser.newContext({ignoreHTTPSErrors:true});let packets=0;const errors=[];
   await context.route('https://cesium.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
   await context.route('**/rest/v1/rpc/study_game_catalog',r=>{
    if(mode==='offline')return r.fulfill({status:503,contentType:'application/json',body:'{"error":"QA unavailable"}'});
    const rows=mode==='absent'?[]:[{id,title:id,path:prefix+id+'.html',published:mode!=='hidden',note:'',revision:1}];
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)});
   });
   await context.route(BASE+'**',r=>{
    const rel=decodeURIComponent(new URL(r.request().url()).pathname.slice('/knowledge-construction/'.length)),file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404});
    let body=fs.readFileSync(file);if(rel.endsWith('.json.gz')){packets++;if(mode==='corrupt'&&rel.endsWith('/'+id+'.json.gz')){body=Buffer.from(body);body[20]^=1;}}
    return r.fulfill({status:200,contentType:{'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream',body});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(BASE+prefix+id+'.html',{waitUntil:'domcontentloaded'});
   if(['hidden','absent','offline'].includes(mode)){
    await page.waitForURL('**/game-unavailable.html?**',{timeout:30000});assert.equal(packets,0,'Hidden game downloaded packets');
   }else if(mode==='corrupt'){
    await page.waitForFunction(()=>document.body.dataset.loadError,null,{timeout:30000});
    const failure=await page.evaluate(()=>({message:document.body.dataset.loadError,started:!!window.BaylineGame}));
    assert(failure.message.includes('版が一致しません'));assert.equal(failure.started,false);
   }else{
    await page.waitForFunction(()=>window.BaylineGame,null,{timeout:30000});
    const state=await page.evaluate(()=>({cars:BaylineGame.data.train.cars,stations:BaylineGame.route.physicalStops.length,help:document.getElementById('help').textContent}));
    assert.equal(state.cars,9);assert.equal(state.stations,id==='azusa'?64:42);assert(!/黄色の10両|39駅すべて|E353系500番台/.test(state.help));assert(state.help.includes('国土数値情報'));assert.equal(packets,3);
   }
   assert.deepEqual(errors,[]);report.runs.push({id,mode,packets,pass:true});await context.close();
  }
  report.pass=true;console.log(JSON.stringify({pass:true,cases:report.runs.length,publicationWrites:false,physicalGPU:false}));
 }finally{fs.writeFileSync(path.join(root,'candidate-validation.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
