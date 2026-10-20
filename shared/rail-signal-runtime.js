/* Common game signalling. Approximate 600 m blocks, not real signal locations. */
(function(g){'use strict';
const S=g.BaylineSignals,cache=new WeakMap(),wrap=(d,L)=>(d%L+L)%L;
function layout(geo){
 if(cache.has(geo))return cache.get(geo);
 const end=geo.length,cuts=[0];
 const anchors=geo.route.stops.map(s=>s.distance+35).filter(d=>d>0&&d<end-50);
 for(const endAt of [...anchors,end].sort((a,b)=>a-b)){
  const start=cuts.at(-1);if(endAt-start<80&&endAt!==end)continue;
  const n=Math.max(1,Math.ceil((endAt-start)/600));for(let i=1;i<=n;i++)cuts.push(start+(endAt-start)*i/n);
 }
 const blocks=S.buildBlocks(end,cuts.slice(1,-1)),result={blocks,loop:!!geo.route.loop};cache.set(geo,result);return result;
}
function trainViews(geo,traffic,player,exclude){
 const list=[];for(const t of [...traffic.trains,...(player?[{...player,id:'player'}]:[])]){
  if(t.id===exclude||t.direction!==geo.key)continue;
  const front=t.distance,length=t.length||220;
  list.push({id:t.id,front,length});
  if(layout(geo).loop){list.push({id:t.id,front:front+geo.length,length},{id:t.id,front:front-geo.length,length});}
 }return list;
}
function aspect(geo,index,traffic,player,exclude,precomputed){
 if(g.BaylineJunctions&&!g.BaylineJunctions.allowed(traffic,geo,index,exclude||'player'))return 'RED';
 const {blocks,loop}=layout(geo);
 const request=geo.route.signalRoutes?.[index];
 // Configured junctions fail closed until their route is aligned and reserved.
 if(request&&(request.switchAligned!==true||!S.routeClear(request,traffic.reservations||[])))return 'RED';
 const occupied=precomputed||S.occupiedBlocks(blocks,trainViews(geo,traffic,player,exclude));
 if(occupied.has(index))return 'RED';
 const next=index+1<blocks.length?index+1:loop?0:-1;
 return occupied.has(next)?'YELLOW':'GREEN';
}
function control(geo,traffic,train,player){
 const {blocks,loop}=layout(geo),L=geo.length,d=train.distance;let next=null,stop=Infinity;
 const occupied=S.occupiedBlocks(blocks,trainViews(geo,traffic,player,train.id||'player'));
 if(g.BaylineJunctions?.blockedInside(traffic,geo,train))stop=0;
 for(let i=0;i<blocks.length;i++){
  let ahead=blocks[i].start-d;
  if(loop)ahead=wrap(ahead,L);
  if(ahead<-.05)continue;
  const color=aspect(geo,i,traffic,player,train.id||'player',occupied);
  if(!next||ahead<next.distance)next={index:i,distance:Math.max(0,ahead),aspect:color};
  if(color==='RED')stop=Math.min(stop,Math.max(0,ahead-5));
 }
 const current=S.blockAt(blocks,Math.min(L,Math.max(0,d)));
 // Occupancy appearing in the train's own block also enforces separation.
 const gap=clearance(geo,traffic,train,player);
 return {next,stopDistance:Math.min(stop,Math.max(0,gap-45)),limit:next?.aspect==='YELLOW'&&next.distance<800?45:Infinity};
}
function clearance(geo,traffic,train,player){
 let gap=Infinity;const L=geo.length,loop=layout(geo).loop;
 for(const t of [...traffic.trains,...(player?[{...player,id:'player'}]:[])]){
  if(t.id===(train.id||'player')||t.direction!==train.direction)continue;
  let d=t.distance-train.distance;if(loop)d=wrap(d,L);if(d<0)continue;
  gap=Math.min(gap,d-(t.length||220));
 }return gap;
}
function bind(geos){for(const [key,geo]of Object.entries(geos)){geo.key=key;layout(geo);}return geos;}
function update(state,geos,traffic,player){
 bind(geos);const geo=geos[player.direction],result=control(geo,traffic,{...player,id:'player'},null);
 state.signalAspect=result.next?.aspect||'GREEN';state.signalDistance=result.next?.distance??Infinity;
 state.signalLimit=result.limit;state.signalStop=result.stopDistance;
 state._trafficStart=state.distance;
 state.trafficGap=Math.min(clearance(geo,traffic,{...player,id:'player'},null),Number.isFinite(result.stopDistance)?result.stopDistance+45:Infinity);
 return result;
}
const pools=new WeakMap();
function render(viewer,Ces,geos,traffic,player,frameAt){
 if(!viewer||!traffic)return;bind(geos);const geo=geos[player.direction],{blocks,loop}=layout(geo),L=geo.length;
 let pool=pools.get(viewer);if(!pool){pool=new Map();pools.set(viewer,pool);}
 const wanted=new Set();
 for(let i=0;i<blocks.length;i++){
  const distance=blocks[i].start;let ahead=distance-player.distance;if(loop)ahead=wrap(ahead+300,L)-300;
  if(ahead< -300||ahead>1500)continue;
  const id=player.direction+':'+i;wanted.add(id);let item=pool.get(id);
  if(!item){
   const f=frameAt(geo,distance),rotation=new Ces.Matrix3();Ces.Matrix3.setColumn(rotation,0,f.forward,rotation);Ces.Matrix3.setColumn(rotation,1,f.left,rotation);Ces.Matrix3.setColumn(rotation,2,f.up,rotation);
   const orientation=Ces.Quaternion.fromRotationMatrix(rotation,new Ces.Quaternion());
   const point=(height,front=0)=>Ces.Cartesian3.add(Ces.Cartesian3.add(f.center,Ces.Cartesian3.multiplyByScalar(f.left,-3.15,new Ces.Cartesian3()),new Ces.Cartesian3()),Ces.Cartesian3.add(Ces.Cartesian3.multiplyByScalar(f.up,height,new Ces.Cartesian3()),Ces.Cartesian3.multiplyByScalar(f.forward,front,new Ces.Cartesian3()),new Ces.Cartesian3()),new Ces.Cartesian3());
   const entities=[],lamps={};
   entities.push(viewer.entities.add({name:'閉塞信号柱 '+id,position:point(1.65),orientation,cylinder:{length:3.3,topRadius:.075,bottomRadius:.10,material:Ces.Color.fromCssColorString('#919b98')}}));
   entities.push(viewer.entities.add({name:'閉塞信号機 '+id,position:point(3.9),orientation,box:{dimensions:new Ces.Cartesian3(.24,.64,1.65),material:Ces.Color.fromCssColorString('#172126')}}));
   for(const [color,height]of [['GREEN',4.43],['YELLOW',3.9],['RED',3.37]]){const lamp=viewer.entities.add({name:id+' '+color,position:point(height,-.16),orientation,ellipsoid:{radii:new Ces.Cartesian3(.055,.20,.20),material:Ces.Color.fromCssColorString('#263031')}});entities.push(lamp);lamps[color]=lamp;}
   item={entities,lamps,color:null};pool.set(id,item);
  }
  const color=aspect(geo,i,traffic,player,null);if(color!==item.color){item.color=color;for(const [name,lamp]of Object.entries(item.lamps))lamp.ellipsoid.material=Ces.Color.fromCssColorString(name===color?{RED:'#ff3434',YELLOW:'#ffce39',GREEN:'#37f276'}[name]:'#263031');}
 }
 for(const [id,item]of pool)if(!wanted.has(id)){for(const e of item.entities)viewer.entities.remove(e);pool.delete(id);}
}
function clear(viewer){const pool=pools.get(viewer);if(pool)for(const item of pool.values())for(const e of item.entities)viewer.entities.remove(e);pools.delete(viewer);}
g.BaylineSignalRuntime={layout,bind,aspect,control,clearance,update,render,clear};
if(typeof module==='object'&&module.exports)module.exports=g.BaylineSignalRuntime;
})(typeof globalThis==='object'?globalThis:window);
