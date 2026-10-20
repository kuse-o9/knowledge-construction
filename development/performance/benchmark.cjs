'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib'),{performance}=require('node:perf_hooks');const root=path.resolve(__dirname,'../..');
const corridors=JSON.parse(zlib.gunzipSync(fs.readFileSync(root+'/shared/neighbour-corridors.bin'))).corridors;
function env(old){const c=vm.createContext({window:{},console});for(const f of ['rail-signals.js','rail-signal-runtime.js','rail-neighbour-runtime.js'])vm.runInContext(fs.readFileSync(__dirname+(old?'/baseline/':'/../shared/')+f,'utf8'),c);for(const f of ['development/signalled-routes/keihin/rail-core.js','development/shared/rail-traffic-signalled.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),c);return c;}
function measure(fn){const values=[];for(let n=0;n<5;n++){const t=performance.now();fn();values.push(performance.now()-t);}return {medianMs:values.sort((a,b)=>a-b)[2],samplesMs:values};}
const output={baseline:'e930e7d78211eb23718e3b3413d229f3ef767321',method:'Five CPU-only Node v'+process.versions.node+' trials; same inputs, no hardware GPU/FPS claim',results:{}};
for(const old of [true,false]){const c=env(old),line=corridors.find(x=>x.id==='keihin'),route=line.routes.forward,geo={route},positions=Array.from({length:5000},(_,i)=>{const p=route.points[Math.floor(i*route.points.length/5000)];return {lon:p[0]+.003,lat:p[1]-.002};});
 c.BaylineNeighbours.near(null,geo,positions[0]);
 const occupancyBlocks=c.BaylineSignals.buildBlocks(300000,Array.from({length:499},(_,i)=>(i+1)*600)),trains=Array.from({length:100},(_,i)=>({id:i,front:1000+i*2500,length:220}));
 const near=measure(()=>{for(const p of positions)c.BaylineNeighbours.near(null,geo,p);});
 const occupancy=measure(()=>{for(let i=0;i<1000;i++)c.BaylineSignals.occupiedBlocks(occupancyBlocks,trains);});
 const ai=measure(()=>{const geos=Object.fromEntries(Object.entries(structuredClone(line.routes)).map(([key,r])=>[key,c.RailCore.geometry(r)])),traffic=c.RailTraffic.create(geos,'rush',{direction:'none',distance:-10000,length:200});for(let i=0;i<100;i++)c.RailTraffic.step(traffic,geos,.1,null);});
 output.results[old?'before':'after']={near5000Queries:near,occupancy1000Queries:occupancy,ai100Ticks:ai};}
output.speedups={};for(const key of Object.keys(output.results.before))output.speedups[key]=output.results.before[key].medianMs/output.results.after[key].medianMs;
fs.writeFileSync(__dirname+'/benchmark-results.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
