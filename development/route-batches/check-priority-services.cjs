/* Actual stopping patterns on exact buffered anchors; speeds remain diagnostic. */
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const DEST=path.join(__dirname,'batch-001'),core=fs.readFileSync(path.join(DEST,'engine/rail-core.js'),'utf8');
const report={method:'Accelerated CPU simulation of four source-bound weekday stopping patterns. Diagnostic 100 km/h section limits are not researched operating profiles.',realTime:false,physicalGPU:false,releaseReady:false,runs:[]};
report.inputHashes=Object.fromEntries(['engine/rail-core.js',...['azusa','kaiji'].flatMap(id=>['alignments/'+id+'.json.gz',...['forward','reverse'].map(d=>'services/'+id+'-'+d+'.json')])].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(DEST,file))).digest('hex')]));
for(const id of ['azusa','kaiji'])for(const direction of ['forward','reverse']){
 const alignment=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DEST,'alignments',id+'.json.gz'))));
 const service=JSON.parse(fs.readFileSync(path.join(DEST,'services',id+'-'+direction+'.json')));
 const context=vm.createContext({});vm.runInContext(core,context);const C=context.RailCore,reverse=direction==='reverse';
 const route={points:reverse?alignment.points.slice().reverse():alignment.points,stops:[],stationSpeeds:[],vehicleMaximum:service.vehicle.maximumKmh};
 const geo=C.geometry(route);route.length=geo.length;
 route.physicalStops=(reverse?alignment.physicalStops.slice().reverse():alignment.physicalStops).map(s=>{const index=reverse?route.points.length-1-s.index:s.index;return {...s,index,distance:geo.cumulative[index]};});
 const byCode=new Map(route.physicalStops.map(s=>[s.code,s]));
 route.stops=service.stops.map(s=>({...byCode.get(s.sourceCode),arrival:s.arrival,departure:s.departure}));
 assert.ok(route.stops.every(s=>s.code));assert.ok(route.stops[0].distance>300);assert.ok(geo.length-route.stops.at(-1).distance>300);
 route.stationSpeeds=route.physicalStops.map(s=>({code:s.code,distance:s.distance,limit:100}));
 const passing=route.physicalStops.filter(s=>!route.stops.some(t=>t.code===s.code)),crossed=new Set();
 const state=C.create(route,0,'auto');state.schedule={stops:service.stops.map(s=>({arrival:s.arrival,departure:s.departure})),offset:0};state.tripMode='timetable';state.running=true;
 let steps=0;
 while(!state.complete&&steps++<250000){const before=state.distance;C.step(state,geo,.1);for(const s of passing)if(s.distance>before&&s.distance<=state.distance){assert.ok(state.speed>.08,'A passing station caused an unintended stop');crossed.add(s.code);}}
 assert.equal(state.complete,true);assert.equal(state.visited.length,service.stops.length);assert.equal(state.missed.length,0);assert.equal(crossed.size,passing.length);
 // Timetable arrival/departure timestamps must not reintroduce a time gate.
 const early=C.create(route,0,'manual');early.dwell=4;early.tripMode='timetable';early.schedule={stops:service.stops.map(s=>({arrival:s.arrival,departure:s.departure+3600})),offset:0};assert.equal(C.canDepart(early),true);assert.equal(C.closeDoors(early,geo),true);assert.equal(early.doors,false);
 report.runs.push({id,direction,service:service.name,stoppingStations:route.stops.length,passingStations:crossed.size,allPhysicalStationCandidates:route.physicalStops.length,simulatedSeconds:state.elapsed,steps,earlyDeparturePass:true,pass:true});
}
report.pass=true;fs.writeFileSync(path.join(DEST,'service-running-diagnostics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
