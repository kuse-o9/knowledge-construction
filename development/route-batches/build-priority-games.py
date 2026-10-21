"""Adapt the published Chuo-Sobu game, retaining its controls and scene lifecycle.

These integration builds are development games. Source-specific geometry, stock,
structures and announcements remain subject to the existing release gates.
"""
from pathlib import Path
import copy,gzip,hashlib,json,re,math

ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;DEST=HERE/'batch-001';OUT=DEST/'games';OUT.mkdir(exist_ok=True)
base_bytes=b''.join((ROOT/f'chuo-local-bundle-{i}.bin').read_bytes()for i in [0,1]);html=json.loads(gzip.decompress(base_bytes))['html'];scripts=list(re.finditer(r'<script([^>]*)>(.*?)</script>',html,re.S))
def extract(marker):return json.JSONDecoder().raw_decode(html.split(marker,1)[1])[0]
base_data=extract('window.RAIL_DATA=');base_models=extract('window.RAIL_PREBUILT_MODELS=');city=extract('window.RAIL_CITY_MODELS=')
common={k:base_models[k]for k in ['doorModels','passengerModels','passengerInfo','architectureReplacedColors']};common['city']=city
common['baselineStationPassengerCount']=len(base_models['stations'][0]['passengers'])
def packed(name,data):
 p=OUT/name;p.write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));return hashlib.sha256(p.read_bytes()).hexdigest()
common_sha=packed('common.json.gz',common)
stock=json.loads(gzip.decompress((DEST/'vehicles/e353-draft.json.gz').read_bytes()));stock_sha=packed('e353.json.gz',stock)
runtime=scripts[-1][2]
def replace(old,new):
 global runtime
 if old not in runtime:raise ValueError('Published engine changed; review adapter: '+old[:75])
 runtime=runtime.replace(old,new)
replace("KEY='bayline-chuo-local-v1'","KEY='bayline-'+D.id+'-v1'")
replace('physicalStops:base.stops','physicalStops:base.physicalStops||base.stops')
replace("state=C.configureTrip(C.create(route,selectedStart,mode),geo,tripMode,selectedStart);","state=C.create(route,selectedStart,mode);state.tripMode=tripMode;if(tripMode==='timetable')state.schedule={version:1,offset:route.stops[selectedStart].departure-40-8*3600,start:selectedStart,stops:route.stops.map((s,index)=>({code:s.code,index,arrival:s.arrival,departure:s.departure}))};")
replace('async function hydrateModel(meta){','async function hydrateModel(meta){if(meta.generated)return window.BaylineBatchModels.build(meta);')
replace("let stationEntities=[]","let batchConsist=null,batchTraffic=new Map(),sceneLoading=false,sceneFailure='';let stationEntities=[]")
replace("D.train.cars*20","D.train.totalLength")
replace("function updateTrainVisibility(){","function updateTrainVisibility(){if(batchConsist)batchConsist.setFront(state.distance,view!=='cab');")
begin=runtime.index('function buildRailway(){');end=runtime.index('\nfunction updateCamera',begin)
runtime=runtime[:begin]+'''function buildRailway(){if(!viewer)return;railwayGeneration++;platformOpening=state.doors?1:0;batchConsist?.destroy();for(const item of batchTraffic.values())item.destroy();batchTraffic.clear();batchConsist=window.BaylineTrainScene.mount(viewer,Ces,C,geo,window.BATCH_STOCK,D.train.formation);updateStationWindow(true);updateTrackModels(true);updateMovingModels(true);cityLastPosition=null;updateCity(true);}'''+runtime[end:]
replace('lifted(f,3.0)','lifted(f,D.train.cabHeight)')
replace("const transform=Ces.Transforms.eastNorthUpToFixedFrame(f.center);viewer.camera.lookAtTransform(transform,new Ces.HeadingPitchRange(p.heading+.7,-.35,180));","const centre=surfaceFrame(geo,state.distance-D.train.totalLength/2,10),transform=Ces.Transforms.eastNorthUpToFixedFrame(centre.center);viewer.camera.lookAtTransform(transform,new Ces.HeadingPitchRange(p.heading+.7,-.5,Math.max(180,D.train.totalLength*1.2)));")
replace('alignTerrainResolution(provider,level=13)','alignTerrainResolution(provider,level=14)')
replace('stationPrimitives.push(...loadPassengers(meta))','stationPrimitives.push(...loadPassengers(model))')
replace("o.textContent=stop.code+' '+stop.name","o.textContent=(stop.publicCode?stop.publicCode+' ':'')+stop.name")
replace("code.textContent=stop.code","code.textContent=stop.publicCode||(i<0?'通過':'停車')")
replace("$('next-code').textContent=target.code","$('next-code').textContent=target.publicCode||'LIMITED EXPRESS'")
replace("model.code+' '+model.name","(model.publicCode?model.publicCode+' ':'')+model.name")
replace("viewer.creditDisplay.addStaticCredit(new Ces.Credit(D.terrain.credit,true));","viewer.creditDisplay.addStaticCredit(new Ces.Credit(D.terrain.credit,true));viewer.creditDisplay.addStaticCredit(new Ces.Credit('国土数値情報（鉄道データ）を加工して作成',true));")
replace('async function initialize3D(){if(!window.Cesium)',"function discardScene(){try{batchConsist?.destroy();}catch{}batchConsist=null;for(const item of batchTraffic.values())try{item.destroy();}catch{}batchTraffic.clear();try{window.BaylineNeighbours.dispose(viewer);}catch{}try{window.BaylineTunnels.dispose();}catch{}trackActive.clear();trackFallbackIds.clear();trackDetailPending.clear();trackDetailRetry.clear();renderedStationModels=[];stationWindow='';lastModelLocation=null;stationEntities=[];stationPrimitives=[];doorInstances=[];boardingPeople=[];signalInstances=[];trainInstances=[];cityActive.clear();cityLastPosition=null;}\nasync function initialize3D(){if(sceneLoading||sceneReady)return;if(!window.Cesium)")
replace('try{Ces=window.Cesium;','sceneLoading=true;sceneFailure=\'\';try{Ces=window.Cesium;')
replace("catch(error){sceneReady=false;if(viewer){try{viewer.destroy();}catch{}viewer=null;}setView('map');$('scene-status').textContent='地形や３Dを読み込めません。全線マップで運転できます。';}}","catch(error){sceneFailure=String(error.message||error);sceneReady=false;discardScene();if(viewer){try{viewer.destroy();}catch{}viewer=null;}setView('map');$('scene-status').textContent='地形や３Dを読み込めません。全線マップで運転できます。運転席・車外ボタンで再試行できます。';}finally{sceneLoading=false;}}")
replace('function setView(next){view=next;','function setView(next){view=next;if(next!==\'map\'&&!sceneReady&&!sceneLoading)void initialize3D();')
replace("addEventListener('pagehide',()=>{audioController?.disable();save();});","addEventListener('pagehide',()=>{audioController?.disable();save();sceneReady=false;discardScene();if(viewer){try{viewer.destroy();}catch{}viewer=null;}});addEventListener('pageshow',e=>{if(e.persisted)void initialize3D();});")
replace("audioController.departure(1,","audioController.departure(Number(route.stops[state.visited.at(-1)?.index]?.reportedPlatform)||1,")
replace("'この電車は、中央・総武線各駅停車、'","'この電車は、'+D.name+'、'")
replace("'This is the Chuo-Sobu Line local service train for '","'This is the '+D.englishName+' limited express train for '")
replace("window.BaylineNeighbours.setup(viewer,Ces,C,'chuo-local',","window.BaylineNeighbours.setup(viewer,Ces,C,D.id,")
replace("[-7.5,-2.5,2.5,7.5].map(x=>item.meta.distance-10-car*20+x)","D.train.formation[car].doorCentres.map(x=>item.meta.distance-D.train.formation[car].centreBehindFront+(D.train.formation[car].reverse?-x:x))")
begin=runtime.index('function renderTraffic(){');end=runtime.index('\n// All meshes',begin)
runtime=runtime[:begin]+'''function renderTraffic(){if(!viewer||!sceneReady)return;updateTraffic(0);const own=cartAt(state.distance),visible=traffic.trains.map(t=>({t,d:Ces.Cartesian3.distance(own,cartAt(t.distance,0,routeGeometries[t.direction]))})).filter(x=>x.d<1000&&x.t.distance>D.train.totalLength+1&&x.t.distance<routeGeometries[x.t.direction].length-1).sort((a,b)=>a.d-b.d).slice(0,2),ids=new Set();for(const {t}of visible){const id=t.id||t.direction+':'+t.order;ids.add(id);let consist=batchTraffic.get(id);if(!consist){consist=window.BaylineTrainScene.mount(viewer,Ces,C,routeGeometries[t.direction],window.BATCH_STOCK,D.train.formation);batchTraffic.set(id,consist);}consist.setFront(t.distance,true);}for(const [id,consist]of batchTraffic)if(!ids.has(id)){consist.destroy();batchTraffic.delete(id);}}'''+runtime[end:]
# Use the whole physical inventory in the route panel, while driving uses only stops.
replace("route.stops.forEach((stop,i)=>{const li=document.createElement('li');li.textContent=stop.name+(i===route.stops.length-1?'（終点）':'');", "(route.physicalStops||route.stops).forEach((physical)=>{const i=route.stops.findIndex(s=>s.code===physical.code),stop=i>=0?route.stops[i]:physical;const li=document.createElement('li');li.textContent=stop.name+(i<0?'（通過）':i===route.stops.length-1?'（終点）':'');")
replace("const planned=state.schedule?.stops[i];","const planned=i>=0?state.schedule?.stops[i]:null;")
# Development observability for actual browser tests; no driving bypass or hidden cheat.
replace("previousDoors=state.doors;routeUI();setMode(state.mode);", "window.BaylineGame={get data(){return D;},get route(){return route;},get state(){return state;},get geometry(){return geo;},get viewer(){return viewer;},get sceneReady(){return sceneReady;},get sceneLoading(){return sceneLoading;},get sceneFailure(){return sceneFailure;}};previousDoors=state.doors;routeUI();setMode(state.mode);")
runtime=runtime.replace('#f2cc39','#8066ad')
(OUT/'rail.js').write_text(runtime)
shared=scripts[8][2].replace("(location.pathname.includes('/yamanote/')?'../':'')+'shared/neighbour-corridors.bin?v=profiles1'","'../../../../shared/neighbour-corridors.bin?v=profiles1'")
(OUT/'shared.js').write_text(shared);(OUT/'rail-audio.js').write_text(scripts[4][2]);
shell=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
shell=re.sub(r'href="(?:https://kuse-o9.github.io/knowledge-construction/)?index.html#game-room"','href="../../../../index.html#game-room"',shell)
shell=re.sub(r'href="depot-3d.html"','href="../../../../depot-3d.html"',shell)
shell=shell.replace('中央・総武線各駅停車','__NAME__').replace('全39駅・区間走破','全線・停車駅と通過駅').replace('各駅停車</option>','特急</option>')
shell=shell.replace('三鷹〜千葉','__SCOPE__').replace('三鷹','__END__').replace('千葉','新宿')
shell=shell.replace('E231','E353').replace('E233','E353')
shell=shell.replace('href="chuo.html"','href="../../../../chuo.html"').replace('中央線快速を運転','中央線快速のゲームへ')
shell=shell.replace('https://www.jreast.co.jp/train/local/e231.html','https://www.jreast.co.jp/train/express/azusa_kaiji.html')
shell=re.sub(r'<body\b([^>]*)>',lambda m:m[0]+'<div id="development-banner" style="position:fixed;top:42px;left:18px;right:18px;z-index:9000;padding:7px 12px;background:#f2e6cee8;color:#654c25;font-size:12px;font-weight:700;pointer-events:none" role="status">開発中：線路・ホーム・車両の再現を調整しています。公開版ではありません。</div>',shell,count=1)
shell=shell.replace('</body>','<script src="https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Cesium.js"></script><script src="../engine/rail-core.js"></script><script src="../engine/train-scene.js"></script><script src="shared.js"></script><script src="rail-audio.js"></script><script src="model-builder.js"></script><script src="loader.js"></script></body>')
english={'新宿':'Shinjuku','立川':'Tachikawa','八王子':'Hachioji','甲府':'Kofu','小淵沢':'Kobuchizawa','茅野':'Chino','上諏訪':'Kami-Suwa','岡谷':'Okaya','塩尻':'Shiojiri','松本':'Matsumoto','韮崎':'Nirasaki','大月':'Otsuki','塩山':'Enzan','山梨市':'Yamanashishi','石和温泉':'Isawa-Onsen','竜王':'Ryuo'}
reports=[]
chuo_html=json.loads(gzip.decompress(b''.join((ROOT/f'chuo-bundle-{i}.bin').read_bytes()for i in [0,1])))['html'];chuo_data=json.JSONDecoder().raw_decode(chuo_html.split('window.RAIL_DATA=',1)[1])[0];public_codes={s['name']:s['code']for r in chuo_data['routes'].values()for s in r['stops']}
for key,title,destination in [('azusa','特急あずさ','松本'),('kaiji','特急かいじ','竜王')]:
 alignment=json.loads(gzip.decompress((DEST/'alignments'/(key+'.json.gz')).read_bytes()));data={**base_data,'id':key+'-development','name':title,'englishName':key.capitalize(),'routes':{},'sourceNote':'開発中。国土数値情報の線形を加工。駅の配線・ホーム寸法・地上構造物・レール高度・車両寸法・他社列車は確認中。正式版ではありません。','serviceSources':[],'releaseReady':False}
 data['license']='PDL1.0 (processed MLIT N02) / ODbL-1.0 (retained city data)'
 formation=[];behind=0
 for i in range(9):
  pitch=21.3 if i in [0,8] else 20.5;front=11.05 if i==0 else 10.25
  formation.append({'model':'trainHead'if i==0 else'trainTail'if i==8 else'train','reverse':i==8,'pitch':pitch,'frontExtent':front,'centreBehindFront':behind+front,'bogieHalfSpan':6.9,'doorCentres':[-8.65]if i in [0,8]else[-8.65,8.65],'pantograph':i in [1,5]});behind+=pitch
 data['train']={'cars':9,'length':20.5,'width':2.92,'totalLength':behind,'cabHeight':3.55,'formation':formation,'verified':False}
 for direction in ['forward','reverse']:
  service=json.loads((DEST/'services'/(key+'-'+direction+'.json')).read_text());reverse=direction=='reverse';points=list(reversed(alignment['points']))if reverse else alignment['points'];heights=list(reversed(alignment['groundHeights']))if reverse else alignment['groundHeights'];points=copy.deepcopy(points)
  # Left-hand running: separate both travel directions consistently using one source.
  shifted=[]
  for i,p in enumerate(points):
   a,b=points[max(0,i-1)],points[min(len(points)-1,i+1)];x=(b[0]-a[0])*111320*math.cos(math.radians(p[1]));y=(b[1]-a[1])*111320;l=math.hypot(x,y) or 1;shifted.append([p[0]-y/l*1.85/(111320*math.cos(math.radians(p[1]))),p[1]+x/l*1.85/111320])
  cumulative=[0]
  for a,b in zip(shifted,shifted[1:]):cumulative.append(cumulative[-1]+math.hypot((b[0]-a[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(b[1]-a[1])*111320))
  physical=[]
  for s in (list(reversed(alignment['physicalStops']))if reverse else alignment['physicalStops']):
   i=len(points)-1-s['index']if reverse else s['index'];physical.append({**s,'index':i,'distance':cumulative[i]+110,'platformCenterDistance':cumulative[i],'lon':shifted[i][0],'lat':shifted[i][1],'english':english.get(s['name'],''),'publicCode':public_codes.get(s['name'],''),'platformGeometryVerified':False})
  by_code={s['code']:s for s in physical};stops=[{**by_code[s['sourceCode']],**{k:s[k]for k in ['arrival','departure','reportedPlatform']}}for s in service['stops']]
  route={'label':service['name']+' ／ '+stops[0]['name']+' → '+stops[-1]['name'],'points':shifted,'groundHeights':heights,'trackOffsets':[.8]*len(points),'stops':stops,'physicalStops':physical,'length':cumulative[-1],'loop':False,'vehicleMaximum':130,'stationSpeeds':[{'code':s['code'],'distance':s['distance'],'limit':100}for s in physical],'gameMaximum':100,'operatingSpeedVerified':False,'prototypeLimitsNote':'100 km/h diagnostic limits; not the researched release profile'}
  data['routes'][direction]=route;data['serviceSources'].append(service['source'])
 announcements={}
 for direction,r in data['routes'].items():
  groups={k:{}for k in ['next','arrival','arrived','temporary']}
  for s in r['stops']:
   groups['next'][s['code']]=[{'text':'次は、'+s['name']+'です。','lang':'ja-JP'},{'text':'The next stop is '+s['english']+'.','lang':'en-US'}];groups['arrival'][s['code']]=[{'text':'まもなく、'+s['name']+'です。','lang':'ja-JP'},{'text':'We will soon arrive at '+s['english']+'.','lang':'en-US'}];groups['arrived'][s['code']]=[{'text':s['name']+'です。','lang':'ja-JP'},{'text':'This is '+s['english']+'.','lang':'en-US'}]
  announcements[direction]=groups
 payload={'data':data,'announcements':announcements,'commonSha256':common_sha,'stockSha256':stock_sha,'stage':'integrated-development-game','releaseReady':False};sha=packed(key+'.json.gz',payload)
 page=shell.replace('__NAME__',title).replace('__SCOPE__','新宿〜'+destination).replace('__END__',destination);page=page.replace('東行 ／ '+destination+' → 新宿','上り ／ '+destination+' → 新宿').replace('西行 ／ 新宿 → '+destination,'下り ／ 新宿 → '+destination)
 page=re.sub(r'<body\b([^>]*)>',lambda m:'<body'+m[1]+' data-packet-sha="'+sha+'">',page,count=1).replace('全39駅','全'+str(len(data['routes']['forward']['physicalStops']))+'駅')
 (OUT/(key+'.html')).write_text(page)
 reports.append({'id':key,'entry':'games/'+key+'.html','packet':'games/'+key+'.json.gz','sha256':sha,'directions':2,'physicalStations':len(data['routes']['forward']['physicalStops']),'releaseReady':False})
(OUT/'build-report.json').write_text(json.dumps({'base':'chuo-local-bundle-0.bin + chuo-local-bundle-1.bin','baseSha256':hashlib.sha256(base_bytes).hexdigest(),'retainedFeatures':['Published layout and controls','Manual and automatic driving','Starting station and both directions','Stop/pass inventory','Free/timetable modes and early departure','Cab/chase/map cameras','Keyboard and touch controls','Door/boarding lifecycle','Audio/volume/horn and text announcements','Local save/restore','Settings, help, mobile layout, renderer fallback','Traffic/signals and original neighbour adapter'],'developmentOnly':True,'games':reports},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(reports,ensure_ascii=False))
