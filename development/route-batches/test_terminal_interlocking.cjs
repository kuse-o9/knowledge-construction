'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),z=require('zlib'),assert=require('assert/strict'),crypto=require('crypto');
const base=path.resolve(__dirname,'../../rail-games/priority/batch-001'),read=f=>fs.readFileSync(path.join(base,f)),ctx=vm.createContext({});
ctx.window=ctx;for(const file of['engine/rail-core.js','games/shared.js'])vm.runInContext(read(file).toString(),ctx);
const data=JSON.parse(z.gunzipSync(read('games/kaiji.json.gz'))).data,geos=Object.fromEntries(Object.entries(data.routes).map(([k,r])=>[k,ctx.RailCore.geometry(r)]));ctx.BaylineSignalRuntime.bind(geos);
const zone=d=>geos[d].route.sharedTerminals[0],inside=(t)=>{const z=zone(t.direction);return t.distance>=z.entry&&t.distance-(t.length||220)<=z.exit;};
let assertions=0;
for(const direction of['forward','reverse']){
 const opposite=direction==='forward'?'reverse':'forward',own={id:'player',direction,distance:Math.max(zone(direction).entry+50,geos[direction].route.stops[0].distance),length:186.36},other={id:'other',direction:opposite,distance:Math.max(0,zone(opposite).entry-100),length:186.36,speed:20};
 const traffic={trains:[other],terminalLocks:{}};
 ctx.BaylineTerminals.update(traffic,geos,own);assert.equal(traffic.terminalLocks['ryuo-platform2'],'player');
 assert.equal(ctx.BaylineTerminals.stopDistance(geos[direction],traffic,own),Infinity);
 assert.ok(ctx.BaylineTerminals.stopDistance(geos[opposite],traffic,other)<=95);
 const control=ctx.BaylineSignalRuntime.control(geos[opposite],traffic,other,own);assert.ok(control.stopDistance<=95);
 const index=ctx.BaylineSignalRuntime.layout(geos[opposite]).blocks.findIndex(b=>b.end>=zone(opposite).entry);
 assert.equal(ctx.BaylineSignalRuntime.aspect(geos[opposite],index,traffic,own,'other'),'RED');
 // The complete vehicle must clear the shared section before the opposing
 // movement is admitted, even after its cab has passed the boundary.
 own.distance=zone(direction).exit+100;ctx.BaylineTerminals.update(traffic,geos,own);assert.equal(traffic.terminalLocks['ryuo-platform2'],'player');
 own.distance=zone(direction).exit+own.length+1;ctx.BaylineTerminals.update(traffic,geos,own);assert.equal(traffic.terminalLocks['ryuo-platform2'],'other');
 assert.equal(ctx.BaylineSignalRuntime.aspect(geos[opposite],index,traffic,own,'other'),'GREEN');
 assertions+=8;
}
// Actual traffic initialization retains every NPC, including a deliberately
// conflicting initial snapshot. Game signals stop the waiting direction.
const player={direction:'reverse',distance:data.routes.reverse.stops[0].distance,length:186.36};
const t=ctx.RailTraffic.create(geos,'weekday',player);const count=t.trains.length;
assert.ok(count>0);assert.ok(t.trains.every(n=>!inside(n)));assert.equal(t.terminalLocks['ryuo-platform2'],'player');assertions+=3;
const offender=t.trains[0];offender.direction='forward';offender.distance=zone('forward').entry+20;
ctx.BaylineTerminals.initialize(t,geos,player);assert.equal(t.trains.length,count);assert.ok(!inside(offender));assertions+=2;
const waiting={id:'waiting',direction:'forward',distance:zone('forward').entry-120,length:186.36,speed:20,next:data.routes.forward.stops.length-1,dwell:0,stops:0},movement={trains:[waiting],terminalLocks:{}};
for(let i=0;i<3000;i++)ctx.RailTraffic.step(movement,geos,.1,player);
assert.ok(waiting.distance<=zone('forward').entry-5+1e-6);assert.equal(waiting.speed,0);assertions+=2;
// Wrapping a completed NPC back to the reverse terminal must also respect an
// opposing reservation; it cannot teleport into an occupied platform.
const completed={id:'completed',direction:'reverse',distance:geos.reverse.length-1,length:186.36,speed:0,next:data.routes.reverse.stops.length,dwell:0};
const inbound={direction:'forward',distance:zone('forward').entry+100,length:186.36};
const wrapTraffic={trains:[completed],terminalLocks:{}};ctx.RailTraffic.step(wrapTraffic,geos,.1,inbound);
assert.equal(completed.distance,geos.reverse.length-1);assert.equal(completed.next,data.routes.reverse.stops.length);assertions+=2;
const report={pass:true,assertions,oppositeDirectionExclusion:true,rearClearance:true,npcCountPreserved:count,realRailwaySafetyClaim:false,inputHashes:Object.fromEntries(['games/kaiji.json.gz','games/shared.js','engine/rail-core.js','../terminal-runtime.js'].map(f=>[f,crypto.createHash('sha256').update(read(f)).digest('hex')]))};
fs.writeFileSync(path.join(base,'terminal-interlocking-diagnostics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
