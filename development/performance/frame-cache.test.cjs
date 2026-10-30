'use strict';
const fs=require('fs'),vm=require('vm'),z=require('zlib'),assert=require('assert'),crypto=require('crypto'),path=require('path');
const root=path.resolve(__dirname,'../..'),C=require(process.env.CESIUM_MODULE||path.resolve(root,'../work/cesium-runtime/node_modules/cesium'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),packet=n=>JSON.parse(z.gunzipSync(fs.readFileSync(path.join(root,'rail-games/priority/batch-001/games/'+n+'.json.gz'))));
const after=read('rail-games/priority/batch-001/games/model-builder.js');
const before=after.replace(' const frames=new Map();\n','').replace('if(frames.has(d))return frames.get(d);','').replace('const result={center,forward,left,up};frames.set(d,result);return result;','return {center,forward,left,up};');
const reports=[];
for(const line of ['azusa','kaiji']){
 const outputs=[];
 for(const source of [before,after]){
  const ctx=vm.createContext({Cesium:C,atob,btoa,console});ctx.window=ctx;ctx.pointCalls=0;
  for(const p of ['rail-games/priority/batch-001/engine/rail-core.js','shared/rail-tunnel-runtime.js'])vm.runInContext(read(p),ctx);
  vm.runInContext(source.replace('function point(d){','function point(d){pointCalls++;'),ctx);
  ctx.BaylineBatchModels.initialize(packet(line).data,packet('common'),packet('e353'));
  const m=ctx.RAIL_PREBUILT_MODELS;
  const selected=[m.tracks[0],m.tracks[Math.floor(m.tracks.length/2)],m.stations.find(x=>!x.terminalLayout)||m.stations[0],m.stations.find(x=>x.terminalLayout)||m.stations.at(-1)];
  const hashes=[];const t=performance.now();
  for(const meta of selected){const model=ctx.BaylineBatchModels.build(meta);hashes.push(crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex'));}
  outputs.push({hashes,pointCalls:ctx.pointCalls,ms:Math.round(performance.now()-t)});
 }
 assert.deepStrictEqual(outputs[0].hashes,outputs[1].hashes,'Model output changed');assert(outputs[1].pointCalls<outputs[0].pointCalls);
 reports.push({line,models:4,before:outputs[0],after:outputs[1]});
}
console.log(JSON.stringify({sameGeometryAndPassengers:true,reports}));
