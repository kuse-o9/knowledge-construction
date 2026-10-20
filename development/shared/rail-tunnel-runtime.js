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
  const under=(geo.route.trackOffsets?.[i]??5)<3;
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
function setup(viewer,C,geos,frame){
 if(active)dispose();
 const segments=Object.entries(geos).flatMap(([key,geo])=>rangesCached(geo).map(r=>({...r,key,geo})));
 if(!segments.length)return {supported:true,segments:0};
 const supported=!!C.ClippingPolygonCollection?.isSupported(viewer.scene);
 if(!supported){active={viewer,C,segments,frame,entities:[],supported:false};return {supported:false,segments:segments.length};}
 const polygons=[];
 for(const r of segments)for(let a=r.start;a<r.end;a+=240){
  const b=Math.min(r.end,a+240),left=[],right=[];
  for(let d=a;d<b;d+=8){const f=frame(r.geo,d);left.push(side(C,f,10));right.push(side(C,f,-10));}
  const f=frame(r.geo,b);left.push(side(C,f,10));right.push(side(C,f,-10));
  polygons.push(new C.ClippingPolygon({positions:left.concat(right.reverse())}));
 }
 const collection=new C.ClippingPolygonCollection({polygons});viewer.scene.globe.clippingPolygons=collection;
 viewer.scene.screenSpaceCameraController.enableCollisionDetection=false;
 active={viewer,C,segments,frame,collection,entities:[],supported:true,last:null};
 return {supported:true,segments:segments.length,polygons:polygons.length};
}
function render(player){
 const a=active;if(!a?.supported)return;
 const own=a.segments.find(r=>r.key===player.direction&&player.distance>=r.start-700&&player.distance<=r.end+700);
 const cell=own?player.direction+':'+Math.floor(player.distance/120):'outside';if(cell===a.last)return;a.last=cell;
 for(const e of a.entities)a.viewer.entities.remove(e);a.entities=[];if(!own)return;
 const {C,viewer,frame}=a,add=e=>a.entities.push(viewer.entities.add(e));
 for(const r of a.segments){
  // Both tunnel bores remain visible; work is bounded to the player's nearby window.
  const ownPosition=frame(own.geo,Math.max(own.start,Math.min(own.end,player.distance))).center;
  for(let d=r.start;d<r.end;d+=12){const end=Math.min(r.end,d+12),f=frame(r.geo,(d+end)/2);
   if(C.Cartesian3.distance(f.center,ownPosition)>650)continue;
   const f0=frame(r.geo,d),f1=frame(r.geo,end),p=g.RailCore.position(r.geo,d),q=g.RailCore.position(r.geo,end);
   const buried=offset(r.geo,(d+end)/2)<-8;
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
g.BaylineTunnels={offset,ranges,near,setup,render,model,dispose,canRender};
})(typeof globalThis==='object'?globalThis:window);
