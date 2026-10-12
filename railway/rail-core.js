/* BAYLINE simulation core. No rendering, network requests or paid services. */
(function(g){'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function distance(a,b){return Math.hypot((b[0]-a[0])*111320*Math.cos((a[1]+b[1])*Math.PI/360),(b[1]-a[1])*111320);}
function geometry(route){const cumulative=[0];for(let i=1;i<route.points.length;i++)cumulative.push(cumulative[i-1]+distance(route.points[i-1],route.points[i]));return {route,cumulative,length:cumulative.at(-1)};}
function position(geo,d){d=clamp(d,0,geo.length);let lo=0,hi=geo.cumulative.length-1;while(lo+1<hi){let mid=(lo+hi)>>1;if(geo.cumulative[mid]<=d)lo=mid;else hi=mid;}const a=geo.route.points[lo],b=geo.route.points[hi],t=(d-geo.cumulative[lo])/(geo.cumulative[hi]-geo.cumulative[lo]||1);const lon=a[0]+(b[0]-a[0])*t,lat=a[1]+(b[1]-a[1])*t;return {lon,lat,height:geo.elevations?geo.elevations[lo]+(geo.elevations[hi]-geo.elevations[lo])*t:heightAt(lon,lat),heading:Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])};}
function heightAt(lon,lat){const f=clamp((lon-139.753)/.022,0,1),south=clamp((lat-35.627)/.003,0,1),north=clamp((35.644-lat)/.003,0,1);return 15+33*Math.sin(f*Math.PI)*south*north;}
function applyElevation(geo,groundHeights){if(!Array.isArray(groundHeights)||groundHeights.length!==geo.route.points.length||!groundHeights.every(h=>Number.isFinite(h)&&h>-500&&h<10000))throw new Error('地形の高さを取得できませんでした。');geo.groundHeights=groundHeights.slice();geo.elevations=groundHeights.map((h,i)=>h+heightAt(...geo.route.points[i]));return geo;}
function sampleDistances(geo,spacing=4){const ds=[0];for(let i=1;i<geo.cumulative.length;i++){const a=geo.cumulative[i-1],b=geo.cumulative[i],steps=Math.max(1,Math.ceil((b-a)/spacing));for(let n=1;n<=steps;n++)ds.push(a+(b-a)*n/steps);}return ds;}
function speedLimit(geo,d){const a=position(geo,d+10),b=position(geo,d+65);let angle=Math.abs(a.heading-b.heading);angle=Math.min(angle,2*Math.PI-angle);return angle>.5?30:angle>.25?40:60;}
function create(route,start=0,mode='auto'){const n=clamp(Math.trunc(start),0,route.stops.length-2);return {distance:route.stops[n].distance,speed:0,notch:0,running:false,mode:mode==='manual'?'manual':'auto',doors:false,dwell:0,next:n+1,visited:[{index:n,error:0,starting:true}],missed:[],score:0,complete:false,message:'準備完了。出発しよう。',elapsed:0,overspeed:0,autoTarget:0};}
function step(state,geo,dt){if(!state.running||state.complete||state.departureHold)return;dt=clamp(dt,0,.1);state.elapsed+=dt;const target=geo.route.stops[state.next];if(!target){state.complete=true;state.speed=0;state.running=false;return;}let remain=target.distance-state.distance;
if(state.doors){state.speed=0;state.dwell+=dt;if(state.mode==='auto'&&state.dwell>=8)closeDoors(state,geo);return;}
let acceleration=0;
if(state.mode==='auto'){
 const lim=speedLimit(geo,state.distance)/3.6;const braking=Math.sqrt(Math.max(0,2*.7*Math.max(0,remain-.1)));const desired=Math.min(lim,braking);state.autoTarget=desired*3.6;
 acceleration=clamp((desired-state.speed)*1.6,-.9,.7);state.notch=acceleration>.04?3:acceleration<-.04?-4:0;
}else acceleration=state.notch>0?state.notch*.15:state.notch===-8?-1.6:state.notch<0?state.notch*.16:-(.012+state.speed*.0008);
const old=state.speed;state.speed=clamp(state.speed+acceleration*dt,0,72/3.6);state.distance=clamp(state.distance+(old+state.speed)*.5*dt,0,geo.length);
const limit=speedLimit(geo,state.distance);if(state.speed*3.6>limit+2)state.overspeed+=dt;
remain=target.distance-state.distance;
if(state.mode==='auto'&&remain<=.45&&state.speed<.65){state.distance=target.distance;state.speed=0;state.notch=0;openDoors(state,geo);}
else if(state.mode==='manual'&&state.speed<.08&&Math.abs(remain)<=8){state.message=target.name+'に停車。ドアを開けて乗降しよう。';}
else if(remain< -25){state.missed.push(state.next);state.message=target.name+'を通過。次の駅で停車しよう。';state.next++;}
if(state.distance>=geo.length){state.speed=0;state.notch=0;if(state.mode==='manual'&&!state.doors)state.message='終点です。ドアを開けて到着を記録しよう。';}
}
function openDoors(s,geo){const stop=geo.route.stops[s.next];if(!stop||s.doors||s.complete)return false;const error=s.distance-stop.distance;if(s.speed>.12||Math.abs(error)>8){s.message='停止位置から８m以内で完全に止まってからドアを開けよう。';return false;}s.doors=true;s.dwell=0;s.speed=0;s.notch=0;if(!s.visited.some(v=>v.index===s.next)){s.visited.push({index:s.next,error});s.score+=Math.max(20,100-Math.round(Math.abs(error)*10));}s.message=stop.name+'に到着！ 乗降中。';return true;}
function closeDoors(s,geo){if(!s.doors)return false;if(s.dwell<3){s.message='乗降中。あと'+Math.ceil(3-s.dwell)+'秒待とう。';return false;}s.doors=false;s.dwell=0;if(s.next>=geo.route.stops.length-1){s.complete=true;s.running=false;s.speed=0;s.message='終点 '+geo.route.stops.at(-1).name+'。運転おつかれさま！';}else{s.next++;s.message='ドアを閉めました。'+geo.route.stops[s.next].name+'へ出発。';}return true;}
function restore(raw,route){if(!raw||raw.version!==1||!raw.state)return null;const s=raw.state;if(!Number.isFinite(s.distance)||s.distance<0||s.distance>route.length+.1||!Number.isFinite(s.speed)||s.speed<0||s.speed>20||!Number.isInteger(s.next)||s.next<1||s.next>15||!['auto','manual'].includes(s.mode)||!Array.isArray(s.visited)||!Array.isArray(s.missed)||!Number.isFinite(s.elapsed)||s.elapsed<0)return null;if(!s.visited.every(v=>Number.isInteger(v.index)&&v.index>=0&&v.index<16&&Number.isFinite(v.error))||!s.missed.every(v=>Number.isInteger(v)&&v>=0&&v<16))return null;const base=create(route,0,s.mode);return {...base,...s,notch:0,speed:0,running:false,departureHold:false,doors:!!s.doors,dwell:0,score:Number.isFinite(s.score)?clamp(s.score,0,1500):0,complete:!!s.complete,message:'前回の続きです。安全のため停止状態で再開します。'};}
g.RailCore={clamp,distance,geometry,position,heightAt,applyElevation,sampleDistances,speedLimit,create,step,openDoors,closeDoors,restore};
})(typeof globalThis!=='undefined'?globalThis:window);
