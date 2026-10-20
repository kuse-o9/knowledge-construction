/* Deterministic platform interaction for already-built connection stations. */
(function(g){'use strict';
function create(boundary){if(!boundary?.ok||!['transfer','reverse','consist'].includes(boundary.type))throw Error('接続操作がありません');return {type:boundary.type,length:boundary.type==='reverse'?(boundary.from.cars-1)*20:12,walk:0,elapsed:0,progress:0,ready:false};}
function step(s,dt,input=0){dt=Number.isFinite(dt)?Math.max(0,Math.min(s.type==='consist'?1:.1,dt)):0;if(s.type==='consist'){s.elapsed+=dt;s.progress=Math.min(1,s.elapsed/6);s.ready=s.progress>=1;}else{s.walk=Math.max(0,Math.min(s.length,s.walk+Math.sign(input)*2.4*dt));s.progress=s.walk/s.length;s.ready=s.length-s.walk<.6;}return s;}
function reverseDistance(core,geo,target,start){let best={distance:start,error:Infinity};for(let d=Math.max(0,start-240);d<=Math.min(geo.length,start+240);d+=.5){const p=core.position(geo,d),error=Math.hypot((p.lon-target.lon)*90400,(p.lat-target.lat)*111200,p.height-target.height);if(error<best.error)best={distance:d,error};}return best.error<12?best.distance:start;}
g.BaylineBoundary={create,step,reverseDistance};if(typeof module==='object'&&module.exports)module.exports=g.BaylineBoundary;
})(typeof globalThis==='object'?globalThis:window);
