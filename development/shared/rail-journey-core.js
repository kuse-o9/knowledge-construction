/* Checked game journeys for the already-built Chuo corridor. */
(function(g){'use strict';
const plans={takao:['main'],otsuki:['main','west'],ome:['main','ome'],kawaguchiko:['main','west','fuji','lake'],okutama:['main','ome','okutama']};
const names={takao:'高尾',otsuki:'大月',ome:'青梅',kawaguchiko:'河口湖',okutama:'奥多摩（青梅乗換）'};
const segments={main:{start:'東京',end:'高尾',cars:12,operator:'JR東日本'},west:{start:'高尾',end:'大月',cars:12,operator:'JR東日本'},ome:{start:'立川',end:'青梅',cars:12,operator:'JR東日本'},okutama:{start:'青梅',end:'奥多摩',cars:4,operator:'JR東日本'},fuji:{start:'大月',end:'富士山',cars:4,operator:'富士山麓電気鉄道'},lake:{start:'富士山',end:'河口湖',cars:4,operator:'富士山麓電気鉄道'}};
const bounded=(value,max,fallback=0)=>Number.isFinite(Number(value))?Math.min(max,Math.max(0,Number(value))):fallback;
const service=v=>['rapid-weekday','rapid-holiday','special'].includes(v)?v:'rapid-weekday';
function parse(search){const q=new URLSearchParams(search),id=Object.hasOwn(plans,q.get('journey'))?q.get('journey'):'takao',travel=q.get('travel')==='in'?'in':'out',legs=travel==='in'?plans[id].slice().reverse():plans[id].slice(),leg=Math.floor(bounded(q.get('leg'),legs.length-1)),segment=legs[leg];
 return {id,travel,legs,leg,segment,direction:travel==='in'?'forward':'reverse',destination:travel==='in'?'東京':names[id],name:names[id],hasNext:leg<legs.length-1,clockOffset:bounded(q.get('clock'),604800),distanceOffset:bounded(q.get('distance'),2000000),scoreOffset:bounded(q.get('score'),1000000),stopsOffset:Math.floor(bounded(q.get('stops'),10000)),missedOffset:Math.floor(bounded(q.get('missed'),10000)),control:q.get('control')==='manual'?'manual':'auto',trip:q.get('trip')==='timetable'?'timetable':'free',requestedService:service(q.get('service')),service:['fuji','lake','okutama'].includes(segment)?'local':service(q.get('service')),autostart:q.get('autostart')==='1',fresh:q.get('fresh')==='1',view:['cab','chase','map'].includes(q.get('view'))?q.get('view'):'cab',traffic:['rush','weekday','holiday'].includes(q.get('traffic'))?q.get('traffic'):'weekday',scale:[1,4,8].includes(Number(q.get('scale')))?Number(q.get('scale')):1,quality:[0,1,2].includes(Number(q.get('quality')))&&q.has('quality')?Number(q.get('quality')):1,render:[.5,.75,1].includes(Number(q.get('render')))?Number(q.get('render')):.75,sound:q.get('sound')!=='0',volume:q.has('volume')?Math.round(bounded(q.get('volume'),100,70)):70};
}
function spec(j,segment){const s={...segments[segment],id:segment,maxCars:segments[segment]?.cars,gaugeMm:1067,power:'game-dc1500',control:'game-E233'};
 if(segment==='main'&&['ome','okutama'].includes(j.id))s.end='立川';
 s.startStation=j.travel==='in'?s.end:s.start;s.endStation=j.travel==='in'?s.start:s.end;
 s.startNode='station:'+s.startStation;s.endNode='station:'+s.endStation;return s;
}
function boundary(j){if(!j.hasNext)return null;const from=spec(j,j.segment),to=spec(j,j.legs[j.leg+1]),station=from.endStation,pair=[j.segment,j.legs[j.leg+1]].sort().join(':');
 const allowed={'main:west':'continue','main:ome':'continue','okutama:ome':'transfer','fuji:west':'consist','fuji:lake':'reverse'};
 const type=allowed[pair];if(!type||station!==to.startStation)return {ok:false,type:'blocked',station,message:'接続区間を確認できないため、出発できません。'};
 const train={cars:to.cars,gaugeMm:1067,supportedPower:['game-dc1500'],supportedControl:['game-E233']};
 const result=g.BaylineThrough.validate(from,to,{allowedOperators:['JR東日本','富士山麓電気鉄道'],allowedPaths:[from.id+'>'+to.id]},train);
 let message=type==='transfer'?station+'で'+to.cars+'両編成へ乗り換えます':type==='consist'?station+'で編成を変更します（'+from.cars+'両 → '+to.cars+'両）':type==='reverse'?station+'で進行方向を変えます':station+'から次の区間へ直通します';
 if(from.operator!==to.operator)message+=' ／ '+from.operator+' → '+to.operator;
 return {ok:result.ok,problems:result.problems,type,station,from,to,message,automatic:type!=='transfer',delay:type==='consist'||type==='reverse'?4500:1200};
}
function validateLoaded(j,data){const expected=spec(j,j.segment),r=data?.routes?.[j.direction],problems=[];
 if(!r?.stops?.length)return {ok:false,problems:['区間データ不足']};
 if(r.stops[0].name!==expected.startStation||r.stops.at(-1).name!==expected.endStation)problems.push('接続駅または運転方向が不一致');
 if(data.train?.cars!==expected.cars)problems.push('区間と編成両数が不一致');
 return {ok:!problems.length,problems};
}
function url(base,j,changes={}){const u=new URL(base);u.search='';const defaults={journey:j.id,travel:j.travel,leg:j.leg,fresh:1,service:j.requestedService,control:j.control,trip:j.trip,view:j.view,traffic:j.traffic,scale:j.scale,quality:j.quality,render:j.render,sound:j.sound?1:0,volume:j.volume};for(const [k,v]of Object.entries({...defaults,...changes}))if(v!==null&&v!==undefined)u.searchParams.set(k,String(v));return u.href;}
function handoff(j,state,options){const b=boundary(j);if(!state.complete||!j.hasNext||!b?.ok)return null;
 return {leg:j.leg+1,service:options.service==='local'?j.requestedService:options.service,trip:state.tripMode,control:state.mode,autostart:state.mode==='auto'?1:0,clock:Math.max(0,options.clock-28800),distance:j.distanceOffset+Math.max(0,state.distance-options.startDistance),score:j.scoreOffset+state.score,stops:j.stopsOffset+state.visited.filter(v=>!v.starting).length,missed:j.missedOffset+state.missed.length,...options.settings};
}
const api={plans,names,segments,parse,spec,boundary,validateLoaded,url,handoff};g.BaylineJourneyCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:window);
