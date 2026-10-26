'use strict';
const fs=require('fs'),vm=require('vm'),z=require('zlib'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../../rail-games/priority/batch-001'),ctx={};ctx.window=ctx;vm.runInNewContext(fs.readFileSync(root+'/games/announcements-reviewed.js','utf8'),ctx);vm.runInNewContext(fs.readFileSync(root+'/games/express-service.js','utf8'),ctx);const S=ctx.BaylineExpressService;let cases=0;
for(const key of ['azusa','kaiji']){const p=JSON.parse(z.gunzipSync(fs.readFileSync(root+'/games/'+key+'.json.gz')));for(const [direction,route]of Object.entries(p.data.routes)){
 for(let start=0;start<route.stops.length-1;start++){
  const index=start+1,parts=S.segments(p.data,route,index,'next',start),text=parts.map(p=>p.text).join(' ');assert(text.includes(route.stops.at(-1).name));assert(text.includes(route.stops.at(-1).english));assert(!text.includes('南小谷'));assert(!/(?<!\d)[123]号車/.test(text));assert(parts.some(p=>p.lang==='ja-JP'));assert(parts.some(p=>p.lang==='en-US'));assert(S.estimate(parts)>S.chime(key).duration);const num=route.label.match(/(?:あずさ|かいじ)(\d+)号/)[1];assert(text.includes(num+'号'));cases++;
 }
 const end=S.segments(p.data,route,route.stops.length-1,'arrival',0).map(p=>p.text).join(' ');assert(end.includes('終点'));assert(!end.includes('undefined'));const one=S.segments(p.data,route,1,'arrival',0).map(p=>p.text).join(' ');assert(one.includes(route.stops[2].name));
}}
assert.notDeepEqual([...S.chime('azusa').notes],[...S.chime('kaiji').notes]);assert.equal(S.doorMotion(0).slide,0);assert.equal(S.doorMotion(.1).slide,0);assert(S.doorMotion(.1).pop>0);assert.equal(S.doorMotion(1).slide,.99);assert.equal(S.doorMotion(1).pop,.085);
const gpu={addEventListener(){}};gpu.window=gpu;vm.runInNewContext(fs.readFileSync(path.resolve(root,'../../../shared/rail-scene-start.js'),'utf8'),gpu);assert(gpu.BaylineSceneStart.diagnosticGuide('GL_RENDERER = Disabled').includes('chrome://gpu'));assert.equal(gpu.BaylineSceneStart.diagnosticGuide('network timeout'),'');
console.log(JSON.stringify({pass:true,dynamicStartingStations:cases,distinctOriginalChimes:true,singlePlugSlidingMotion:true,disabledGpuGuide:true}));
