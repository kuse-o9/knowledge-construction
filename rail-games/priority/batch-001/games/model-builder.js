/* On-demand meshes for the retained game's chunk/window renderer.
 * The layout is a development approximation; station-specific surveys and rail
 * elevations must pass the release gates before these become a public game.
 */
(function(root){'use strict';
let data,common,stock,geos,clearance,cache=new Map();
function stationOuterTrackOffset(meta,start,end,d){
 const join=meta.islandOuterTrackJoin??(meta.side>0?0:12),t=Math.max(0,Math.min(1,Math.min((d-start)/100,(end-d)/100)));
 return join+(7.56-join)*t*t*(3-2*t);
}
function terminalBlend(delta){const t=Math.max(0,Math.min(1,(800-Math.abs(delta))/500));return t*t*(3-2*t);}
function terminalBase(delta){const t=Math.max(0,Math.min(1,(900-Math.abs(delta))/550));return 1.85+4.15*t*t*(3-2*t);}
function terminalTrackOffset(meta,native,d){
 const l=meta.terminalLayout,delta=d-meta.platformCenterDistance,w=terminalBlend(delta),own=(l.nativeDirection*terminalBase(delta))*(1-w)+l.nativeTrackOffset*w;
 return (native-own)*l.nativeDirection/meta.side;
}
function initialize(d,c,s){
 data=d;common=c;stock=s;clearance=null;cache.clear();geos={};const tracks=[],stations=[],groundHeights={};
 for(const [direction,route]of Object.entries(data.routes)){
  const geo=RailCore.geometry(route);RailCore.applyElevation(geo,route.groundHeights);geos[direction]=geo;groundHeights[direction]=route.groundHeights;
  for(let start=0;start<geo.length;start+=400){const end=Math.min(geo.length,start+400),p=RailCore.position(geo,(start+end)/2);tracks.push({id:direction+':track:'+start,direction,start,end,lon:p.lon,lat:p.lat,generated:true,kind:'track'});}
  const physical=route.physicalStops;
  physical.forEach((stop,i)=>stations.push({id:direction+':station:'+stop.code,direction,...stop,previous:physical[i-1]?.name||'',next:physical[i+1]?.name||'',side:stop.side||1,generated:true,kind:'station'}));
 }
 root.RAIL_PREBUILT_MODELS={version:1,format:'BAYLINE-prebuilt-colored-mesh',license:'Processed MLIT source geometry; shared original game mesh assets',credit:'国土数値情報（加工） / © OpenStreetMap contributors',groundHeights,tracks,stations,masts:[],...common,...stock,stationArchitecture:{},architectureReplacedColors:[],assetRevision:'priority-integration-1',coveredSections:[],trafficLines:[]};
}
function build(meta){
 if(cache.has(meta.id)){const value=cache.get(meta.id);cache.delete(meta.id);cache.set(meta.id,value);return value;}
 const C=Cesium,V=C.Cartesian3,geo=geos[meta.direction];
 function point(d){const p=RailCore.position(geo,d);return V.fromDegrees(p.lon,p.lat,p.height);}
 function frame(d){const center=point(d),forward=V.normalize(V.subtract(point(d+.3),point(d-.3),new V()),new V()),normal=C.Ellipsoid.WGS84.geodeticSurfaceNormal(center,new V()),left=V.normalize(V.cross(normal,forward,new V()),new V()),up=V.normalize(V.cross(forward,left,new V()),new V());return {center,forward,left,up};}
 const f=frame(meta.kind==='track'?(meta.start+meta.end)/2:meta.platformCenterDistance),origin=f.center,groups=new Map();let radius=1;
 function xyz(f,x,y,z){if(meta.kind==='station')y=(y+(meta.platformLateralOrigin||0))*meta.side;const out=V.clone(f.center);V.add(out,V.multiplyByScalar(f.forward,x,new V()),out);V.add(out,V.multiplyByScalar(f.left,y,new V()),out);V.add(out,V.multiplyByScalar(f.up,z,new V()),out);return out;}
 function quad(color,a,b,c,d){
  let polygons=[[a,b,c,d]];
  if(['#a6a89e','#e0c257','#d8d8ce','#bcc5c4'].includes(color)){
   if(!clearance)clearance=BaylineTunnels.clearance||BaylineTunnels.clearanceIndex(geos,(g,d)=>{const at=n=>{const p=RailCore.position(g,n);return V.fromDegrees(p.lon,p.lat,p.height);},center=at(d),forward=V.normalize(V.subtract(at(d+.3),at(d-.3),new V()),new V()),radial=C.Ellipsoid.WGS84.geodeticSurfaceNormal(center,new V()),left=V.normalize(V.cross(radial,forward,new V()),new V()),up=V.normalize(V.cross(forward,left,new V()),new V());return {center,up};});
   if(typeof clearance.clipPolygon==='function')polygons=clearance.clipPolygon(polygons[0]);
  }
  for(const polygon of polygons){
   let normal;
   for(let i=1;i<polygon.length-1;i++){const candidate=V.cross(V.subtract(polygon[i],polygon[0],new V()),V.subtract(polygon[i+1],polygon[0],new V()),new V());if(V.magnitudeSquared(candidate)>1e-12){normal=V.normalize(candidate,candidate);break;}}
   if(!normal)continue;
   if(!groups.has(color))groups.set(color,{p:[],n:[],i:[]});const group=groups.get(color),at=group.p.length/3;
   for(const p of polygon){const v=V.subtract(p,origin,new V());radius=Math.max(radius,V.magnitude(v));group.p.push(v.x,v.y,v.z);group.n.push(Math.round(normal.x*127),Math.round(normal.y*127),Math.round(normal.z*127));}
   for(let i=1;i<polygon.length-1;i++)group.i.push(at,at+i,at+i+1);
  }
 }
 function box(f,x,y,z,dx,dy,dz,color){const ps=[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]].map(([a,b,c])=>xyz(f,x+a*dx/2,y+b*dy/2,z+c*dz/2));for(const face of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])quad(color,...face.map(i=>ps[i]));}
 function ribbon(a,b,ya,yb,width,z,height,color){
  const u=frame(a),v=frame(b),p=[xyz(u,0,ya-width/2,z),xyz(u,0,ya+width/2,z),xyz(v,0,yb+width/2,z),xyz(v,0,yb-width/2,z)],q=[xyz(u,0,ya-width/2,z+height),xyz(u,0,ya+width/2,z+height),xyz(v,0,yb+width/2,z+height),xyz(v,0,yb-width/2,z+height)];
  quad(color,q[0],q[3],q[2],q[1]);quad(color,p[0],p[3],q[3],q[0]);quad(color,p[1],q[1],q[2],p[2]);quad(color,p[0],q[0],q[1],p[1]);quad(color,p[3],p[2],q[2],q[3]);
 }
 function strip(a,b,y,width,z,height,color){ribbon(a,b,y,y,width,z,height,color);}
 if(meta.kind==='track'){
  for(let d=meta.start;d<meta.end;d+=4){const end=Math.min(meta.end,d+4);strip(d,end,0,3.15,-.30,.12,'#85847b');for(const side of [-1,1]){const y=side*.5335;strip(d,end,y,.13,-.04,.025,'#727a79');strip(d,end,y,.028,-.015,.09,'#43484b');strip(d,end,y,.067,.075,.045,'#b8bec0');}strip(d,end,0,.022,5.45,.022,'#8b9395');}
  for(const span of geo.route.structures||[]){if(span.kind!=='bridge-or-viaduct')continue;
   const a=Math.max(meta.start,span.start),b=Math.min(meta.end,span.end);if(b<=a)continue;
   for(let d=a;d<b;d+=5){const end=Math.min(b,d+5);strip(d,end,0,3.5,-.7,.36,'#9ca6a7');for(const sign of[-1,1])strip(d,end,sign*1.68,.10,-.34,.85,'#bcc5c4');}
   for(let d=Math.ceil(a/20)*20;d<b;d+=20){const p=frame(d),delta=BaylineTunnels.offset(geo,d),height=delta-.7;if(height>1.2)box(p,0,0,-.7-height/2,1.4,1.4,height,'#8c9898');}
  }
  for(let d=Math.ceil(meta.start/.7)*.7;d<meta.end;d+=.7)box(frame(d),0,0,-.075,.22,2.45,.11,'#b7b5a8');
  for(let d=Math.ceil(meta.start/40)*40;d<meta.end;d+=40){const f=frame(d);box(f,0,3.15,2.65,.15,.16,5.5,'#919b9d');box(f,0,1.5,5.40,.12,3.5,.13,'#8b9395');box(f,0,.18,5.43,.16,.42,.13,'#e0ddc9');box(f,0,3.15,-.02,.55,.6,.42,'#adb5b4');}
 }else if(meta.terminalLayout){
  // Operator topology: side platform1, island2/3. Widths, branch spans and
  // transition lengths are explicit game estimates. Preserve both platforms.
  const l=meta.terminalLayout,c=meta.platformCenterDistance,start=Math.max(1,c-132.5),end=Math.min(geo.length-1,c+132.5),at=(native,d)=>terminalTrackOffset(meta,native,d);
  const a=Math.max(1,c-280),b=Math.min(geo.length-1,c+280);
  function rail(nativeAt){
   for(let d=a;d<b;d+=4){const e=Math.min(b,d+4),y=at(nativeAt(d),d),q=at(nativeAt(e),e);for(const sign of[-1,1])for(const[width,z,height,color]of[[.13,-.04,.025,'#727a79'],[.028,-.015,.09,'#43484b'],[.067,.075,.045,'#b8bec0']])ribbon(d,e,y+sign*.5335,q+sign*.5335,width,z,height,color);ribbon(d,e,y,q,3.15,-.30,.12,'#85847b');ribbon(d,e,y,q,.022,5.45,.022,'#8b9395');}
   for(let d=a;d<b;d+=.7)box(frame(d),0,at(nativeAt(d),d),-.075,.22,2.45,.11,'#b7b5a8');
  }
  // Both running tracks are already rendered by their route chunks. Other
  // passenger tracks remain within the station, with no invented branch route.
  for(const [key,native]of Object.entries(l.trackOffsets)){
   if(l.runningPlatforms.includes(key))continue;
   rail(d=>native);
  }
  for(const platform of l.platforms){
   for(let d=start;d<end;d+=5){const e=Math.min(end,d+5),y=at(platform.centre,d),q=at(platform.centre,e);ribbon(d,e,y,q,platform.width,.05,1.05,'#a6a89e');for(const edge of platform.numbers.length===2?[-1,1]:[Math.sign(l.trackOffsets[platform.numbers[0]]-platform.centre)])ribbon(d,e,at(platform.centre+edge*2,d),at(platform.centre+edge*2,e),.30,1.10,.025,'#e0c257');}
   for(let d=start+20;d<end-15;d+=18){const f=frame(d),y=at(platform.centre,d);box(f,0,y,3,.16,.2,3.9,'#aab7b3');box(f,0,y,4.9,18,4.8,.15,'#cdd5d0');box(f,0,y,4.73,7,.12,.09,'#eee7cc');box(f,0,y+.6,1.5,2.8,.52,.13,'#728d82');}
  }
  const centre=frame(c),lo=Math.min(...l.platforms.map(p=>p.centre)),hi=Math.max(...l.platforms.map(p=>p.centre));box(centre,0,at((lo+hi)/2,c),6.1,5,hi-lo+5,.3,'#cdd5d0');
  for(const platform of l.platforms){const y=at(platform.centre,c);box(centre,0,y,3.3,3,1.7,4.4,'#aab7b3');}
 }else{
  const start=Math.max(1,meta.distance-250),end=Math.min(geo.length-1,meta.distance+15);
  for(let d=start;d<end;d+=5){const e=Math.min(end,d+5);strip(d,e,3.78,4.4,.05,1.05,'#a6a89e');strip(d,e,1.78,.30,1.10,.025,'#e0c257');strip(d,e,1.62,.08,.08,.95,'#d8d8ce');}
  if(meta.platformLine==='chuo-sobu-local'){
   // Keep the local island and both local tracks separate from the rapid pair.
   for(let d=start;d<end;d+=4){const e=Math.min(end,d+4);strip(d,e,5.78,.30,1.10,.025,'#e0c257');for(const centre of[0,7.56]){strip(d,e,centre,3.15,-.30,.12,'#85847b');for(const sign of[-1,1]){const y=centre+sign*.5335;strip(d,e,y,.13,-.04,.025,'#727a79');strip(d,e,y,.028,-.015,.09,'#43484b');strip(d,e,y,.067,.075,.045,'#b8bec0');}strip(d,e,centre,.022,5.45,.022,'#8b9395');}}
   for(let d=start;d<end;d+=.7)for(const centre of[0,7.56])box(frame(d),0,centre,-.075,.22,2.45,.11,'#b7b5a8');
  }
  if(meta.islandOuterTrack){
   // The operator map establishes a third passenger track. Widths, turnout
   // positions and transitions are game estimates, never surveyed geometry.
   const a=Math.max(1,start-100),b=Math.min(geo.length-1,end+100),centre=d=>stationOuterTrackOffset(meta,a,b,d);
   for(let d=a;d<b;d+=4){const e=Math.min(b,d+4);for(const sign of[-1,1])for(const[width,z,height,color]of[[.13,-.04,.025,'#727a79'],[.028,-.015,.09,'#43484b'],[.067,.075,.045,'#b8bec0']]){const y=sign*.5335;ribbon(d,e,centre(d)+y,centre(e)+y,width,z,height,color);}ribbon(d,e,centre(d),centre(e),3.15,-.30,.12,'#85847b');ribbon(d,e,centre(d),centre(e),.022,5.45,.022,'#8b9395');}
   for(let d=a;d<b;d+=.7)box(frame(d),0,centre(d),-.075,.22,2.45,.11,'#b7b5a8');
   for(let d=start;d<end;d+=5){const e=Math.min(end,d+5);strip(d,e,5.78,.30,1.10,.025,'#e0c257');strip(d,e,5.94,.08,.08,.95,'#d8d8ce');}
  }
  if(!meta.islandOuterTrack&&meta.platformLine!=='chuo-sobu-local')for(let d=start+15;d<end-10;d+=15){const p=frame(d);box(p,0,6.15,1.65,.08,.08,1.2,'#727b75');box(p,0,6.15,2.17,15,.065,.065,'#727b75');}
  for(let d=meta.distance-190;d<meta.distance-35;d+=18){const p=frame(d);box(p,0,4.6,3,.16,.2,3.9,'#aab7b3');box(p,0,4.2,4.9,18,4.8,.15,'#cdd5d0');box(p,0,4.0,4.73,7,.12,.09,'#eee7cc');box(p,0,5.4,1.5,2.8,.52,.13,'#728d82');for(const x of [-1,1])box(p,x,5.4,1.28,.08,.35,.45,'#4d5a56');}
  for(const d of [meta.distance-185,meta.distance-95,meta.distance-30]){const p=frame(d);box(p,0,4.3,2.6,.10,.10,3.1,'#869b8d');box(p,0,4.3,3.65,2.6,.10,.8,'#e4e9de');box(p,0,4.22,3.4,2.6,.06,.13,'#8066ad');}
  box(frame(meta.distance),0,2.5,1.4,.10,.8,.65,'#eee9dd');
 }
 function b64(array){const bytes=new Uint8Array(array.buffer);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
 const model={...meta,origin:[origin.x,origin.y,origin.z],radius:radius+1,groups:Array.from(groups,([color,g])=>({color,positions:b64(new Float32Array(g.p)),normals:b64(new Int8Array(g.n)),indices:b64(g.p.length/3>65535?new Uint32Array(g.i):new Uint16Array(g.i)),indexType:g.p.length/3>65535?32:16}))};
 if(meta.kind==='station'){
  const label=xyz(frame(meta.distance-100),0,4.25,3.7),outer=xyz(frame(meta.distance-25),0,4.25,3.7);model.label=[label.x,label.y,label.z];model.outer=[outer.x,outer.y,outer.z];model.gateBatches=[];model.targets=[];model.passengers=[];
  const doors=(data.train.formations?.[meta.direction]||data.train.formation).flatMap(car=>car.doorCentres.map(x=>meta.distance-car.centreBehindFront+(car.reverse?-x:x)));
  const count=common.baselineStationPassengerCount;
  for(let i=0;i<count;i++){const d=doors[(i*3)%doors.length]+(Math.floor(i/doors.length)-3)*1.1,p=frame(d),position=xyz(p,0,2.8+(i%3)*.75,1.08),rotation=new C.Matrix3();C.Matrix3.setColumn(rotation,0,p.forward,rotation);C.Matrix3.setColumn(rotation,1,p.left,rotation);C.Matrix3.setColumn(rotation,2,p.up,rotation);const q=C.Quaternion.fromRotationMatrix(rotation,new C.Quaternion());model.passengers.push({position:[position.x,position.y,position.z],rotation:[q.x,q.y,q.z,q.w],variant:i%common.passengerModels.length,distance:d-meta.distance,lateral:(2.8+(meta.platformLateralOrigin||0))*meta.side,width:4.4,scale:.94});}
 }
 cache.set(meta.id,model);while(cache.size>32)cache.delete(cache.keys().next().value);return model;
}
root.BaylineBatchModels={initialize,build,releaseClearance(){clearance=null;},stationOuterTrackOffset,terminalTrackOffset,get cacheSize(){return cache.size;}};
})(window);
