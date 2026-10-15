/* Periodic trains on the real Chuo-Sobu Local corridor; game intervals, not a live timetable. */
(function(w){'use strict';
function create(models,mode,playerFraction=0){const C=w.RailCore,geos={};for(const [key,r]of Object.entries(models.parallelRoutes||{}))geos[key]=C.applyElevation(C.geometry(r),r.groundHeights);const groups=[];for(const key of ['forward','reverse']){const opposite=key==='forward'?'reverse':'forward',g=geos[opposite];if(!g)continue;const a=g.route.stops[0].distance,b=g.route.stops.at(-1).distance;groups.push(w.RailTraffic.create(geos,mode,{direction:opposite,distance:a+C.clamp(playerFraction,0,1)*(b-a)}));}return {geos,groups,mode};}
function step(state,dt){for(const g of state.groups)w.RailTraffic.step(g,state.geos,dt);}
w.SobuParallelTraffic={create,step};
})(typeof globalThis!=='undefined'?globalThis:window);
