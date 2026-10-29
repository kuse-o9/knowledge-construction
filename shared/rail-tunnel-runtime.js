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
// Exact segment clearance in world metres. Nearby parallel bores must not put
// their inner retaining wall across another running track (or a tight curve).
function segmentGap2(a,b,c,d){
 const sub=(p,q)=>[p.x-q.x,p.y-q.y,p.z-q.z],dot=(p,q)=>p.reduce((s,v,i)=>s+v*q[i],0);
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),A=dot(u,u),B=dot(u,v),D=dot(u,w),E=dot(v,v),F=dot(v,w);
 let s=0,t=0;const clamp=n=>Math.max(0,Math.min(1,n));
 if(A<1e-12)t=E<1e-12?0:clamp(F/E);
 else if(E<1e-12)s=clamp(-D/A);
 else{const den=A*E-B*B;s=den>1e-12?clamp((B*F-D*E)/den):0;t=(B*s+F)/E;if(t<0){t=0;s=clamp(-D/A);}else if(t>1){t=1;s=clamp((B-D)/A);}}
 return w.reduce((sum,n,i)=>sum+(n+s*u[i]-t*v[i])**2,0);
}
function clearanceIndex(geos,frame){
 const cells=new Map(),size=32,range=(a,b,r=0)=>['x','y','z'].map(k=>[Math.floor((Math.min(a[k],b[k])-r)/size),Math.floor((Math.max(a[k],b[k])+r)/size)]);
 function visit(bounds,fn){for(let x=bounds[0][0];x<=bounds[0][1];x++)for(let y=bounds[1][0];y<=bounds[1][1];y++)for(let z=bounds[2][0];z<=bounds[2][1];z++)if(fn(x+','+y+','+z))return true;return false;}
 let count=0;
 for(const geo of Object.values(geos))for(let i=1;i<geo.cumulative.length;i++){
  const start=geo.cumulative[i-1],end=geo.cumulative[i],n=Math.max(1,Math.ceil((end-start)/32));let af=frame(geo,start),a=af.center;
  for(let j=1;j<=n;j++){const bf=frame(geo,start+(end-start)*j/n),b=bf.center,segment={a,b,id:count++,up:af.up||bf.up};visit(range(a,b),key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);});a=b;af=bf;}
 }
 function candidates(a,b,radius){const seen=new Set(),out=[];visit(range(a,b,radius),key=>{for(const s of cells.get(key)||[])if(!seen.has(s.id)){seen.add(s.id);out.push(s);}});return out;}
 return {segments:count,blocked(a,b,radius=6.5){const seen=new Set();return visit(range(a,b,radius),key=>{for(const s of cells.get(key)||[]){if(seen.has(s.id))continue;seen.add(s.id);if(segmentGap2(a,b,s.a,s.b)<radius*radius)return true;}return false;});},
 clipPolygon(points){
  const low={},high={};for(const k of ['x','y','z']){low[k]=Math.min(...points.map(p=>p[k]));high[k]=Math.max(...points.map(p=>p[k]));}
  let polygons=[points];
  for(const segment of candidates(low,high,5)){
   if(!segment.up)continue;
   if(!segment.box){const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),norm=p=>{const n=Math.hypot(p.x,p.y,p.z);return n>1e-9?{x:p.x/n,y:p.y/n,z:p.z/n}:null;},cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),forward=norm(sub(segment.b,segment.a));if(!forward)continue;const left=norm(cross(segment.up,forward));if(!left)continue;segment.box={center:{x:(segment.a.x+segment.b.x)/2,y:(segment.a.y+segment.b.y)/2,z:(segment.a.z+segment.b.z)/2},axes:[forward,left,cross(forward,left)],half:Math.hypot(segment.a.x-segment.b.x,segment.a.y-segment.b.y,segment.a.z-segment.b.z)/2+1.2};}
   const box=segment.box,planes=[[0,-box.half,box.half],[1,-1.8,1.8],[2,-.35,4.4]],outside=[];
   const project=(p,axis)=>{const a=box.axes[axis];return (p.x-box.center.x)*a.x+(p.y-box.center.y)*a.y+(p.z-box.center.z)*a.z;};
   for(const polygon of polygons){
    if(planes.some(([axis,min,max])=>polygon.every(p=>project(p,axis)<=min+1e-7)||polygon.every(p=>project(p,axis)>=max-1e-7))){outside.push(polygon);continue;}
    let inside=polygon;
    for(const [axis,min,max]of planes)for(const [sign,limit]of [[-1,-min],[1,max]]){
     if(inside.length<3)break;const yes=[],no=[];
     for(let i=0;i<inside.length;i++){const a=inside[i],b=inside[(i+1)%inside.length],da=sign*project(a,axis)-limit,db=sign*project(b,axis)-limit;if(da<=0)yes.push(a);if(da>=0)no.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db),q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};yes.push(q);no.push(q);}}
     if(no.length>=3)outside.push(no);inside=yes;
    }
   }
   polygons=outside;if(!polygons.length)break;
  }
  return polygons;
 }};
}
function setup(viewer,C,geos,frame){
 if(active)dispose();
 const segments=Object.entries(geos).flatMap(([key,geo])=>rangesCached(geo).map(r=>({...r,key,geo})));
 const supported=!!C.ClippingPolygonCollection?.isSupported(viewer.scene);
 if(!supported){active={viewer,C,segments,frame,entities:new Map(),supported:false};return {supported:false,segments:segments.length};}
 // One owned collection at a time; replace only at a window boundary.
 const collection=new C.ClippingPolygonCollection({enabled:false});viewer.scene.globe.clippingPolygons=collection;
 viewer.scene.screenSpaceCameraController.enableCollisionDetection=false;
 active={viewer,C,segments,geos,frame,collection,clearance:clearanceIndex(geos,frame),entities:new Map(),supported:true,last:null};
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
    // Overlapping terrain cuts form one opening. Keep the outside walls and
    // both tracks, but omit an internal panel that invades either rail envelope.
    if(a.clearance.blocked(positions[0],positions[1]))continue;
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
g.BaylineTunnels={offset,ranges,near,setup,render,model,dispose,canRender,simplifyBoundary,retainingRise,floorCuts,segmentGap2,clearanceIndex,get clearance(){return active?.clearance;},get maskStats(){return active?.maskStats;}};
})(typeof globalThis==='object'?globalThis:window);
