/* Journey setup precedes the scene. Loaded data is checked before driving. */
(()=>{'use strict';const K=window.BaylineJourneyCore,J=K.parse(location.search),E=window.__BAYLINE_EXTENSION;
if(J.segment!=='main'){if(!E||E.segment!==J.segment)throw Error('直通区間のデータがありません');window.RAIL_DATA=E.data;window.RAIL_PREBUILT_MODELS={...window.RAIL_PREBUILT_MODELS,...E.models};window.RAIL_CITY_MODELS=E.city;window.RAIL_ANNOUNCEMENTS=E.announcements;window.__BAYLINE_EXTENSION=null;}
const D=window.RAIL_DATA;if(J.segment==='main'&&['ome','okutama'].includes(J.id))for(const [key,r]of Object.entries(D.routes)){r.stops=r.stops.filter(s=>Number(s.code.slice(2))<=19);r.label=key==='reverse'?'本線・東京 → 立川':'本線・立川 → 東京';}
const valid=K.validateLoaded(J,D);if(!valid.ok)throw Error(valid.problems.join(' ／ '));
J.boundary=K.boundary(J);J.url=changes=>K.url(location.href,J,changes);
const C=window.RailCore,configure=C.configureTrip,clock=C.clock;C.configureTrip=(s,g,kind,start)=>{const out=configure(s,g,kind,start);if(J.clockOffset&&out.schedule){out.schedule.offset=J.clockOffset;for(const v of out.schedule.stops)for(const key of ['arrival','departure'])if(v[key]!==null)v[key]+=J.clockOffset;}return out;};C.clock=s=>clock(s)+(s.schedule?0:J.clockOffset);
window.BAYLINE_JOURNEY=J;
const select=document.getElementById('journey');select.value=J.id;select.onchange=()=>location.assign(J.url({journey:select.value,travel:'out',leg:0}));
const spec=K.spec(J,J.segment),status=document.getElementById('journey-status');status.textContent=spec.operator+' ／ '+J.destination+'方面 ／ 区間 '+(J.leg+1)+'/'+J.legs.length+' ／ '+D.routes[J.direction].label+' ／ E233系 '+D.train.cars+'両'+(J.service==='local'?' ／ この区間は各駅停車':'');
const services=document.getElementById('service');if(J.service==='local'){services.replaceChildren();const o=document.createElement('option');o.value='local';o.textContent='各駅停車';services.append(o);services.value='local';services.disabled=true;}else document.getElementById('special-option').textContent=['ome','okutama'].includes(J.id)?'青梅特快（ゲーム用）':'中央特快';
const a=document.getElementById('next-section');a.hidden=!J.hasNext;
// A continuation URL is consumed once; reloading then restores this leg's save.
if(J.fresh||J.autostart){const u=new URL(location.href);u.searchParams.delete('fresh');u.searchParams.delete('autostart');history.replaceState(null,'',u.href);}
})();
