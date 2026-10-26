/* Development component: stock-specific cars, bogies, doors and nose orientation.
 * No commuter-car length/door constants are baked into this renderer.
 * A complete verified formation must be provided by the route builder.
 */
(function(root){'use strict';
function mount(viewer,C,Core,geo,stock,formation){
 if(!Array.isArray(formation)||!formation.length)throw Error('A formation is required');
 let accumulated=0;
 const cars=formation.map(car=>{
  if(![car.pitch,car.frontExtent,car.bogieHalfSpan].every(Number.isFinite)||!(car.pitch>0&&car.frontExtent>0&&car.frontExtent<car.pitch&&car.bogieHalfSpan>0&&car.bogieHalfSpan<car.pitch/2)||!stock[car.model]||!Array.isArray(car.doorCentres)||!car.doorCentres.every(Number.isFinite))throw Error('Invalid stock-specific car geometry');
  if(car.bogieModels&&(!Array.isArray(car.bogieModels)||car.bogieModels.length!==2))throw Error('Two bogie models are required per car');
  const out={...car,centreBehindFront:accumulated+car.frontExtent};accumulated+=car.pitch;return out;
 });
 const V=C.Cartesian3,M=C.Matrix4,geometries=new WeakMap();
 function position(distance){const p=Core.position(geo,distance);if(!Number.isFinite(p.height))throw Error('Missing alignment elevation');return V.fromDegrees(p.lon,p.lat,p.height);}
 function frame(distance,span=.3){
  const a=position(distance-span),b=position(distance+span),center=V.midpoint(a,b,new V()),forward=V.normalize(V.subtract(b,a,new V()),new V()),radial=C.Ellipsoid.WGS84.geodeticSurfaceNormal(center,new V()),left=V.normalize(V.cross(radial,forward,new V()),new V()),up=V.normalize(V.cross(forward,left,new V()),new V());
  return {center,forward,left,up};
 }
 function matrix(f,reverse=false){const sign=reverse?-1:1,r=new C.Matrix3();C.Matrix3.setColumn(r,0,V.multiplyByScalar(f.forward,sign,new V()),r);C.Matrix3.setColumn(r,1,V.multiplyByScalar(f.left,sign,new V()),r);C.Matrix3.setColumn(r,2,f.up,r);return M.fromRotationTranslation(r,f.center,new M());}
 function decode(s,T){return new T(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);}
 function geometry(group){
  if(geometries.has(group))return geometries.get(group);
  const ps=Float64Array.from(decode(group.positions,Int16Array),n=>n*group.positionScale),normals=Float32Array.from(decode(group.normals,Int8Array),n=>n/127);
  const g=new C.Geometry({attributes:{position:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:ps}),normal:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.FLOAT,componentsPerAttribute:3,values:normals})},indices:decode(group.indices,Uint16Array),primitiveType:C.PrimitiveType.TRIANGLES,boundingSphere:C.BoundingSphere.fromVertices(ps)});geometries.set(group,g);return g;
 }
 const primitives=[];
 function model(model){
  const parts=[];
  for(const translucent of [false,true]){
   const groups=model.groups.filter(g=>(g.alpha<.99)===translucent);if(!groups.length)continue;
   const instances=groups.map(g=>new C.GeometryInstance({geometry:geometry(g),attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(g.color).withAlpha(g.alpha??1))}}));
   const primitive=viewer.scene.primitives.add(new C.Primitive({geometryInstances:instances,modelMatrix:M.IDENTITY,appearance:new C.PerInstanceColorAppearance({flat:false,closed:true,translucent}),asynchronous:false}));parts.push(primitive);primitives.push(primitive);
  }return parts;
 }
 const instances=cars.map(car=>({body:model(stock[car.model]),bogies:(car.bogieModels||['bogie','bogie']).map(key=>{if(!stock[key])throw Error('Missing stock-specific bogie '+key);return model(stock[key]);}),pantograph:car.pantograph?model(stock[car.pantographModel]||stock.pantograph):[],doors:stock.expressDoorPanel?car.doorCentres.flatMap(x=>[-1,1].map(side=>({x,side,parts:model(stock.expressDoorPanel)}))):[]}));
 function setFront(frontDistance,visible=true,doorState=null){
  if(!Number.isFinite(frontDistance)||frontDistance-accumulated<.5||frontDistance>geo.length-.5)throw Error('Insufficient source-track buffer for this formation');
  const poses=[];
  cars.forEach((car,i)=>{
   const distance=frontDistance-car.centreBehindFront;
   const body=frame(distance,car.bogieHalfSpan);
   // Lift the rigid car chord over the alignment at the body ends and centre.
   let rise=0;for(const offset of [-car.frontExtent,-car.bogieHalfSpan,0,car.bogieHalfSpan,car.frontExtent]){
    const rail=position(distance+offset),chord=V.add(body.center,V.multiplyByScalar(body.forward,offset,new V()),new V());rise=Math.max(rise,V.dot(V.subtract(rail,chord,new V()),body.up));
   }
   body.center=V.add(body.center,V.multiplyByScalar(body.up,rise,new V()),new V());
   const transform=matrix(body,!!car.reverse),instance=instances[i];
   for(const part of [...instance.body,...instance.pantograph]){part.modelMatrix=transform;part.show=visible;}
   const bogies=[-car.bogieHalfSpan,car.bogieHalfSpan].map(offset=>frame(distance+offset));
   bogies.forEach((f,n)=>{for(const part of instance.bogies[n]){part.modelMatrix=matrix(f,!!car.reverse);part.show=visible;}});
   for(const door of instance.doors){const open=doorState&&door.side*(car.reverse?-1:1)===doorState.side?doorState.opening:0,motion=root.BaylineExpressService.doorMotion(open),translation=M.fromTranslation(new V(door.x-Math.sign(door.x||1)*motion.slide,door.side*(1.477+motion.pop),0)),doorMatrix=M.multiply(transform,translation,new M());for(const part of door.parts){part.modelMatrix=doorMatrix;part.show=visible;}}
   poses.push({distance,body,bogies,doors:car.doorCentres.map(x=>distance+(car.reverse?-x:x)),reverse:!!car.reverse});
  });return poses;
 }
 return {setFront,length:accumulated,cars,frame,primitives,destroy(){for(const p of primitives)viewer.scene.primitives.remove(p);}};
}
root.BaylineTrainScene={mount};
})(typeof globalThis==='object'?globalThis:window);
