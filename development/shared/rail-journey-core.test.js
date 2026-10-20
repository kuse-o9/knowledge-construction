'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..');global.BaylineThrough=require('./through-services.js');const K=require('./rail-journey-core.js');
function bundle(name){const h=fs.readFileSync(path.join(root,name+'.html'),'utf8'),m=h.match(/<script id="game-bundle"[^>]*>([\s\S]*?)<\/script>/);const prefix=name==='sobu'?'sobu-data':name+'-bundle';return JSON.parse(zlib.gunzipSync(m?Buffer.from(m[1],'base64'):Buffer.concat([0,1].map(i=>fs.readFileSync(path.join(root,prefix+'-'+i+'.bin'))))));}
const main=bundle('chuo'),dataScript=[...main.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].startsWith('window.RAIL_DATA='))[1];const c={window:{}};vm.runInNewContext(dataScript,c);const data={main:c.window.RAIL_DATA};for(const id of ['west','ome','okutama','fuji','lake'])data[id]=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'chuo-'+id+'.bin')))).data;
for(const id of Object.keys(K.plans))for(const travel of ['in','out'])test(id+' '+travel+': every leg and boundary validates loaded endpoints and cars',()=>{
 const p=K.parse('?journey='+id+'&travel='+travel);
 for(let leg=0;leg<p.legs.length;leg++){
  const j=K.parse('?journey='+id+'&travel='+travel+'&leg='+leg),d=JSON.parse(JSON.stringify(data[j.segment]));
  if(j.segment==='main'&&['ome','okutama'].includes(id))for(const r of Object.values(d.routes))r.stops=r.stops.filter(s=>Number(s.code.slice(2))<=19);
  assert.equal(K.validateLoaded(j,d).ok,true);
  const b=K.boundary(j);if(!j.hasNext){assert.equal(b,null);continue;}
  assert.equal(b.ok,true);assert.equal(b.from.endStation,b.to.startStation);
  if(b.station==='青梅'){assert.equal(b.type,'transfer');assert.equal(b.automatic,false);assert.notEqual(b.from.cars,b.to.cars);}
  if(b.station==='大月'){assert.equal(b.type,'consist');assert.deepEqual([b.from.cars,b.to.cars],travel==='in'?[4,12]:[12,4]);}
  if(b.station==='富士山')assert.equal(b.type,'reverse');
  d.train.cars=99;assert.equal(K.validateLoaded(j,d).ok,false);
 }
});
test('handoff retains progress, controls and options without double counting the boundary station',()=>{
 const j=K.parse('?journey=kawaguchiko&leg=1&score=100&distance=500&stops=4&missed=1');
 const state={complete:true,mode:'manual',tripMode:'timetable',distance:1200,score:80,visited:[{starting:true},{index:1},{index:2}],missed:[3]};
 const p=K.handoff(j,state,{service:'special',clock:36000,startDistance:200,settings:{view:'map',traffic:'rush',scale:8,quality:2,render:1,sound:0,volume:25}});
 const url=K.url('https://example.test/chuo.html',j,p),next=K.parse(new URL(url).search);
 assert.equal(next.segment,'fuji');assert.equal(next.scoreOffset,180);assert.equal(next.distanceOffset,1500);assert.equal(next.clockOffset,7200);assert.equal(next.stopsOffset,6);assert.equal(next.missedOffset,2);assert.equal(next.service,'local');assert.equal(next.requestedService,'special');assert.equal(next.control,'manual');assert.equal(next.autostart,false);assert.equal(next.view,'map');assert.equal(next.scale,8);assert.equal(next.sound,false);assert.equal(next.volume,25);
 assert.equal(K.handoff(j,{...state,complete:false},{}),null);
 const returning=K.parse('?journey=kawaguchiko&travel=in&leg=1&service=special');assert.equal(returning.service,'local');assert.equal(K.parse(new URL(K.url('https://example.test/chuo.html',returning,{leg:2})).search).service,'special');
});
test('malformed leg/counter parameters stay finite and within the selected plan',()=>{
 for(const leg of ['1.8','-1','NaN','Infinity','99999999']){const j=K.parse('?journey=okutama&leg='+leg+'&clock=Infinity&distance=NaN');assert.ok(Number.isInteger(j.leg));assert.ok(j.segment);assert.ok(Number.isFinite(j.clockOffset));assert.ok(Number.isFinite(j.distanceOffset));}
 const j=K.parse('?journey=unknown');assert.equal(j.id,'takao');assert.equal(j.volume,70);
});
for(const name of ['yamanote','chuo','chuo-local','keihin','sobu'])test(name+': refreshing dashboard preserves signal gap and brake limit',()=>{
 const source=fs.readFileSync(path.join(root,name==='yamanote'?'yamanote/rail.js':'development/signalled-routes/'+name+'/rail.js'),'utf8'),start=source.indexOf('function updateUI(){'),end=source.indexOf('\nfunction mapFrame',start),fn=source.slice(start,end);
 const nodes=new Map();const node=()=>({textContent:'',hidden:false,disabled:false,value:'',style:{setProperty(){}},classList:{toggle(){}},setAttribute(){},querySelector:()=>node(),querySelectorAll:()=>[]});
 const state={next:1,distance:100,speed:2,trafficGap:88,signalLimit:45,signalAspect:'RED',signalDistance:43,notch:0,doors:false,visited:[{index:0,starting:true}],elapsed:2,missed:[],score:0,mode:'auto'};
 const stops=[{name:'A',code:'A',distance:0},{name:'B',code:'B',distance:1000}],C={speedLimit:()=>80,atcLimit:()=>45,clock:()=>28800,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),platformIndex:()=>0};
 const ctx={state,route:{stops},geo:{length:1000},C,window:{RAIL_PREBUILT_MODELS:{stations:[]}},direction:'reverse',selectedStart:0,quality:1,renderQuality:1,service:'special',trafficMode:'rush',J:{distanceOffset:0,leg:0,legs:['main'],stopsOffset:0},updateBoarding(){},updateTimetableUI(){},showBoundary(){},formatClock:()=>'', $:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)}};
 vm.runInNewContext(fn+';updateUI();',ctx);assert.equal(state.trafficGap,88);assert.equal(state.signalLimit,45);
});
test('rebuilt published script syntax and journey handoff UI are present',()=>{
 assert.ok(main.html.includes('id="handoff-note"'));assert.ok(main.html.includes('乗り換えて次の区間へ'));
 for(const name of ['chuo','chuo-local','keihin','sobu'])for(const m of bundle(name).html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});
test('Fujisan switchback joins the same coordinate and height with finite rebuilt track meshes',()=>{
 const a=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'chuo-fuji.bin')))),b=data.lake;
 for(const direction of ['forward','reverse']){
  const r=a.data.routes[direction],s=r.stops.find(s=>s.code==='FJ16'),t=b.routes[direction].stops.find(s=>s.code==='FJ16');assert.ok(Math.hypot((s.lon-t.lon)*90400,(s.lat-t.lat)*111200)<.01);
  let total=0;const cum=[0];for(let i=1;i<r.points.length;i++){const p=r.points[i-1],q=r.points[i];total+=Math.hypot((q[0]-p[0])*111320*Math.cos((p[1]+q[1])*Math.PI/360),(q[1]-p[1])*111320);cum.push(total);}
  for(const st of r.stops)assert.ok(Math.abs(st.distance-cum[st.index])<.01);
  const surface=a.models.groundHeights[direction][s.index]+r.trackOffsets[s.index];assert.ok(Math.abs(surface-857.0719753973052)<.02);
 }
 for(const m of a.models.tracks)for(const group of m.groups){const bytes=Buffer.from(group.positions,'base64'),array=group.positionScale?new Int16Array(bytes.buffer,bytes.byteOffset,bytes.length/2):new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);assert.ok([...array].every(Number.isFinite));assert.equal(array.length/3,group.vertices);}
});
