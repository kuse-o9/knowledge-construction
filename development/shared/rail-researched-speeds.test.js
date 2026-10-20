'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),zlib=require('zlib');
const root=path.resolve(__dirname,'../..');
const code=fs.readFileSync(path.join(root,'yamanote/rail-core.js'),'utf8');
function profile(name,id,names){const c=vm.createContext({});vm.runInContext(code,c);const r={stops:names.map((name,i)=>({name,code:String(i),distance:i*1000})),points:[[139,35],[140,35]]};c.BaylineRouteProfile.profile(r,{name,id});return {r,c};}
test('Negishi changes 90/95 at Sakuragicho in the departing direction',()=>{
 const stations=['大宮','横浜','桜木町','関内','大船'];
 for(const names of [stations,stations.slice().reverse()]){const {r,c}=profile('京浜東北・根岸線','keihin',names),a=names.indexOf('桜木町'),end=names.indexOf('大船');for(let i=0;i<names.length-1;i++){const expected=end>a?(i>=a?95:90):(i<a?95:90);assert.equal(c.BaylineRouteProfile.section({route:r,length:4000},i*1000+1),expected);}}
});
test('Ome/Okutama and Fuji/Lake use their own researched maxima even under the Chuo name',()=>{
 for(const [id,expected] of [['ome',85],['okutama',85],['fuji',70],['lake',70],['west',100]]){const {r}=profile('中央線快速・直通区間','chuo-extension-'+id+'-20261015',['始点','終点']);assert.equal(r.gameMaximum,expected);}
});
test('neighbour corridor speed follows the neighbour, not the player line',()=>{
 const packet=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'shared/neighbour-corridors.bin'))));
 const c=vm.createContext({RAIL_DATA:{name:'総武線快速',id:'sobu'}});vm.runInContext(code,c);
 for(const other of packet.corridors)for(const r of Object.values(other.routes)){assert.ok(r.lineName);assert.equal(r.lineId,other.dataId);delete r.stationSpeeds;c.RailCore.geometry(r);if(other.id==='yamanote')assert.equal(r.gameMaximum,90);if(other.id==='chuo')assert.equal(r.gameMaximum,100);if(other.id==='chuo-local')assert.equal(r.gameMaximum,95);}
});
test('packed game cores preserve timetable, recovery and research changes',()=>{
 for(const name of ['chuo','chuo-local','keihin','sobu']){const prefix=name==='sobu'?'sobu-data':name+'-bundle',html=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1].map(i=>fs.readFileSync(path.join(root,prefix+'-'+i+'.bin')))))).html;const core=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function atcLimit'));assert.ok(core.includes('function configureTrip'));assert.ok(core.includes('maximum=70'));assert.ok(core.includes('route.lineName'));const c=vm.createContext({});vm.runInContext(core,c);assert.equal(typeof c.RailCore.configureTrip,'function');assert.equal(typeof c.RailCore.clock,'function');}
});
test('announcement cleanup and bilingual transfer additions reach release packets',()=>{
 const prefix='keihin-bundle',html=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1].map(i=>fs.readFileSync(path.join(root,prefix+'-'+i+'.bin')))))).html;
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.startsWith('window.RAIL_ANNOUNCEMENTS='));assert.ok(!/スポンサーリンク|関連記事|セリフまとめ|大宮→大/.test(script));const c=vm.createContext({window:{}});vm.runInContext(script,c);for(const a of Object.values(c.window.RAIL_ANNOUNCEMENTS)){for(const k of ['JK43','JK46']){const text=a.arrival[k].map(e=>e.text).join(' ');assert.ok(text.includes('高崎線'));assert.ok(text.includes('Takasaki Line'));}assert.ok(a.arrival.JK43.some(e=>e.text.includes('Shonan-Shinjuku')));}
});
test('timetable departures close early in manual and auto mode without advancing the clock',()=>{
 for(const name of ['chuo','chuo-local','keihin','sobu']){const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'development/signalled-routes',name,'rail-core.js'),'utf8'),c);const C=c.RailCore,route={points:[[139,35],[139.02,35]],stops:[{code:'A',name:'始点',distance:0},{code:'B',name:'途中',distance:1000},{code:'C',name:'終点',distance:1800}],stationSpeeds:[{distance:0,limit:90}]},geo=C.geometry(route);
 for(const mode of ['manual','auto']){const s=C.create(route,0,mode);s.tripMode='timetable';s.schedule={offset:0,stops:[{arrival:28800,departure:29000},{arrival:29100,departure:29200},{arrival:29300,departure:null}]};s.running=true;s.dwell=4.5;s.elapsed=5;assert.ok(C.clock(s)<s.schedule.stops[0].departure);assert.equal(C.canDepart(s),true);const before=C.clock(s);assert.equal(C.closeDoors(s,geo),true);assert.equal(C.clock(s),before);assert.equal(s.schedule.offset,0);assert.equal(s.doors,false);
 Object.assign(s,{next:1,distance:1000,doors:true,startingDoors:false,dwell:4.5,elapsed:50,visited:[{index:0},{index:1}]});assert.equal(C.closeDoors(s,geo),true);assert.equal(s.next,2);assert.equal(s.schedule.offset,0);
 const held=C.create(route,0,mode);held.running=true;held.externalDoorControl=true;held.departureHold=true;held.dwell=4.5;for(let i=0;i<100;i++)C.step(held,geo,.1);assert.equal(held.doors,true);assert.equal(held.distance,0);assert.equal(C.atcLimit(held,geo),0);
 }
 }
});
