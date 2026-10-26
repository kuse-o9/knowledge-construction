'use strict';
/* The actual generated game packets, rather than a separate diagnostic route. */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const DEST=path.resolve(__dirname,'../../rail-games/priority/batch-001'),report={method:'Accelerated CPU tests of the integrated development packets; published-maximum game cap (not actual section restrictions), not real-time or physical-device testing.',releaseReady:false,runs:[],inputHashes:{}};
const core=fs.readFileSync(path.join(DEST,'engine/rail-core.js'),'utf8');report.inputHashes['engine/rail-core.js']=crypto.createHash('sha256').update(core).digest('hex');
for(const id of ['azusa','kaiji']){
 const file='games/'+id+'.json.gz',bytes=fs.readFileSync(path.join(DEST,file)),packet=JSON.parse(zlib.gunzipSync(bytes));report.inputHashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');
 for(const [direction,r]of Object.entries(packet.data.routes)){
  const context=vm.createContext({});vm.runInContext(core,context);const C=context.RailCore,geo=C.geometry(r);C.applyElevation(geo,r.groundHeights);assert.ok(r.stops[0].distance>packet.data.train.totalLength+1);assert.ok(r.stops.at(-1).distance<geo.length-1);
  const passing=r.physicalStops.filter(s=>!r.stops.some(t=>t.code===s.code)),crossed=new Set(),state=C.create(r,0,'auto');state.running=true;let steps=0;
  while(!state.complete&&steps++<250000){const before=state.distance;C.step(state,geo,.1);for(const stop of passing)if(stop.distance>before&&stop.distance<=state.distance){assert.ok(state.speed>.05);crossed.add(stop.code);}}
  assert.equal(state.complete,true);assert.equal(state.visited.length,r.stops.length);assert.equal(state.missed.length,0);assert.equal(crossed.size,passing.length);
  const late=C.create(r,0,'manual');late.dwell=5;late.tripMode='timetable';late.schedule={offset:r.stops[0].departure-40-8*3600,stops:r.stops.map(s=>({arrival:s.arrival,departure:s.departure}))};assert.ok(C.clock(late)<late.schedule.stops[0].departure);assert.ok(C.closeDoors(late,geo));assert.ok(C.restore({version:1,state:late},r));
  report.runs.push({id,direction,stoppingStations:r.stops.length,passingStations:crossed.size,simulatedSeconds:state.elapsed,steps,earlyDeparture:true,restore:true,pass:true});
 }
}
report.pass=true;console.log(JSON.stringify(report));
