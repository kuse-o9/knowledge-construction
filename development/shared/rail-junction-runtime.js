/* Existing Tachikawa branch: game interlocking, not a surveyed signal diagram.
 * Reservations belong to individual trains and release only after the rear clears.
 */
(function(g){'use strict';const controllers=new WeakMap(),visuals=new WeakMap();
function create(geos){const zones=[];for(const [key,geo]of Object.entries(geos)){
 const station=geo.route.stops.find(s=>s.name==='立川');if(!station)continue;
 const blocks=g.BaylineSignalRuntime.layout(geo).blocks,index=Math.max(0,blocks.findIndex(b=>b.end>=station.distance-180));
 zones.push({key,index,entry:blocks[index].start,exit:station.distance+400,point:Math.min(geo.length,station.distance+100),geo});
 }return {zones,holder:null,position:'main',target:'main',moving:0,elapsed:0};}
function update(traffic,geos,player,dt=0,path='main'){
 let c=controllers.get(traffic);if(!c){c=create(geos);controllers.set(traffic,c);}dt=Math.max(0,Math.min(.1,dt));c.elapsed+=dt;
 const trains=[...traffic.trains,{...player,id:'player',path}],zone=t=>c.zones.find(z=>z.key===t.direction),inside=t=>{const z=zone(t);return z&&t.distance>=z.entry-350&&t.distance-(t.length||240)<z.exit;};
 const held=trains.find(t=>t.id===c.holder?.id&&inside(t));if(!held)c.holder=null;
 if(!c.holder){const candidates=trains.filter(inside).sort((a,b)=>{const za=zone(a),zb=zone(b);return (a.distance>=za.entry?-10000:za.entry-a.distance)-(b.distance>=zb.entry?-10000:zb.entry-b.distance);});const t=candidates[0];if(t){c.holder={id:t.id,path:t.path||path,direction:t.direction};c.target=c.holder.path;if(c.target!==c.position)c.moving=1.2;}}
 if(c.moving>0){c.moving=Math.max(0,c.moving-dt);if(!c.moving)c.position=c.target;}
 traffic.junction=c;traffic.reservations=(traffic.reservations||[]).filter(r=>r.source!=='tachikawa');if(c.holder)traffic.reservations.push({id:c.holder.id,source:'tachikawa',resources:['tachikawa-throat'],active:true});return c;
}
function allowed(traffic,geo,index,id){const c=controllers.get(traffic)||traffic?.junction;if(!c)return true;const z=c.zones.find(z=>z.geo===geo&&z.index===index);return !z||!!c.holder&&c.holder.id===id&&c.moving===0&&c.position===c.holder.path;}
function blockedInside(traffic,geo,train){const c=controllers.get(traffic)||traffic?.junction;if(!c)return false;const z=c.zones.find(z=>z.geo===geo);return !!z&&train.distance>=z.entry&&train.distance<=z.exit&&!allowed(traffic,geo,z.index,train.id||'player');}
function render(viewer,C,traffic,player,frame){const c=traffic?.junction;if(!viewer||!c)return;let pool=visuals.get(viewer);if(!pool){pool=[];visuals.set(viewer,pool);}
 const z=c.zones.find(z=>z.key===player.direction);if(!z||Math.abs(z.point-player.distance)>1000){for(const e of pool)viewer.entities.remove(e);pool.length=0;pool.key=null;return;}const key=z.key+':'+c.position+':'+c.target+':'+Math.round(c.moving*10)+':'+c.holder?.id;if(pool.key===key)return;for(const e of pool)viewer.entities.remove(e);pool.length=0;pool.key=key;const shift=.15*((c.position==='ome'?1:0)+(1-c.moving/1.2)*((c.target==='ome'?1:0)-(c.position==='ome'?1:0)));
 const f=frame(z.geo,z.point),point=(x,y,h)=>C.Cartesian3.add(f.center,C.Cartesian3.add(C.Cartesian3.multiplyByScalar(f.forward,x,new C.Cartesian3()),C.Cartesian3.add(C.Cartesian3.multiplyByScalar(f.left,y,new C.Cartesian3()),C.Cartesian3.multiplyByScalar(f.up,h,new C.Cartesian3()),new C.Cartesian3()),new C.Cartesian3()),new C.Cartesian3()),color=C.Color.fromCssColorString(c.moving?'#ffcf45':c.holder?'#4de1a1':'#b9c8ca');
 for(const sign of [-1,1])pool.push(viewer.entities.add({name:'立川分岐の転換レール（ゲーム用）',polyline:{positions:[point(-5,sign*.5335,.2),point(5,sign*.5335+shift,.2)],width:4,material:color}}));
 pool.push(viewer.entities.add({name:'転てつ機と進路鎖錠',position:point(0,-2.2,.25),box:{dimensions:new C.Cartesian3(.8,.6,.4),material:color},label:{text:c.moving?'転換中・停止':(c.position==='ome'?'青梅方面':'本線方面')+(c.holder?'／進路鎖錠':''),font:'12px sans-serif',pixelOffset:new C.Cartesian2(0,-25),showBackground:true,distanceDisplayCondition:new C.DistanceDisplayCondition(0,250)}}));
}
function clear(viewer){for(const e of visuals.get(viewer)||[])viewer.entities.remove(e);visuals.delete(viewer);}
g.BaylineJunctions={create,update,allowed,blockedInside,render,clear};
})(typeof globalThis==='object'?globalThis:window);
