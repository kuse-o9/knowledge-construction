/* Station-boundary game speeds. Curve geometry never imposes a speed limit. */
(function(g){'use strict';
function profile(route,data){
 const name=data?.name||'',id=data?.id||'';
 let maximum=/中央線快速/.test(name)?100:/総武線快速/.test(name)?120:/中央・総武/.test(name)?95:90;
 // Extension speeds are game settings until individual operating limits are sourced.
 if(/okutama|fuji|lake/.test(id))maximum=65;
 else if(/ome/.test(id))maximum=85;
 route.gameMaximum=maximum;
 route.physicalStops=route.physicalStops||route.stops;
 route.stationSpeeds=route.physicalStops.map((s,i,a)=>{
  let limit=maximum;
  if(/総武線快速/.test(name)){
   const kin=a.findIndex(x=>x.name==='錦糸町'),tokyo=a.findIndex(x=>x.name==='東京');
   // Limits describe the section departing this station in this direction.
   if(kin>=0&&tokyo>=0&&(tokyo<kin?i<kin:i>=kin))limit=100;
  }
  return {code:s.code,distance:s.distance,limit};
 });
 return route;
}
function section(geo,d){
 const r=geo.route,list=r.stationSpeeds||[];
 d=r.loop?((d%geo.length)+geo.length)%geo.length:Math.max(0,Math.min(geo.length,d));
 let current=list[0];for(const item of list){if(item.distance>d)break;current=item;}
 return current?.limit||r.gameMaximum||80;
}
// Look ahead only to lower *station* limits, without changing the displayed section limit.
function approach(geo,d){
 let limit=section(geo,d);
 for(const s of geo.route.stationSpeeds||[]){const gap=s.distance-d;if(gap>0&&gap<1800&&s.limit<limit)limit=Math.min(limit,Math.sqrt((s.limit/3.6)**2+1.4*gap)*3.6);}
 return limit;
}
function stations(route){const stopping=new Set(route.stops.map(s=>s.code));return (route.physicalStops||route.stops).map(s=>({...s,pass:!stopping.has(s.code)}));}
g.BaylineRouteProfile={profile,section,approach,stations};
})(typeof globalThis==='object'?globalThis:window);

/* BAYLINE simulation core. No rendering, network requests or paid services. */
(function(g){'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function distance(a,b){return Math.hypot((b[0]-a[0])*111320*Math.cos((a[1]+b[1])*Math.PI/360),(b[1]-a[1])*111320);}
function geometry(route){if(!route.stationSpeeds)g.BaylineRouteProfile.profile(route,g.RAIL_DATA||g.window?.RAIL_DATA);const cumulative=[0];for(let i=1;i<route.points.length;i++)cumulative.push(cumulative[i-1]+distance(route.points[i-1],route.points[i]));return {route,cumulative,length:cumulative.at(-1)};}
function rawPosition(geo,d){d=geo.route.loop?((d%geo.length)+geo.length)%geo.length:clamp(d,0,geo.length);let lo=0,hi=geo.cumulative.length-1;while(lo+1<hi){let mid=(lo+hi)>>1;if(geo.cumulative[mid]<=d)lo=mid;else hi=mid;}const a=geo.route.points[lo],b=geo.route.points[hi],t=(d-geo.cumulative[lo])/(geo.cumulative[hi]-geo.cumulative[lo]||1);const lon=a[0]+(b[0]-a[0])*t,lat=a[1]+(b[1]-a[1])*t;return {lon,lat,height:geo.elevations?geo.elevations[lo]+(geo.elevations[hi]-geo.elevations[lo])*t:heightAt(lon,lat),heading:Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])};}
function position(geo,d){const p=rawPosition(geo,d),a=rawPosition(geo,d-10),b=rawPosition(geo,d+10);if(a.lon!==b.lon||a.lat!==b.lat)p.heading=Math.atan2((b.lon-a.lon)*Math.cos(p.lat*Math.PI/180),b.lat-a.lat);return p;}
function heightAt(){return 5;}
function applyElevation(geo,groundHeights){if(!Array.isArray(groundHeights)||groundHeights.length!==geo.route.points.length||!groundHeights.every(h=>Number.isFinite(h)&&h>-500&&h<10000))throw new Error('地形の高さを取得できませんでした。');geo.groundHeights=groundHeights.slice();geo.elevations=groundHeights.map((h,i)=>h+(geo.route.trackOffsets?.[i]??heightAt(...geo.route.points[i])));return geo;}
function sampleDistances(geo,spacing=4){const ds=[0];for(let i=1;i<geo.cumulative.length;i++){const a=geo.cumulative[i-1],b=geo.cumulative[i],steps=Math.max(1,Math.ceil((b-a)/spacing));for(let n=1;n<=steps;n++)ds.push(a+(b-a)*n/steps);}return ds;}
function speedLimit(geo,d){return g.BaylineRouteProfile.section(geo,d);}
function approachLimit(geo,d){return g.BaylineRouteProfile.approach(geo,d);}
function atcLimit(state,geo){if(state.doors||state.departureHold||state.complete)return 0;const remain=(geo.route.stops[state.next]?.distance??geo.length)-state.distance;return Math.min(state.signalLimit??Infinity,Number.isFinite(state.trafficGap)?Math.sqrt(1.3*Math.max(0,state.trafficGap-45))*3.6:Infinity,approachLimit(geo,state.distance),Math.sqrt(Math.max(0,2*.85*Math.max(0,remain)))*3.6);}
function loopRoute(base,start=0){const n=clamp(Math.trunc(start),0,base.stops.length-2),pivot=base.stops[n].index;const points=base.points.slice(pivot,-1).concat(base.points.slice(0,pivot+1));const route={...base,points,stops:[],startIndex:n};const geo=geometry(route);for(const stop of base.stops.slice(n,-1).concat(base.stops.slice(0,n))){const index=(stop.index-pivot+base.points.length-1)%(base.points.length-1);route.stops.push({...stop,index,distance:geo.cumulative[index]});}route.stops.push({...route.stops[0],index:points.length-1,distance:geo.length,lapEnd:true});route.length=geo.length;route.physicalStops=route.stops;delete route.stationSpeeds;g.BaylineRouteProfile.profile(route,g.RAIL_DATA||g.window?.RAIL_DATA);if(base.trackOffsets)route.trackOffsets=base.trackOffsets.slice(pivot,-1).concat(base.trackOffsets.slice(0,pivot+1));if(base.groundHeights)route.groundHeights=base.groundHeights.slice(pivot,-1).concat(base.groundHeights.slice(0,pivot+1));return route;}
function create(route,start=0,mode='auto'){const n=clamp(Math.trunc(start),0,route.stops.length-2);return {distance:route.stops[n].distance,speed:0,notch:0,running:false,mode:mode==='manual'?'manual':'auto',doors:false,dwell:0,next:n+1,visited:[{index:n,error:0,starting:true}],missed:[],score:0,complete:false,message:'準備完了。出発しよう。',elapsed:0,overspeed:0,autoTarget:0};}
function step(state,geo,dt){if(!state.running||state.complete||state.departureHold)return;dt=clamp(dt,0,.1);state.elapsed+=dt;const target=geo.route.stops[state.next];if(!target){state.complete=true;state.speed=0;state.running=false;return;}let remain=target.distance-state.distance;
if(state.doors){state.speed=0;state.dwell+=dt;if(state.mode==='auto'&&state.dwell>=8)closeDoors(state,geo);return;}
let acceleration=0;
if(state.mode==='auto'){
 const lim=approachLimit(geo,state.distance)/3.6;const braking=Math.sqrt(Math.max(0,2*.7*Math.max(0,remain-.1)));const desired=Math.min(lim,braking,(state.signalLimit??Infinity)/3.6,Number.isFinite(state.trafficGap)?Math.sqrt(1.3*Math.max(0,state.trafficGap-45)):Infinity);state.autoTarget=desired*3.6;
 acceleration=clamp((desired-state.speed)*1.6,-.9,.7);state.notch=acceleration>.04?3:acceleration<-.04?-4:0;
}else acceleration=state.notch>0?state.notch*.15:state.notch===-8?-1.6:state.notch<0?state.notch*.16:-(.012+state.speed*.0008);
const atc=atcLimit(state,geo)/3.6;state.atcBrake=state.speed>atc+.5;if(state.atcBrake)acceleration=Math.min(acceleration,-1.05);
const old=state.speed;state.speed=clamp(state.speed+acceleration*dt,0,120/3.6);state.distance=clamp(state.distance+(old+state.speed)*.5*dt,0,geo.length);
if(Number.isFinite(state.trafficGap)){const maxAdvance=Math.max(0,state.trafficGap-45);if(state.distance>state._trafficStart+maxAdvance){state.distance=state._trafficStart+maxAdvance;state.speed=0;}}const limit=speedLimit(geo,state.distance);if(state.speed*3.6>limit+2)state.overspeed+=dt;
remain=target.distance-state.distance;
if(state.mode==='auto'&&remain<=.45&&state.speed<.65){state.distance=target.distance;state.speed=0;state.notch=0;openDoors(state,geo);}
else if(state.mode==='manual'&&state.speed<.08&&Math.abs(remain)<=8){state.message=target.name+'に停車。ドアを開けて乗降しよう。';}
else if(remain< -25){state.missed.push(state.next);state.message=target.name+'を通過。次の駅で停車しよう。';state.next++;}
if(state.distance>=geo.length){state.speed=0;state.notch=0;if(state.mode==='manual'&&!state.doors)state.message='終点です。ドアを開けて到着を記録しよう。';}
}
function openDoors(s,geo){const stop=geo.route.stops[s.next];if(!stop||s.doors||s.complete)return false;const error=s.distance-stop.distance;if(s.speed>.12||Math.abs(error)>8){s.message='停止位置から８m以内で完全に止まってからドアを開けよう。';return false;}s.doors=true;s.dwell=0;s.speed=0;s.notch=0;if(!s.visited.some(v=>v.index===s.next)){s.visited.push({index:s.next,error});s.score+=Math.max(20,100-Math.round(Math.abs(error)*10));}s.message=stop.name+'に到着！ 乗降中。';return true;}
function closeDoors(s,geo){if(!s.doors)return false;if(s.dwell<3){s.message='乗降中。あと'+Math.ceil(3-s.dwell)+'秒待とう。';return false;}s.doors=false;s.dwell=0;if(s.next>=geo.route.stops.length-1){s.complete=true;s.running=false;s.speed=0;s.message='山手線を一周！ '+geo.route.stops.at(-1).name+'。運転おつかれさま！';}else{s.next++;s.message='ドアを閉めました。'+geo.route.stops[s.next].name+'へ出発。';}return true;}
function restore(raw,route){if(!raw||raw.version!==1||!raw.state)return null;const s=raw.state,n=route.stops.length;if(!Number.isFinite(s.distance)||s.distance<0||s.distance>route.length+.1||!Number.isFinite(s.speed)||s.speed<0||s.speed>25||!Number.isInteger(s.next)||s.next<1||s.next>=n||!['auto','manual'].includes(s.mode)||!Array.isArray(s.visited)||!Array.isArray(s.missed)||!Number.isFinite(s.elapsed)||s.elapsed<0)return null;if(!s.visited.every(v=>Number.isInteger(v.index)&&v.index>=0&&v.index<n&&Number.isFinite(v.error))||!s.missed.every(v=>Number.isInteger(v)&&v>=0&&v<n))return null;const base=create(route,0,s.mode);return {...base,...s,trafficGap:Infinity,signalLimit:Infinity,signalStop:Infinity,signalAspect:null,notch:0,speed:0,running:false,departureHold:false,doors:!!s.doors,dwell:0,score:Number.isFinite(s.score)?clamp(s.score,0,(n-1)*100):0,complete:!!s.complete,message:'前回の続きです。安全のため停止状態で再開します。'};}
g.RailCore={clamp,distance,geometry,position,heightAt,applyElevation,sampleDistances,speedLimit,approachLimit,atcLimit,loopRoute,create,step,openDoors,closeDoors,restore};
})(typeof globalThis!=='undefined'?globalThis:window);
