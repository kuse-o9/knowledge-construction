import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=process.env.CESIUM_ENGINE||path.resolve(root,'../work/cesium-runtime/node_modules/@cesium/engine/Source');
const mod=async p=>(await import(pathToFileURL(path.join(runtime,p)))).default;
const [Pipeline,Box,Cartesian3,Matrix4,Instance,Projection,Ellipsoid,VertexFormat]=await Promise.all(['Scene/PrimitivePipeline.js','Core/BoxGeometry.js','Core/Cartesian3.js','Core/Matrix4.js','Core/GeometryInstance.js','Core/GeographicProjection.js','Core/Ellipsoid.js','Core/VertexFormat.js'].map(mod));
function compile(scene3DOnly){
 const geometry=Box.createGeometry(new Box({minimum:new Cartesian3(-10,-2,-2),maximum:new Cartesian3(10,2,2),vertexFormat:VertexFormat.POSITION_AND_NORMAL}));
 const matrix=Matrix4.fromTranslation(Cartesian3.fromDegrees(139.7,35.7,25));
 return Pipeline.combineGeometry({instances:[new Instance({geometry,modelMatrix:matrix})],projection:new Projection(Ellipsoid.WGS84),elementIndexUintSupported:true,scene3DOnly,vertexCacheOptimize:false,compressVertices:true,modelMatrix:Matrix4.clone(Matrix4.IDENTITY),createPickOffsets:false});
}
const old=compile(false),fresh=compile(true);let maxError=0;
const bytes=r=>r.geometries.reduce((sum,g)=>sum+g.indices.byteLength+Object.values(g.attributes).reduce((n,a)=>n+a.values.byteLength,0),0);
assert.equal(old.geometries.length,fresh.geometries.length);
for(let i=0;i<old.geometries.length;i++){
 const a=old.geometries[i],b=fresh.geometries[i];assert.deepEqual(a.indices,b.indices);
 const world=(g,m,n)=>Matrix4.multiplyByPoint(m,new Cartesian3(...[0,1,2].map(k=>g.attributes.position3DHigh.values[n+k]+g.attributes.position3DLow.values[n+k])),new Cartesian3());
 for(let n=0;n<a.attributes.position3DHigh.values.length;n+=3)maxError=Math.max(maxError,Cartesian3.distance(world(a,old.modelMatrix,n),world(b,fresh.modelMatrix,n)));
 for(const key of ['compressedAttributes','batchId'])assert.deepEqual(a.attributes[key]?.values,b.attributes[key]?.values);
 assert(!b.attributes.position2DHigh);assert(!b.attributes.position2DLow);
}
assert(maxError<.005,'World position encoding agrees within 5mm at Earth scale');assert(bytes(fresh)<bytes(old));
console.log(JSON.stringify({cesium:'1.117.0',baselineGeometryBytes:bytes(old),optimizedGeometryBytes:bytes(fresh),maximumWorldVertexErrorMetres:maxError,indicesNormalsAndBatchIdsUnchanged:true,physicalGpuTest:false}));
