/* Terrain openings and continuous cut-and-cover geometry for retained game alignments.
 * Cesium 1.117 ClippingPolygonCollection requires WebGL2. No ground is hidden globally.
 */
(function(g){'use strict';
let active=null;
function offset(geo,d){
 const c=geo.cumulative,a=geo.route.trackOffsets||[];let lo=0,hi=c.length-1;
 while(lo+1<hi){const m=(lo+hi)>>1;if(c[m]<=d)lo=m;else hi=m;}
 const t=Math.max(0,Math.min(1,(d-c[lo])/(c[hi]-c[lo]||1)));
 return (a[lo]??5)*(1-t)+(a[hi]??5)*t;
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

function setup(viewer,C,geos,frame){
 if(active)dispose();
 const segments=Object.entries(geos).flatMap(([key,geo])=>rangesCached(geo).map(r=>({...r,key,geo})));
 if(!segments.length)return {supported:true,segments:0};
 const supported=!!C.ClippingPolygonCollection?.isSupported(viewer.scene);
 if(!supported){active={viewer,C,segments,frame,entities:[],supported:false};return {supported:false,segments:segments.length};}
 // One owned collection at a time; replace only at a window boundary.
 const collection=new C.ClippingPolygonCollection({enabled:false});viewer.scene.globe.clippingPolygons=collection;
 viewer.scene.screenSpaceCameraController.enableCollisionDetection=false;
 active={viewer,C,segments,frame,collection,entities:[],supported:true,last:null};
 return {supported:true,segments:segments.length,polygons:0};
}
function render(player){
 const a=active;if(!a?.supported)return;
 const own=a.segments.find(r=>r.key===player.direction&&player.distance>=r.start-700&&player.distance<=r.end+700);
 const cell=own?player.direction+':'+Math.floor(player.distance/120):'outside';if(cell===a.last)return;a.last=cell;
 for(const e of a.entities)a.viewer.entities.remove(e);a.entities=[];
 // Cesium 1.117 detects vertex-count changes, not arbitrary position edits.
 // A fresh collection prevents stale clipping textures when counts are equal.
 a.viewer.scene.globe.clippingPolygons=undefined;a.collection=null;
 if(!own){a.viewer.scene.requestRender();return;}
 const polygons=[];let sourceVertices=0,maskVertices=0;
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
 const {C,viewer,frame}=a,add=e=>a.entities.push(viewer.entities.add(e));
 for(const r of a.segments){
  // Both tunnel bores remain visible; work is bounded to the player's nearby window.
  const ownPosition=frame(own.geo,Math.max(own.start,Math.min(own.end,player.distance))).center;
  for(let d=r.start;d<r.end;d+=12){const end=Math.min(r.end,d+12),f=frame(r.geo,(d+end)/2);
   if(C.Cartesian3.distance(f.center,ownPosition)>650)continue;
   const f0=frame(r.geo,d),f1=frame(r.geo,end),p=g.RailCore.position(r.geo,d),q=g.RailCore.position(r.geo,end);
   const buried=offset(r.geo,(d+end)/2)<-8&&(r.geo.route.structures||[]).some(s=>['tunnel','underground','snow-shed'].includes(s.kind)&&d>=s.start&&d<=s.end);
   // Fill the whole terrain opening below the retained ballast and rails.
   const floor=[side(C,f0,-10),side(C,f1,-10),side(C,f1,10),side(C,f0,10)].map((v,i)=>C.Cartesian3.add(v,C.Cartesian3.multiplyByScalar(i===0||i===3?f0.up:f1.up,-.3,new C.Cartesian3()),new C.Cartesian3()));
   add({name:'tunnel-floor',polygon:{hierarchy:floor,perPositionHeight:true,material:C.Color.fromCssColorString('#697277')}});
   for(const sign of [-1,1]){
    const positions=[side(C,f0,sign*9.6),side(C,f1,sign*9.6)];
    add({name:'tunnel-retaining-wall',wall:{positions,minimumHeights:[p.height-1,q.height-1],maximumHeights:[p.height+(buried?8.5:Math.max(1,1-offset(r.geo,d))),q.height+(buried?8.5:Math.max(1,1-offset(r.geo,end)))],material:C.Color.fromCssColorString('#667079')}});
   }
   if(buried){
    const roof=[side(C,f0,-10),side(C,f1,-10),side(C,f1,10),side(C,f0,10)].map((v,i)=>{
     const up=i===0||i===3?f0.up:f1.up;return C.Cartesian3.add(v,C.Cartesian3.multiplyByScalar(up,8.3,new C.Cartesian3()),new C.Cartesian3());
    });
    add({name:'tunnel-roof',polygon:{hierarchy:roof,perPositionHeight:true,material:C.Color.fromCssColorString('#4c565e')}});
    if(Math.floor(d/12)%4===0)add({name:'tunnel-light',position:C.Cartesian3.add(f.center,C.Cartesian3.multiplyByScalar(f.up,7.9,new C.Cartesian3()),new C.Cartesian3()),ellipsoid:{radii:new C.Cartesian3(.25,.25,.12),material:C.Color.fromCssColorString('#fff3c4')}});
   }
  }
 }
 viewer.scene.requestRender();
}
function model(m){
 // Existing beds and rails are kept; replace the old continuous walls/roof at the portal.
 if(!active?.supported)return m;
 const geo=active.segments.find(r=>m.direction===r.key&&m.start<r.end&&m.end>r.start)?.geo;
 if(!geo||!m.groups)return m;
 return {...m,groups:m.groups.filter(x=>!['#515d64','#606a70'].includes(x.color))};
}
function canRender(geo,d){return active?.supported!==false||!near(geo,d,200);}
function dispose(){if(!active)return;for(const e of active.entities)active.viewer.entities.remove(e);if(active.collection&&active.viewer.scene.globe.clippingPolygons===active.collection)active.viewer.scene.globe.clippingPolygons=undefined;active=null;}
g.BaylineTunnels={offset,ranges,near,setup,render,model,dispose,canRender,simplifyBoundary,get maskStats(){return active?.maskStats;}};
})(typeof globalThis==='object'?globalThis:window);

