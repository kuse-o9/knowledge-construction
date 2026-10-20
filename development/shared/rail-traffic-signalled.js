/* Traffic follows the same direction-specific game blocks as the player's train. */
(function(g){'use strict';const presets={rush:10,weekday:4,holiday:3},wrap=(d,L)=>(d%L+L)%L,R=()=>g.BaylineSignalRuntime;
function create(geos,mode,player){R().bind(geos);const trains=[],length=player.length||220;
 for(const [direction,geo]of Object.entries(geos)){
  const stops=geo.route.stops,start=stops[0].distance,end=stops.at(-1).distance,L=end-start;
  // Widen initial spacing only: inbound x1.5, outbound x2. Ring/directional lines use forward/reverse.
  const spacingScale=/上り/.test(geo.route.label||'')?1.5:/下り/.test(geo.route.label||'')?2:direction==='forward'?1.5:2;
  const spacing=(mode==='rush'?2000:mode==='holiday'?6000:4000)*spacingScale;
  const count=Math.max(1,Math.min(Math.floor(L/(1800*spacingScale)),Math.ceil(L/spacing)));
  for(let i=0;i<count;i++){
   const d=start+(i+.5)*L/count;let gap=Math.abs(d-player.distance);if(geo.route.loop)gap=Math.min(gap,L-gap);
   if(direction===player.direction&&gap<1000)continue;
   const next=stops.findIndex(s=>s.distance>d);
   trains.push({id:direction+':'+i,direction,distance:d,length,speed:10,next:next<0?stops.length-1:next,dwell:0,stops:0});
  }
 }return {trains,mode,elapsed:0,reservations:[]};
}
function playerGap(t,geos,player){R().bind(geos);return R().clearance(geos[player.direction],t,{...player,id:'player'},null);}
function step(t,geos,dt,player){dt=Math.max(0,Math.min(.1,dt));if(!dt)return;R().bind(geos);t.elapsed+=dt;
 const snapshot={...t,trains:t.trains.map(x=>({...x}))};
 for(const train of t.trains){const geo=geos[train.direction],stops=geo.route.stops,loop=!!geo.route.loop;
  if(train.dwell>0){train.dwell=Math.max(0,train.dwell-dt);continue;}
  if(train.next>=stops.length){
   const start=stops[0].distance,candidate={...train,distance:start};
   const blocked=[...snapshot.trains,...(player?[{...player,id:'player'}]:[])].some(o=>o.id!==train.id&&o.direction===train.direction&&Math.abs(o.distance-start)<(o.length||220)+500);
   if(!blocked){train.distance=start;train.next=1;train.speed=0;}continue;
  }
  const remain=Math.max(0,stops[train.next].distance-train.distance),signal=R().control(geo,snapshot,train,player),gap=R().clearance(geo,snapshot,train,player),clear=Math.max(0,Math.min(gap-45,signal.stopDistance));
  const desired=Math.min((g.RailCore.approachLimit||g.RailCore.speedLimit)(geo,train.distance)/3.6,signal.limit/3.6,Math.sqrt(1.4*Math.max(0,remain-.1)),Math.sqrt(1.3*clear));
  const old=train.speed;train.speed=Math.max(0,old+Math.max(-1.05,Math.min(.7,(desired-old)*1.6))*dt);
  let move=Math.min(clear,(old+train.speed)*dt/2);
  if(move>=remain||remain<.45&&train.speed<.65){move=remain;train.speed=0;train.dwell=8;train.next++;train.stops++;}
  train.distance=Math.min(geo.length,train.distance+move);
  if(move===clear&&Number.isFinite(clear))train.speed=0;
 }
}
g.RailTraffic={presets,create,step,playerGap,wrap};
})(typeof globalThis==='object'?globalThis:window);
