/* Shared terminal resources for the game. Not real railway safety equipment. */
(function(g){'use strict';
const views=(traffic,player)=>[...traffic.trains,...(player?[{...player,id:'player'}]:[])];
function zone(geos,t,id){return geos[t.direction]?.route.sharedTerminals?.find(z=>z.id===id);}
function inside(t,z){return z&&t.distance>=z.entry&&t.distance-(t.length||220)<=z.exit;}
function gate(geo,z){const blocks=g.BaylineSignalRuntime.layout(geo).blocks,index=blocks.findIndex(b=>b.end>=z.entry);return {index,start:blocks[Math.max(0,index)].start};}
function allowed(traffic,geo,index,id){return !(geo.route.sharedTerminals||[]).some(z=>gate(geo,z).index===index&&traffic.terminalLocks?.[z.id]!==id);}
function update(traffic,geos,player){
 const trains=views(traffic,player),locks=traffic.terminalLocks||(traffic.terminalLocks={});
 const ids=new Set(Object.values(geos).flatMap(geo=>(geo.route.sharedTerminals||[]).map(z=>z.id)));
 for(const id of ids){
  let holder=trains.find(t=>t.id===locks[id]);
  if(holder){const z=zone(geos,holder,id);if(!z||holder.distance-(holder.length||220)>z.exit||holder.distance<z.entry-2000)holder=null;}
  if(!holder){
   const candidates=trains.filter(t=>{const z=zone(geos,t,id);return z&&t.distance>=z.entry-2000&&t.distance-(t.length||220)<=z.exit;});
   candidates.sort((a,b)=>{const za=zone(geos,a,id),zb=zone(geos,b,id);return Number(inside(b,zb))-Number(inside(a,za))||(za.entry-a.distance)-(zb.entry-b.distance)||String(a.id).localeCompare(String(b.id));});
   holder=candidates[0];
  }
  if(holder)locks[id]=holder.id;else delete locks[id];
 }
 return locks;
}
function stopDistance(geo,traffic,train){
 let stop=Infinity;
 for(const z of geo.route.sharedTerminals||[]){
  if(train.distance-(train.length||220)>z.exit)continue;
  if(traffic.terminalLocks?.[z.id]===(train.id||'player'))continue;
  stop=Math.min(stop,Math.max(0,gate(geo,z).start-train.distance-5));
 }
 return stop;
}
function initialize(traffic,geos,player){
 // A newly created traffic snapshot must not start with opposing trains already
 // sharing platform2. Relocate those trains; retain the original train count.
 const occupied=views(traffic,player);
 for(const t of traffic.trains){const geo=geos[t.direction];if(!(geo.route.sharedTerminals||[]).some(z=>inside(t,z)))continue;
  const start=geo.route.stops[0].distance,end=geo.route.stops.at(-1).distance;
  const candidates=[];for(let d=start+500;d<end-500;d+=500)candidates.push(d);
  candidates.sort((a,b)=>Math.abs(a-t.distance)-Math.abs(b-t.distance));
  const d=candidates.find(d=>!(geo.route.sharedTerminals||[]).some(z=>inside({...t,distance:d},z))&&!occupied.some(o=>o.id!==t.id&&o.direction===t.direction&&Math.abs(o.distance-d)<Math.max(t.length||220,o.length||220)+500));
  if(d===undefined)throw Error('折り返し線の周辺列車を安全に配置できません。');
  t.distance=d;t.speed=0;t.next=geo.route.stops.findIndex(s=>s.distance>d);t.dwell=0;
 }
 update(traffic,geos,player);return traffic;
}
function spawnBlocked(traffic,geos,train,candidate,player){
 for(const z of geos[train.direction].route.sharedTerminals||[]){
  if(!inside(candidate,z))continue;
  const holder=traffic.terminalLocks?.[z.id];
  if(holder&&holder!==train.id)return true;
  if(views(traffic,player).some(t=>t.id!==train.id&&inside(t,zone(geos,t,z.id))))return true;
  (traffic.terminalLocks||(traffic.terminalLocks={}))[z.id]=train.id;
 }
 return false;
}
g.BaylineTerminals={update,stopDistance,initialize,spawnBlocked,allowed};
const create=g.RailTraffic.create;g.RailTraffic.create=function(geos,mode,player){return initialize(create(geos,mode,player),geos,player);};
const step=g.RailTraffic.step;g.RailTraffic.step=function(traffic,geos,dt,player){update(traffic,geos,player);return step(traffic,geos,dt,player);};
})(typeof globalThis==='object'?globalThis:window);
