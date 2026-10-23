'use strict';
const fs=require('fs'),path=require('path'),z=require('zlib'),vm=require('vm'),assert=require('assert/strict');
const base=path.join(__dirname,'batch-001'),ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(base,'engine/rail-core.js'),'utf8'),ctx);
let samples=0;
for(const key of['azusa','kaiji']){
 const packet=JSON.parse(z.gunzipSync(fs.readFileSync(path.join(base,'games',key+'.json.gz'))));
 for(const route of Object.values(packet.data.routes)){
  assert.equal(route.operatingSpeedVerified,false);assert.equal(route.speedPolicy,'published-maximum-game-cap');assert.equal(route.gameMaximum,130);assert.equal(route.vehicleMaximum,130);
  const geo=ctx.RailCore.geometry(route);
  for(let d=0;d<geo.length;d+=37){assert.equal(ctx.RailCore.speedLimit(geo,d),130);assert.equal(ctx.RailCore.approachLimit(geo,d),130);samples++;}
  const state=ctx.RailCore.create(route,0,'manual');state.doors=false;state.speed=0;assert.equal(ctx.RailCore.atcLimit(state,geo),130);state.doors=true;assert.equal(ctx.RailCore.atcLimit(state,geo),0);
 }
}
console.log(JSON.stringify({pass:true,samples,gameMaximumKmh:130,actualSectionLimitsVerified:false,curveLimits:false}));
