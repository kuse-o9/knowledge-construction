'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function create(source,L,mode,player={direction:'none',distance:-10000}){const c={BaylineSignalRuntime:{bind(){}}};vm.createContext(c);vm.runInContext(fs.readFileSync(source,'utf8'),c);const route=label=>({route:{label,stops:[{distance:0},{distance:L}]}});return c.RailTraffic.create({forward:route('上り'),reverse:route('下り')},mode,player);}
for(const source of ['development/shared/rail-traffic-signalled.js','yamanote/rail-traffic.js'])test(source+' initial spacing is direction-specific and retains player clearance',()=>{
 for(const [mode,base]of [['rush',2000],['weekday',4000],['holiday',6000]]){
  const t=create(source,72000,mode);
  for(const [direction,mult]of [['forward',1.5],['reverse',2]]){const trains=t.trains.filter(t=>t.direction===direction);assert.equal(trains.length,72000/(base*mult));assert.equal(trains[1].distance-trains[0].distance,base*mult);assert.equal(trains[0].speed,10);}
 }
 for(const L of [500,1799,5001,34530]){const t=create(source,L,'rush',{direction:'forward',distance:L/2});for(const train of t.trains){assert.ok(train.distance>=0&&train.distance<=L);if(train.direction==='forward')assert.ok(Math.abs(train.distance-L/2)>=1000);}}
});
