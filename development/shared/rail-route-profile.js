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
