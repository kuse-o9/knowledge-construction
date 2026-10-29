/* BAYLINE shared signal model. Game simulation, not real railway safety logic.
 * Distances are metres, increasing in the current route direction.
 * Routes with different coordinate systems must be mapped to a common track first.
 */
(function(root){
'use strict';
function assertFinite(n,label){if(!Number.isFinite(n))throw new TypeError(label+' must be finite');}
function buildBlocks(length, boundaries){
  assertFinite(length,'length');if(length<=0)throw new RangeError('length must be positive');
  const cuts=[0,...(boundaries||[]),length];
  if(cuts.some(x=>!Number.isFinite(x))||cuts.some((x,i)=>i>0&&x<=cuts[i-1]))throw new RangeError('boundaries must increase inside route');
  return cuts.slice(0,-1).map((start,i)=>({id:i,start,end:cuts[i+1]}));
}
function blockAt(blocks,distance){
  assertFinite(distance,'distance');
  if(distance<0||distance>blocks.at(-1).end)return -1;
  if(distance===blocks.at(-1).end)return blocks.length-1;
  let lo=0,hi=blocks.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(blocks[mid].start<=distance)lo=mid+1;else hi=mid;}
  const index=lo-1;return index>=0&&distance<blocks[index].end?index:-1;
}
/* A block is occupied if any part of a train overlaps it, not just its midpoint.
 * Each train: {id, front, length}, with front at the leading end in increasing coordinates.
 * Trains on opposing tracks need separate track IDs and separate block tables.
 */
function occupiedBlocks(blocks,trains,excludeId){
  const occupied=new Set();
  for(const t of trains||[]){
    if(t.id===excludeId)continue;
    assertFinite(t.front,'train.front');assertFinite(t.length,'train.length');
    if(t.length<=0)throw new RangeError('train.length must be positive');
    const rear=t.front-t.length;
    // Ordered blocks: find the first possible overlap, then visit only covered blocks.
    let lo=0,hi=blocks.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(blocks[mid].end<=rear)lo=mid+1;else hi=mid;}
    for(let i=lo;i<blocks.length&&blocks[i].start<t.front;i++)if(rear<blocks[i].end)occupied.add(i);
  }
  return occupied;
}
/* Return a three-aspect game signal: RED stop, YELLOW caution, GREEN proceed.
 * A signal controls the block immediately ahead and reads one block beyond it.
 * For a closed route or an unresolved switch, caller must pass routeAvailable=false.
 */
function aspectAt(blocks,signalBlockIndex,trains,options={}){
  if(!Number.isInteger(signalBlockIndex)||signalBlockIndex<0||signalBlockIndex>=blocks.length)throw new RangeError('invalid signal block index');
  if(options.routeAvailable===false)return 'RED';
  const occupied=occupiedBlocks(blocks,trains,options.excludeId);
  if(occupied.has(signalBlockIndex))return 'RED';
  if(signalBlockIndex+1<blocks.length&&occupied.has(signalBlockIndex+1))return 'YELLOW';
  return 'GREEN';
}
function stopDistance(blocks,signalBlockIndex,aspect){
  if(aspect!=='RED')return Infinity;
  return blocks[signalBlockIndex].start;
}
/* Direction-aware route selection. Only trains on the same physical track may occupy a block.
 * A route request conflicts with another reserved movement when any resource ID overlaps.
 */
function routeClear(request,reservations=[]){
  if(!request||!Array.isArray(request.resources)||!request.resources.length)return false;
  if(request.switchAligned===false||request.enabled===false)return false;
  const own=new Set(request.resources);
  return !reservations.some(other=>other.id!==request.id&&(other.active!==false)&&
    Array.isArray(other.resources)&&other.resources.some(id=>own.has(id)));
}
function signalForRoute(blocks,index,trains,request,reservations=[]){
  return aspectAt(blocks,index,(trains||[]).filter(t=>t.trackId===request.trackId),
    {routeAvailable:routeClear(request,reservations)});
}
const api=Object.freeze({buildBlocks,blockAt,occupiedBlocks,aspectAt,stopDistance,routeClear,signalForRoute});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BaylineSignals=api;
})(typeof globalThis==='object'?globalThis:this);

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
 if(g.BaylineTerminals&&!g.BaylineTerminals.allowed(traffic,geo,index,exclude||'player'))return 'RED';
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
 const terminalStop=g.BaylineTerminals?.stopDistance(geo,traffic,train)??Infinity;if(terminalStop<stop){stop=terminalStop;if(!next||terminalStop<next.distance)next={index:-1,distance:terminalStop,aspect:'RED'};}
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
   if(!blocked&&!g.BaylineTerminals.spawnBlocked(snapshot,geos,train,candidate,player)){train.distance=start;train.next=1;train.speed=0;}continue;
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

/* Terrain openings and continuous cut-and-cover geometry for retained game alignments.
 * Cesium 1.117 ClippingPolygonCollection requires WebGL2. No ground is hidden globally.
 */
(function(g){'use strict';
let active=null;
function offset(geo,d){
 const c=geo.cumulative,a=geo.route.trackOffsets||[];let lo=0,hi=c.length-1;
 while(lo+1<hi){const m=(lo+hi)>>1;if(c[m]<=d)lo=m;else hi=m;}
 const t=Math.max(0,Math.min(1,(d-c[lo])/(c[hi]-c[lo]||1)));
 const at=i=>a[i]??(Number.isFinite(geo.elevations?.[i]-geo.groundHeights?.[i])?geo.elevations[i]-geo.groundHeights[i]:5);
 return at(lo)*(1-t)+at(hi)*t;
}
function ranges(geo){
 const out=[];let start=null;
 for(let i=0;i<geo.cumulative.length;i++){
  const under=(geo.route.trackOffsets?.[i]??5)<-.15;
  // Only ranges containing genuinely subterranean track need terrain cutting.
  if(under&&start===null)start=i;
  if(start!==null&&(!under||i===geo.cumulative.length-1)){
   const end=i,buried=geo.route.trackOffsets.slice(start,end+1).some(x=>x< -1);
   if(buried)out.push({start:geo.cumulative[start],end:geo.cumulative[end]});start=null;
  }
 }return out;
}
function near(geo,d,margin=0){return rangesCached(geo).some(r=>d>=r.start-margin&&d<=r.end+margin);}
// Cut terrain locally; an outlying terrain sample must not create a skyscraper wall.
function retainingRise(geo,d){return Math.min(12,Math.max(1,1-offset(geo,d)));}
const cache=new WeakMap();function rangesCached(geo){if(!cache.has(geo))cache.set(geo,ranges(geo));return cache.get(geo);}
function side(C,frame,width){return C.Cartesian3.add(frame.center,C.Cartesian3.multiplyByScalar(frame.left,width,new C.Cartesian3()),new C.Cartesian3());}

// Remove redundant terrain-mask vertices to millimetre precision. Rail, roof,
// wall and train meshes, clipping texture resolution and view distance stay intact.
function simplifyBoundary(points,tolerance=.001){
 if(points.length<=2)return points.slice();
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],limit=tolerance*tolerance;
 while(stack.length){const [lo,hi]=stack.pop(),a=points[lo],b=points[hi],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;let best=limit,index=-1;
  for(let i=lo+1;i<hi;i++){const p=points[i],x=p.x-a.x,y=p.y-a.y,z=p.z-a.z,t=length?Math.max(0,Math.min(1,(x*dx+y*dy+z*dz)/length)):0,d=(x-t*dx)**2+(y-t*dy)**2+(z-t*dz)**2;if(d>best){best=d;index=i;}}
  if(index!==-1){keep.add(index);stack.push([lo,index],[index,hi]);}
 }return Array.from(keep).sort((a,b)=>a-b).map(i=>points[i]);
}

// Split the fill at every elevation vertex, so a straight fill chord cannot
// cover rails in a vertical dip between two samples.
function floorCuts(geo,start,end){
 const out=[start,end];for(let d=start+8;d<end;d+=8)out.push(d);
 const c=geo.cumulative;let lo=0,hi=c.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(c[mid]<=start)lo=mid+1;else hi=mid;}
 for(let i=lo;i<c.length&&c[i]<end;i++)out.push(c[i]);
 return out.sort((a,b)=>a-b).filter((d,i,a)=>i===0||d-a[i-1]>1e-6);
}
function setup(viewer,C,geos,frame){
 if(active)dispose();
 const segments=Object.entries(geos).flatMap(([key,geo])=>rangesCached(geo).map(r=>({...r,key,geo})));
 const supported=!!C.ClippingPolygonCollection?.isSupported(viewer.scene);
 if(!supported){active={viewer,C,segments,frame,entities:new Map(),supported:false};return {supported:false,segments:segments.length};}
 // One owned collection at a time; replace only at a window boundary.
 const collection=new C.ClippingPolygonCollection({enabled:false});viewer.scene.globe.clippingPolygons=collection;
 viewer.scene.screenSpaceCameraController.enableCollisionDetection=false;
 active={viewer,C,segments,geos,frame,collection,entities:new Map(),supported:true,last:null};
 return {supported:true,segments:segments.length,polygons:0};
}
function render(player){
 const a=active;if(!a?.supported)return;
 const own=a.segments.find(r=>r.key===player.direction&&player.distance>=r.start-700&&player.distance<=r.end+700),line=a.geos[player.direction];
 const cell=(own?'tunnel:':'surface:')+player.direction+':'+Math.floor(player.distance/120);if(cell===a.last)return;a.last=cell;
 const wanted=new Set();
 const retain=(key,spec)=>{wanted.add(key);if(!a.entities.has(key))a.entities.set(key,a.viewer.entities.add(spec));};
 const prune=()=>{for(const [key,e] of a.entities)if(!wanted.has(key)){a.viewer.entities.remove(e);a.entities.delete(key);}};
 // Cesium 1.117 detects vertex-count changes, not arbitrary position edits.
 // A fresh collection prevents stale clipping textures when counts are equal.
 a.viewer.scene.globe.clippingPolygons=undefined;a.collection=null;
 const surfacePolygons=[];
 {
  if(!line){prune();a.viewer.scene.requestRender();return;}
  // Remove only a moving, track-width terrain strip; the rest of the landscape stays intact.
  const C=a.C,from=Math.max(0,Math.floor((player.distance-700)/120)*120),to=Math.min(line.length,player.distance+820),polygons=surfacePolygons;
  for(let start=from;start<to;start+=120){const end=Math.min(line.length,start+120),left=[],right=[];
   for(let d=start;d<end;d+=8){const f=a.frame(line,d);left.push(side(C,f,12));right.push(side(C,f,-12));}
   const f=a.frame(line,end);left.push(side(C,f,12));right.push(side(C,f,-12));
   polygons.push(new C.ClippingPolygon({positions:simplifyBoundary(left).concat(simplifyBoundary(right).reverse())}));
   const cuts=floorCuts(line,start,end);for(let i=0;i<cuts.length-1;i++){const d=cuts[i],next=cuts[i+1];if(near(line,(d+next)/2))continue;const f0=a.frame(line,d),f1=a.frame(line,next);const floor=[side(C,f0,-12),side(C,f1,-12),side(C,f1,12),side(C,f0,12)].map((v,i)=>C.Cartesian3.add(v,C.Cartesian3.multiplyByScalar(i===0||i===3?f0.up:f1.up,-Math.max(.3,offset(line,i===0||i===3?d:next)),new C.Cartesian3()),new C.Cartesian3()));retain('surface:'+player.direction+':'+d,{name:'track-cut-floor',polygon:{hierarchy:floor,perPositionHeight:true,material:C.Color.fromCssColorString('#697277')}});}
  }
  if(!own){a.collection=new C.ClippingPolygonCollection({polygons,enabled:polygons.length>0});a.viewer.scene.globe.clippingPolygons=a.collection;prune();a.viewer.scene.requestRender();return;}
 }
 // Keep the surface corridor cut at tunnel approaches too: terrain relief can
 // intersect the track before the sampled subterranean interval begins.
 const polygons=surfacePolygons;let sourceVertices=0,maskVertices=0;
 for(const r of a.segments)for(let start=r.start;start<r.end;start+=160){
  const end=Math.min(r.end,start+160),mid=a.frame(r.geo,(start+end)/2);
  if(a.C.Cartesian3.distance(mid.center,a.frame(own.geo,player.distance).center)>1000)continue;
  const left=[],right=[];
  for(let d=start;d<end;d+=8){const f=a.frame(r.geo,d);left.push(side(a.C,f,10));right.push(side(a.C,f,-10));}
  const f=a.frame(r.geo,end);left.push(side(a.C,f,10));right.push(side(a.C,f,-10));
  sourceVertices+=left.length+right.length;const positions=simplifyBoundary(left).concat(simplifyBoundary(right).reverse());maskVertices+=positions.length;
  polygons.push(new a.C.ClippingPolygon({positions}));
 }
 a.maskStats={sourceVertices,maskVertices,toleranceMetres:.001};
 a.collection=new a.C.ClippingPolygonCollection({polygons,enabled:polygons.length>0});a.viewer.scene.globe.clippingPolygons=a.collection;
 const {C,viewer,frame}=a;
 for(const r of a.segments){
  // Both tunnel bores remain visible; work is bounded to the player's nearby window.
  const ownPosition=frame(own.geo,Math.max(own.start,Math.min(own.end,player.distance))).center;
  for(let d=r.start;d<r.end;d+=12){const end=Math.min(r.end,d+12),f=frame(r.geo,(d+end)/2);
   if(C.Cartesian3.distance(f.center,ownPosition)>650)continue;
   const f0=frame(r.geo,d),f1=frame(r.geo,end),p=g.RailCore.position(r.geo,d),q=g.RailCore.position(r.geo,end);
   const buried=offset(r.geo,(d+end)/2)<-8&&(!r.geo.route.structures?.length||(r.geo.route.structures||[]).some(s=>['tunnel','underground','snow-shed'].includes(s.kind)&&d>=s.start&&d<=s.end));
   // Fill the whole terrain opening below the retained ballast and rails.
   const cuts=floorCuts(r.geo,d,end);for(let i=0;i<cuts.length-1;i++){const sf0=frame(r.geo,cuts[i]),sf1=frame(r.geo,cuts[i+1]);
   const floor=[side(C,sf0,-10),side(C,sf1,-10),side(C,sf1,10),side(C,sf0,10)].map((v,i)=>C.Cartesian3.add(v,C.Cartesian3.multiplyByScalar(i===0||i===3?sf0.up:sf1.up,-.3,new C.Cartesian3()),new C.Cartesian3()));
   retain('tunnel-floor:'+r.key+':'+cuts[i],{name:'tunnel-floor',polygon:{hierarchy:floor,perPositionHeight:true,material:C.Color.fromCssColorString('#697277')}});}
   for(const sign of [-1,1]){
    const positions=[side(C,f0,sign*9.6),side(C,f1,sign*9.6)];
    retain('tunnel-wall:'+r.key+':'+d+':'+sign,{name:'tunnel-retaining-wall',wall:{positions,minimumHeights:[p.height-1,q.height-1],maximumHeights:[p.height+(buried?8.5:retainingRise(r.geo,d)),q.height+(buried?8.5:retainingRise(r.geo,end))],material:C.Color.fromCssColorString('#667079')}});
   }
   if(buried){
    const roof=[side(C,f0,-10),side(C,f1,-10),side(C,f1,10),side(C,f0,10)].map((v,i)=>{
     const up=i===0||i===3?f0.up:f1.up;return C.Cartesian3.add(v,C.Cartesian3.multiplyByScalar(up,8.3,new C.Cartesian3()),new C.Cartesian3());
    });
    retain('tunnel-roof:'+r.key+':'+d,{name:'tunnel-roof',polygon:{hierarchy:roof,perPositionHeight:true,material:C.Color.fromCssColorString('#4c565e')}});
    if(Math.floor(d/12)%4===0)retain('tunnel-light:'+r.key+':'+d,{name:'tunnel-light',position:C.Cartesian3.add(f.center,C.Cartesian3.multiplyByScalar(f.up,7.9,new C.Cartesian3()),new C.Cartesian3()),ellipsoid:{radii:new C.Cartesian3(.25,.25,.12),material:C.Color.fromCssColorString('#fff3c4')}});
   }
  }
 }
 prune();viewer.scene.requestRender();
}
function model(m){
 // Existing beds and rails are kept; replace the old continuous walls/roof at the portal.
 if(!active?.supported)return m;
 const geo=active.segments.find(r=>m.direction===r.key&&m.start<r.end&&m.end>r.start)?.geo;
 if(!geo||!m.groups)return m;
 return {...m,groups:m.groups.filter(x=>!['#515d64','#606a70'].includes(x.color))};
}
function canRender(geo,d){return active?.supported!==false||!near(geo,d,200);}
function dispose(){if(!active)return;for(const e of active.entities.values())active.viewer.entities.remove(e);if(active.collection&&active.viewer.scene.globe.clippingPolygons===active.collection)active.viewer.scene.globe.clippingPolygons=undefined;active=null;}
g.BaylineTunnels={offset,ranges,near,setup,render,model,dispose,canRender,simplifyBoundary,retainingRise,floorCuts,get maskStats(){return active?.maskStats;}};
})(typeof globalThis==='object'?globalThis:window);

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

/* Deterministic platform interaction for already-built connection stations. */
(function(g){'use strict';
function create(boundary){if(!boundary?.ok||!['transfer','reverse','consist'].includes(boundary.type))throw Error('接続操作がありません');return {type:boundary.type,length:boundary.type==='reverse'?(boundary.from.cars-1)*20:12,walk:0,elapsed:0,progress:0,ready:false};}
function step(s,dt,input=0){dt=Number.isFinite(dt)?Math.max(0,Math.min(s.type==='consist'?1:.1,dt)):0;if(s.type==='consist'){s.elapsed+=dt;s.progress=Math.min(1,s.elapsed/6);s.ready=s.progress>=1;}else{s.walk=Math.max(0,Math.min(s.length,s.walk+Math.sign(input)*2.4*dt));s.progress=s.walk/s.length;s.ready=s.length-s.walk<.6;}return s;}
function reverseDistance(core,geo,target,start){let best={distance:start,error:Infinity};for(let d=Math.max(0,start-240);d<=Math.min(geo.length,start+240);d+=.5){const p=core.position(geo,d),error=Math.hypot((p.lon-target.lon)*90400,(p.lat-target.lat)*111200,p.height-target.height);if(error<best.error)best={distance:d,error};}return best.error<12?best.distance:start;}
g.BaylineBoundary={create,step,reverseDistance};if(typeof module==='object'&&module.exports)module.exports=g.BaylineBoundary;
})(typeof globalThis==='object'?globalThis:window);

/* Nearby traffic uses retained existing alignments, terrain heights and stock meshes.
 * No synthetic ground-level metro tracks or unbuilt railways are generated here.
 */
(function(g){'use strict';let ready=null;const scenes=new WeakMap();
function load(){if(!ready){const u=new URL('../../../../shared/neighbour-corridors.bin?v=profiles1',location.href);ready=fetch(u).then(r=>{if(!r.ok)throw Error('nearby railway data');return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();}).catch(()=>{ready=null;return null;});}return ready;}
function setup(viewer,C,core,ownId,adapter){if(scenes.has(viewer))return scenes.get(viewer);const s={viewer,C,core,ownId,adapter,corridors:[],slots:[],rails:[],lastRail:null,elapsed:0,failed:false};scenes.set(viewer,s);void load().then(data=>{if(!data){s.failed=true;return;}for(const line of data.corridors){if(line.id===ownId||(ownId==='sobu'&&line.id==='chuo-local'))continue;const geos=Object.fromEntries(Object.entries(line.routes).map(([key,r])=>{const geo=core.geometry(r);core.applyElevation(geo,r.groundHeights);return [key,geo];}));const traffic=g.RailTraffic.create(geos,'weekday',{direction:'none',distance:-10000,length:line.cars*20});s.corridors.push({...line,geos,traffic});}});return s;}
// Index the same samples used previously; no coarser route geometry or shorter draw range.
const indexes=new WeakMap(),CELL=1000;
function sampleIndex(geo,stride){let byStride=indexes.get(geo.route.points);if(!byStride){byStride=new Map();indexes.set(geo.route.points,byStride);}if(byStride.has(stride))return byStride.get(stride);const grid=new Map();for(let i=0;i<geo.route.points.length;i+=stride){const p=geo.route.points[i],key=Math.floor(p[0]*90400/CELL)+':'+Math.floor(p[1]*111200/CELL);let list=grid.get(key);if(!list){list=[];grid.set(key,list);}list.push(i);}byStride.set(stride,grid);return grid;}
function nearest(geo,p,stride,range){if(!Number.isFinite(range)||range>8000){let best=Infinity,index=-1;for(let i=0;i<geo.route.points.length;i+=stride){const q=geo.route.points[i],d=Math.hypot((q[0]-p.lon)*90400,(q[1]-p.lat)*111200);if(d<best){best=d;index=i;}}return {distance:best,index};}const grid=sampleIndex(geo,stride),x=Math.floor(p.lon*90400/CELL),y=Math.floor(p.lat*111200/CELL),reach=Math.ceil(range/CELL);let best=Infinity,index=-1;for(let dx=-reach;dx<=reach;dx++)for(let dy=-reach;dy<=reach;dy++)for(const i of grid.get((x+dx)+':'+(y+dy))||[]){const q=geo.route.points[i],d=Math.hypot((q[0]-p.lon)*90400,(q[1]-p.lat)*111200);if(d<best||d===best&&(index<0||i<index)){best=d;index=i;}}return {distance:best,index};}
function near(core,geo,p,range=1000){return nearest(geo,p,20,range).distance<range;}

function step(viewer,dt){const s=scenes.get(viewer);if(!s||!dt)return;s.elapsed+=dt;for(const line of s.corridors)g.RailTraffic.step(line.traffic,line.geos,dt,null);}
function clearRails(s){for(const e of s.rails)s.viewer.entities.remove(e);s.rails=[];}
function render(viewer,position,quality=1){const s=scenes.get(viewer);if(!s)return;const {C,core,adapter:a}=s,own=C.Cartesian3.fromDegrees(position.lon,position.lat,position.height),candidates=[];
 const corridors=s.corridors.filter(line=>Object.values(line.geos).some(geo=>near(core,geo,position)));
 if(!s.lastRail||Math.hypot((position.lon-s.lastRail.lon)*90400,(position.lat-s.lastRail.lat)*111200)>250){clearRails(s);s.lastRail={...position};for(const line of corridors)for(const geo of Object.values(line.geos)){
  const found=nearest(geo,position,5,900),best=found.distance,at=found.index<0?0:geo.cumulative[found.index];
  if(best<3||best>900)continue;for(const side of [-.5335,.5335]){const points=[];for(let d=Math.max(0,at-850);d<Math.min(geo.length,at+850);d+=12){const f=a.frame(geo,d);points.push(C.Cartesian3.add(C.Cartesian3.add(f.center,C.Cartesian3.multiplyByScalar(f.left,side,new C.Cartesian3()),new C.Cartesian3()),C.Cartesian3.multiplyByScalar(f.up,.14,new C.Cartesian3()),new C.Cartesian3()));}if(points.length>1)s.rails.push(viewer.entities.add({name:'既存路線 '+line.id+' の隣接線路',polyline:{positions:points,width:2,material:C.Color.fromCssColorString('#a6b7bc')}}));}
 }}
 for(const line of corridors)for(const t of line.traffic.trains){const geo=line.geos[t.direction],p=core.position(geo,t.distance),distance=C.Cartesian3.distance(own,C.Cartesian3.fromDegrees(p.lon,p.lat,p.height));if(distance<950)candidates.push({line,t,geo,distance});}
 candidates.sort((x,y)=>x.distance-y.distance);const wanted=candidates.slice(0,quality===0?1:2);let n=0;
 for(const {line,t,geo}of wanted){let slot=s.slots[n];if(slot?.id!==line.id){if(slot)for(const parts of slot.parts.flat())for(const p of parts)viewer.scene.primitives.remove(p);slot={id:line.id,parts:Array.from({length:line.cars},(_,i)=>[a.load(i===0?line.stock.trainHead:i===line.cars-1?(line.stock.trainTail||line.stock.train):line.stock.train),...(line.stock.bogie?[-7.1,7.1].map(()=>a.load(line.stock.bogie)):[])])};s.slots[n]=slot;}
  for(let i=0;i<line.cars;i++){const d=t.distance-10-i*20,valid=d>=0&&d<=geo.length;for(let j=0;j<slot.parts[i].length;j++){const f=j===0?a.pose(d,geo):a.frame(geo,d+[-7.1,7.1][j-1],.9);if(j>0)f.center=C.Cartesian3.add(f.center,C.Cartesian3.multiplyByScalar(f.up,.07,new C.Cartesian3()),new C.Cartesian3());const matrix=a.matrix(f);for(const p of slot.parts[i][j]){p.show=valid;p.modelMatrix=matrix;}}}n++;
 }for(let i=n;i<s.slots.length;i++)for(const parts of s.slots[i].parts.flat())for(const p of parts)p.show=false;
}
function dispose(viewer){const s=scenes.get(viewer);if(!s)return;clearRails(s);for(const slot of s.slots)for(const parts of slot.parts.flat())for(const p of parts)viewer.scene.primitives.remove(p);scenes.delete(viewer);}
g.BaylineNeighbours={setup,step,render,dispose,near,nearest};
})(typeof globalThis==='object'?globalThis:window);

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
