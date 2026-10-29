'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/depot-webgl.js','utf8'),floors=JSON.parse(fs.readFileSync(__dirname+'/operator-floors.json')).floors;
const model=JSON.parse(fs.readFileSync(__dirname+'/depot-model.json'));model.faces.push(...JSON.parse(fs.readFileSync(__dirname+'/depot-express-faces.json')).faces);
const context={model,Math,Set,upload:faces=>({faces})};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  const LINE ='),source.indexOf('  let gl, program'))+source.slice(source.indexOf('  function box('),source.indexOf('  function upload('))+'\nthis.build=makeFloor;this.line=LINE;',context);
let trains=0;
for(const floor of floors){
 const mesh=context.build(floor),seen=new Set();
 for(const train of floor.trains){
  const [id,x]=context.line[train.path],centre=floor.floor===23?0:x;assert(!seen.has(centre),'Two formations share a track');seen.add(centre);
  const faces=mesh.faces.filter(f=>f.game===id),original=model.faces.filter(f=>f.game===id);assert.equal(faces.length,original.length,'Train geometry detail changed');
  const vertices=faces.flatMap(f=>f.v);assert(vertices.every(v=>Math.abs(v[0]-centre)<1.6));assert(vertices.every(v=>v[2]>-33.5&&v[2]<21.5),'Train outside platform');
  const obstacle=mesh.obstacles.find(b=>b.game===id);assert(Math.abs((obstacle.minX+obstacle.maxX)/2-centre)<0.01);trains++;
 }
}
const room=fs.readFileSync(__dirname+'/../../game-room/embedded-room.html','utf8'),home=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert(!room.includes('選車場'));assert(!room.includes('<canvas'));assert(room.includes('depot-3d.html?embed=1'));assert(!home.includes('href="depot-3d.html"'));assert(home.includes('embedded-room.html?v=company2'));assert(room.includes('こもれび島'));
console.log(JSON.stringify({pass:true,floors:floors.length,trains,oneFormationPerTrack:true,allFacesPreserved:true,oldSelectorRemoved:true}));
