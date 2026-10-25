'use strict';
const fs=require('fs'),path=require('path'),z=require('zlib'),vm=require('vm'),assert=require('assert/strict');
const base=path.resolve(__dirname,'../../rail-games/priority/batch-001'),window={};vm.runInNewContext(fs.readFileSync(path.join(base,'games/model-builder.js'),'utf8'),{window});const offset=window.BaylineBatchModels.stationOuterTrackOffset;let cases=0;const names=new Set();
for(const id of['azusa','kaiji'])for(const route of Object.values(JSON.parse(z.gunzipSync(fs.readFileSync(path.join(base,'games/'+id+'.json.gz')))).data.routes))for(const s of route.physicalStops.filter(s=>s.islandOuterTrack)){
 const a=1000,b=1465,expected=s.side>0?0:12;
 assert.equal(offset(s,a,b,a),expected,s.name);assert.equal(offset(s,a,b,b),expected,s.name);assert.equal(offset(s,a,b,1200),7.56,s.name);
 for(let d=a;d<=b;d+=.5){const y=offset(s,a,b,d);assert.ok(Number.isFinite(y)&&y>=Math.min(expected,7.56)-1e-9&&y<=Math.max(expected,7.56)+1e-9);}
 for(const d of[a,a+100,b-100,b])assert.ok(Math.abs((offset(s,a,b,d+.01)-offset(s,a,b,d-.01))/.02)<.00005,'Non-smooth transition '+s.name);
 names.add(s.name);cases++;
}
assert.equal(names.size,13);assert.equal(cases,19);console.log(JSON.stringify({pass:true,cases,stations:[...names],endpointOwnership:true,smoothTransitions:true,positionsEstimated:true}));
