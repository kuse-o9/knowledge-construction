"""Adapt the published Chuo-Sobu game, retaining its controls and scene lifecycle.

These integration builds are development games. Source-specific geometry, stock,
structures and announcements remain subject to the existing release gates.
"""
from pathlib import Path
import copy,gzip,hashlib,json,re,math,bisect,importlib.util

ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;DEST=HERE/'batch-001';OUT=DEST/'games';OUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('platform_selection',HERE/'platform-selection.py');platform_selection=importlib.util.module_from_spec(spec);spec.loader.exec_module(platform_selection)
spec=importlib.util.spec_from_file_location('terminal_alignment',HERE/'terminal-alignment.py');terminal_alignment=importlib.util.module_from_spec(spec);spec.loader.exec_module(terminal_alignment)
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
runtime+="\nfunction formationFor(key){return window.RAIL_DATA.train.formations[key]||window.RAIL_DATA.train.formation;}\n"
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
replace('if(state.running&&!state.complete&&!document.hidden)T.step(traffic,routeGeometries,dt,p);','window.BaylineTerminals.update(traffic,routeGeometries,p);if(state.running&&!state.complete&&!document.hidden)T.step(traffic,routeGeometries,dt,p);')
begin=runtime.index('function buildRailway(){');end=runtime.index('\nfunction updateCamera',begin)
runtime=runtime[:begin]+'''function buildRailway(){if(!viewer)return;railwayGeneration++;platformOpening=state.doors?1:0;batchConsist?.destroy();for(const item of batchTraffic.values())item.destroy();batchTraffic.clear();batchConsist=window.BaylineTrainScene.mount(viewer,Ces,C,geo,window.BATCH_STOCK,formationFor(direction));updateStationWindow(true);updateTrackModels(true);updateMovingModels(true);cityLastPosition=null;updateCity(true);}'''+runtime[end:]
replace('lifted(f,3.0)','lifted(f,D.train.cabHeight)')
replace("const transform=Ces.Transforms.eastNorthUpToFixedFrame(f.center);viewer.camera.lookAtTransform(transform,new Ces.HeadingPitchRange(p.heading+.7,-.35,180));","const centre=surfaceFrame(geo,state.distance-D.train.totalLength/2,10),transform=Ces.Transforms.eastNorthUpToFixedFrame(centre.center);viewer.camera.lookAtTransform(transform,new Ces.HeadingPitchRange(p.heading+.7,-.5,Math.max(180,D.train.totalLength*1.2)));")
replace("viewer.scene.renderError.addEventListener(()=>{sceneReady=false;", "viewer.scene.renderError.addEventListener((scene,error)=>{sceneFailure=String(error?.stack||error);sceneReady=false;")
replace('alignTerrainResolution(provider,level=13)','alignTerrainResolution(provider,level=14)')
# Regional imagery must be an overlay: Cesium 1.117 base-layer edge stretching can produce an undefined intersection after underground camera travel.
replace("viewer.imageryLayers.addImageryProvider(new Ces.UrlTemplateImageryProvider(","viewer.imageryLayers.addImageryProvider(await Ces.SingleTileImageryProvider.fromUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQDkoFAAFeANMvysHcAAAAAElFTkSuQmCC'));viewer.imageryLayers.addImageryProvider(new Ces.UrlTemplateImageryProvider(")

replace('stationPrimitives.push(...loadPassengers(meta))','stationPrimitives.push(...loadPassengers(model))')
# Both directional models retain passengers; draw the shared physical platforms once.
replace('stationPrimitives.push(...loadModel(stationModel,Ces.Matrix4.fromTranslation(new Ces.Cartesian3(...model.origin))));','if(!model.terminalLayout||meta.direction===direction)stationPrimitives.push(...loadModel(stationModel,Ces.Matrix4.fromTranslation(new Ces.Cartesian3(...model.origin))));')
replace('s.direction===direction&&Math.hypot',"(s.direction===direction||s.platformLine!=='chuo-sobu-local')&&Math.hypot")
replace("o.textContent=stop.code+' '+stop.name","o.textContent=(stop.publicCode?stop.publicCode+' ':'')+stop.name")
replace("code.textContent=stop.code","code.textContent=stop.publicCode||(i<0?'通過':'停車')")
replace("$('next-code').textContent=target.code","$('next-code').textContent=target.publicCode||'LIMITED EXPRESS'")
replace("model.code+' '+model.name","(model.publicCode?model.publicCode+' ':'')+model.name")
replace("viewer.creditDisplay.addStaticCredit(new Ces.Credit(D.terrain.credit,true));","viewer.creditDisplay.addStaticCredit(new Ces.Credit(D.terrain.credit,true));viewer.creditDisplay.addStaticCredit(new Ces.Credit('国土数値情報（鉄道データ）を加工して作成',true));")
replace('async function initialize3D(){if(!window.Cesium)',"function discardScene(){try{batchConsist?.destroy();}catch{}batchConsist=null;for(const item of batchTraffic.values())try{item.destroy();}catch{}batchTraffic.clear();try{window.BaylineNeighbours.dispose(viewer);}catch{}try{window.BaylineTunnels.dispose();}catch{}trackActive.clear();trackFallbackIds.clear();trackDetailPending.clear();trackDetailRetry.clear();renderedStationModels=[];stationWindow='';lastModelLocation=null;stationEntities=[];stationPrimitives=[];doorInstances=[];boardingPeople=[];signalInstances=[];trainInstances=[];cityActive.clear();cityLastPosition=null;}\nasync function initialize3D(){if(sceneLoading||sceneReady)return;if(!window.Cesium)")
replace('try{Ces=window.Cesium;','sceneLoading=true;sceneFailure=\'\';try{Ces=window.Cesium;')
replace("catch(error){sceneReady=false;if(viewer){try{viewer.destroy();}catch{}viewer=null;}setView('map');$('scene-status').textContent='地形や３Dを読み込めません。全線マップで運転できます。';}}","catch(error){sceneFailure=String(error.message||error);sceneReady=false;discardScene();if(viewer){try{viewer.destroy();}catch{}viewer=null;}setView('map');$('scene-status').textContent='地形や３Dを読み込めません。全線マップで運転できます。運転席・車外ボタンで再試行できます。';}finally{sceneLoading=false;}}")
replace('function setView(next){view=next;','function setView(next){view=next;if(next!==\'map\'&&!sceneReady&&!sceneLoading)void initialize3D();')
replace("viewer=new Ces.Viewer('cesium',", "viewer=window.BaylineSceneStart.create(Ces,'cesium',")
replace("$('scene-status').textContent='地形や３Dを読み込めません。全線マップで運転できます。運転席・車外ボタンで再試行できます。';", "window.BaylineSceneStart.failure(error,()=>{state.running=false;audioController?.cancel();save();});")
replace("$('scene-status').textContent='３D描画を続けられないため全線マップへ切り替えました。';", "window.BaylineSceneStart.failure(error,()=>{state.running=false;audioController?.cancel();save();});")
replace("addEventListener('pagehide',()=>{audioController?.disable();save();});","addEventListener('pagehide',()=>{audioController?.disable();save();sceneReady=false;discardScene();if(viewer){try{viewer.destroy();}catch{}viewer=null;}});addEventListener('pageshow',e=>{if(e.persisted)void initialize3D();});")
replace("audioController.departure(1,","audioController.departure(route.stops[state.visited.at(-1)?.index]?.reportedPlatform??null,")
replace("'この電車は、中央・総武線各駅停車、'","'この電車は、'+D.name+'、'")
replace("'This is the Chuo-Sobu Line local service train for '","'This is the '+D.englishName+' limited express train for '")
replace("window.BaylineNeighbours.setup(viewer,Ces,C,'chuo-local',","window.BaylineNeighbours.setup(viewer,Ces,C,D.id,")
replace("[-7.5,-2.5,2.5,7.5].map(x=>item.meta.distance-10-car*20+x)","formationFor(direction)[car].doorCentres.map(x=>item.meta.distance-formationFor(direction)[car].centreBehindFront+(formationFor(direction)[car].reverse?-x:x))")
begin=runtime.index('function renderTraffic(){');end=runtime.index('\n// All meshes',begin)
runtime=runtime[:begin]+'''function renderTraffic(){if(!viewer||!sceneReady)return;updateTraffic(0);const own=cartAt(state.distance),visible=traffic.trains.map(t=>({t,d:Ces.Cartesian3.distance(own,cartAt(t.distance,0,routeGeometries[t.direction]))})).filter(x=>x.d<1000&&x.t.distance>D.train.totalLength+1&&x.t.distance<routeGeometries[x.t.direction].length-1).sort((a,b)=>a.d-b.d).slice(0,2),ids=new Set();for(const {t}of visible){const id=t.id||t.direction+':'+t.order;ids.add(id);let consist=batchTraffic.get(id);if(!consist){consist=window.BaylineTrainScene.mount(viewer,Ces,C,routeGeometries[t.direction],window.BATCH_STOCK,formationFor(t.direction));batchTraffic.set(id,consist);}consist.setFront(t.distance,true);}for(const [id,consist]of batchTraffic)if(!ids.has(id)){consist.destroy();batchTraffic.delete(id);}}'''+runtime[end:]
# Use the whole physical inventory in the route panel, while driving uses only stops.
replace("route.stops.forEach((stop,i)=>{const li=document.createElement('li');li.textContent=stop.name+(i===route.stops.length-1?'（終点）':'');", "(route.physicalStops||route.stops).forEach((physical)=>{const i=route.stops.findIndex(s=>s.code===physical.code),stop=i>=0?route.stops[i]:physical;const li=document.createElement('li');li.textContent=stop.name+(i<0?'（通過）':i===route.stops.length-1?'（終点）':'');")
replace("const planned=state.schedule?.stops[i];","const planned=i>=0?state.schedule?.stops[i]:null;")
# Development observability for actual browser tests; no driving bypass or hidden cheat.
replace("previousDoors=state.doors;routeUI();setMode(state.mode);", "window.BaylineGame={get data(){return D;},get route(){return route;},get state(){return state;},get geometry(){return geo;},get viewer(){return viewer;},get sceneReady(){return sceneReady;},get sceneLoading(){return sceneLoading;},get sceneFailure(){return sceneFailure;}};previousDoors=state.doors;routeUI();setMode(state.mode);")
runtime=runtime.replace('#f2cc39','#8066ad')
(OUT/'rail.js').write_text(runtime)
shared=scripts[8][2].replace("(location.pathname.includes('/yamanote/')?'../':'')+'shared/neighbour-corridors.bin?v=profiles1'","'../../../../shared/neighbour-corridors.bin?v=profiles1'")
shared=shared[:shared.index('/* Terrain openings')]+(HERE/'tunnel-runtime.js').read_text()+shared[shared.index('/* Existing Tachikawa branch'):];shared=shared.replace(" if(g.BaylineJunctions&&!g.BaylineJunctions.allowed(traffic,geo,index,exclude||'player'))return 'RED';"," if(g.BaylineTerminals&&!g.BaylineTerminals.allowed(traffic,geo,index,exclude||'player'))return 'RED';\n if(g.BaylineJunctions&&!g.BaylineJunctions.allowed(traffic,geo,index,exclude||'player'))return 'RED';");shared=shared.replace(' const current=S.blockAt(blocks,Math.min(L,Math.max(0,d)));'," const terminalStop=g.BaylineTerminals?.stopDistance(geo,traffic,train)??Infinity;if(terminalStop<stop){stop=terminalStop;if(!next||terminalStop<next.distance)next={index:-1,distance:terminalStop,aspect:'RED'};}\n const current=S.blockAt(blocks,Math.min(L,Math.max(0,d)));");shared=shared.replace('if(!blocked){train.distance=start;',"if(!blocked&&!g.BaylineTerminals.spawnBlocked(snapshot,geos,train,candidate,player)){train.distance=start;");shared+='\n'+(HERE/'terminal-runtime.js').read_text();(OUT/'shared.js').write_text(shared)
audio=scripts[4][2]
old="platform+'番線、ドアが閉まります。ご注意ください。'"
if old not in audio:raise ValueError('Departure wording adapter changed')
(OUT/'rail-audio.js').write_text(audio.replace(old,"(platform!=null?platform+'番線、':'')+'ドアが閉まります。ご注意ください。'"))
shell=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
shell=shell.replace('</head>','<style>.cab-app:has(#view-chase[aria-pressed="true"]) .wiper,.cab-app:has(#view-map[aria-pressed="true"]) .wiper{visibility:hidden}</style></head>')
shell=re.sub(r'href="(?:https://kuse-o9.github.io/knowledge-construction/)?index.html#game-room"','href="../../../../index.html#game-room"',shell)
shell=re.sub(r'href="depot-3d.html"','href="../../../../depot-3d.html"',shell)
shell=shell.replace('中央・総武線各駅停車','__NAME__').replace('全39駅・区間走破','全線・停車駅と通過駅').replace('各駅停車</option>','特急</option>')
shell=shell.replace('三鷹〜千葉','__SCOPE__').replace('三鷹','__END__').replace('千葉','新宿')
shell=shell.replace('E231','E353').replace('E233','E353')
shell=shell.replace('href="chuo.html"','href="../../../../chuo.html"').replace('中央線快速を運転','中央線快速のゲームへ')
shell=shell.replace('https://www.jreast.co.jp/train/local/e231.html','https://www.jreast.co.jp/train/express/azusa_kaiji.html')
shell=re.sub(r'<body\b([^>]*)>',lambda m:m[0]+'<div id="development-banner" style="position:fixed;top:42px;left:18px;right:18px;z-index:9000;padding:7px 12px;background:#f2e6cee8;color:#654c25;font-size:12px;font-weight:700;pointer-events:none" role="status">開発中：線路・ホーム・車両の再現を調整しています。公開版ではありません。</div>',shell,count=1)
shell=shell.replace('</body>','<script src="https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Cesium.js"></script><script src="scene-start.js"></script><script src="../engine/rail-core.js"></script><script src="../engine/train-scene.js"></script><script src="shared.js"></script><script src="rail-audio.js"></script><script src="model-builder.js"></script><script src="announcements-reviewed.js"></script><script src="loader.js"></script></body>')
english={'新宿':'Shinjuku','立川':'Tachikawa','八王子':'Hachioji','甲府':'Kofu','小淵沢':'Kobuchizawa','茅野':'Chino','上諏訪':'Kami-Suwa','岡谷':'Okaya','塩尻':'Shiojiri','松本':'Matsumoto','韮崎':'Nirasaki','大月':'Otsuki','塩山':'Enzan','山梨市':'Yamanashishi','石和温泉':'Isawa-Onsen','竜王':'Ryuo'}
def help_section(page,heading,content):
 pattern=r'(<h3>'+re.escape(heading)+r'</h3>).*?(?=<h3>|</dialog>)'
 page,count=re.subn(pattern,lambda m:m[1]+content,page,count=1,flags=re.S)
 if count!=1:raise ValueError('Missing help section: '+heading)
 return page
platform_review={r['name']:r for r in json.loads((DEST/'sources/priority-platform-review.json').read_text())['stations']}
local_station_names={'大久保','東中野'}
reports=[]
chuo_html=json.loads(gzip.decompress(b''.join((ROOT/f'chuo-bundle-{i}.bin').read_bytes()for i in [0,1])))['html'];chuo_data=json.JSONDecoder().raw_decode(chuo_html.split('window.RAIL_DATA=',1)[1])[0];public_codes={s['name']:s['code']for r in chuo_data['routes'].values()for s in r['stops']}
for key,title,destination in [('azusa','特急あずさ','松本'),('kaiji','特急かいじ','竜王')]:
 alignment=json.loads(gzip.decompress((DEST/'alignments'/(key+'.json.gz')).read_bytes()));profile=json.loads(gzip.decompress((DEST/'alignments'/(key+'-rail-profile.json.gz')).read_bytes()));data={**base_data,'id':key+'-development','name':title,'englishName':key.capitalize(),'routes':{},'sourceNote':'開発中。国土数値情報の線形を加工。駅の配線・ホーム寸法・地上構造物・レール高度・車両寸法・他社列車は確認中。正式版ではありません。','serviceSources':[],'releaseReady':False}
 data['license']='PDL1.0 (processed MLIT N02) / ODbL-1.0 (retained city data)'
 formations={}
 for travel in ['forward','reverse']:
  formation=[];behind=0
  numbers=list(range(12,3,-1))if travel=='forward'else list(range(4,13))
  for i,number in enumerate(numbers):
   head=number in [4,12];native_reverse=(number==4)if travel=='forward'else(number!=4);pitch=21.43 if head else 20.5;front=(10.25 if native_reverse else 11.18)if head else 10.25
   formation.append({'number':number,'model':f'car{number}'+('Front'if i==0 else'Tail'if i==8 else'')if head else f'car{number}','reverse':native_reverse,'pitch':pitch,'frontExtent':front,'centreBehindFront':behind+front,'bogieHalfSpan':7.075,'doorCentres':stock['doorCentresByCar'][str(number)],'pantograph':number in stock['pantographCars'],'pantographModel':'pantograph5'if number==5 else'pantograph'});behind+=pitch
   kind='bogieDT82A'if number in [5,7,10]else'bogieDT81A'if number in [6,11]else'bogieTR265B'if number==8 else'bogieTR265A'
   # Model bogie order follows increasing route distance, not native car order.
   formation[-1]['bogieModels']=(['bogieTR265','bogieTR265A']if native_reverse else['bogieTR265A','bogieTR265'])if head else[kind,kind]
  formations[travel]=formation
 data['train']={'cars':9,'length':20.5,'width':2.92,'totalLength':behind,'cabHeight':3.55,'formation':formations['forward'],'formations':formations,'manufacturerDimensionsVerified':True,'verified':False}
 for direction in ['forward','reverse']:
  service=json.loads((DEST/'services'/(key+'-'+direction+'.json')).read_text());reverse=direction=='reverse';points=list(reversed(alignment['points']))if reverse else alignment['points'];heights=list(reversed(alignment['groundHeights']))if reverse else alignment['groundHeights'];points=copy.deepcopy(points)
  # Left-hand running: separate both travel directions consistently using one source.
  original=[0.]
  for a,b in zip(points,points[1:]):original.append(original[-1]+math.hypot((b[0]-a[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(b[1]-a[1])*111320))
  def point_at(d):
   d=max(0,min(original[-1],d));i=min(len(points)-2,max(0,bisect.bisect_right(original,d)-1));t=(d-original[i])/(original[i+1]-original[i]);return [points[i][j]*(1-t)+points[i+1][j]*t for j in [0,1]]
  reviewed_indices=[len(points)-1-r['index']if reverse else r['index']for r in alignment['physicalStops']if r['name']in platform_review]
  layout_choices=[]
  for station in alignment['physicalStops']:
   if station['name']not in terminal_alignment.LAYOUTS:continue
   index=len(points)-1-station['index']if reverse else station['index'];reported=next((s.get('reportedPlatform')for s in service['stops']if s['name']==station['name']),None);platform,_=platform_selection.select(platform_review[station['name']],direction,reported);layout_choices.append((station['name'],index,platform))
  shifted=[]
  for i,p in enumerate(points):
   a,b=point_at(original[i]-40),point_at(original[i]+40);x=(b[0]-a[0])*111320*math.cos(math.radians(p[1]));y=(b[1]-a[1])*111320;l=math.hypot(x,y) or 1;nearest=min(abs(original[i]-original[j])for j in reviewed_indices);t=max(0,min(1,(900-nearest)/550));separation=1.85+4.15*t*t*(3-2*t)
   for station,index,platform in layout_choices:separation=terminal_alignment.separation(separation,original[i]-original[index],direction,platform,station)
   shifted.append([p[0]-y/l*separation/(111320*math.cos(math.radians(p[1]))),p[1]+x/l*separation/111320])
  cumulative=[0]
  for a,b in zip(shifted,shifted[1:]):cumulative.append(cumulative[-1]+math.hypot((b[0]-a[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(b[1]-a[1])*111320))
  physical=[]
  for s in (list(reversed(alignment['physicalStops']))if reverse else alignment['physicalStops']):
   i=len(points)-1-s['index']if reverse else s['index'];physical.append({**s,'index':i,'distance':cumulative[i]+110,'platformCenterDistance':cumulative[i],'lon':shifted[i][0],'lat':shifted[i][1],'english':english.get(s['name'],''),'publicCode':public_codes.get(s['name'],''),'platformGeometryVerified':False})
  by_code={s['code']:s for s in physical};stops=[{**by_code[s['sourceCode']],**{k:s[k]for k in ['arrival','departure','reportedPlatform']}}for s in service['stops']]
  route={'label':service['name']+' ／ '+stops[0]['name']+' → '+stops[-1]['name'],'points':shifted,'groundHeights':heights,'trackOffsets':list(reversed(profile['trackOffsets']))if reverse else profile['trackOffsets'],'surveyedRailHeights':False,'railHeightMethod':profile['method'],'stops':stops,'physicalStops':physical,'length':cumulative[-1],'loop':False,'vehicleMaximum':130,'stationSpeeds':[{'code':s['code'],'distance':s['distance'],'limit':130}for s in physical],'gameMaximum':130,'operatingSpeedVerified':False,'speedPolicy':'published-maximum-game-cap','speedSource':'https://www.jreast.co.jp/train/express/azusa_kaiji.html','prototypeLimitsNote':'130 km/h game cap based on the published E353 maximum. Actual station-to-station operating restrictions are not reproduced. Curve geometry imposes no limit.'}
  def mapped(d):
   d=max(0,min(original[-1],d));i=min(len(original)-2,max(0,bisect.bisect_right(original,d)-1));t=(d-original[i])/(original[i+1]-original[i]);return cumulative[i]*(1-t)+cumulative[i+1]*t
  route['structures']=[{**r,'start':mapped(original[-1]-r['end']if reverse else r['start']),'end':mapped(original[-1]-r['start']if reverse else r['end']),'startHeight':r['endHeight']if reverse else r['startHeight'],'endHeight':r['startHeight']if reverse else r['endHeight']}for r in profile['structures']]
  for stop in physical+stops:
   review=platform_review.get(stop['name']);reported=stop.get('reportedPlatform',next((s.get('reportedPlatform')for s in stops if s['code']==stop['code']),None));chosen,choice_kind=platform_selection.select(review,direction,reported)
   side=(review['sideTowardMatsumoto'].get(str(chosen))if review else None)
   stop.update(gamePlatformNumber=chosen if chosen and chosen.isdigit()else None,side=(side*(-1 if reverse else 1))if side is not None else 1,chosenPlatformSideReviewed=side is not None,platformSideVerified=side is not None and reported is not None,platformSideSource=review['sourceUrl']if review else None,platformEdgeOffset=1.58,platformHeight=1.10,platformGeometryVerified=False,observedLayout=review.get('observedLayout')if review else None)
   stop.update(platformChoiceKind=choice_kind,gamePlatformKey=chosen,directionalPlatformChoiceReviewed=choice_kind in ['service-timetable','operator-direction-game-choice'])
   layout=(review or{}).get('observedLayout')or{}
   stop['islandOuterTrack']=bool(layout.get('tracks')==3 and chosen and chosen.isdigit()and int(chosen)in layout.get('islandPlatformNumbers',[]))
   if stop['name']in terminal_alignment.LAYOUTS:stop['terminalLayout']=terminal_alignment.metadata(stop,direction);stop['islandOuterTrack']=False
   if stop['islandOuterTrack']:stop['islandOuterTrackJoin']=0 if stop['side']>0 else 12
   if stop['name']in local_station_names:
    i=stop['index'];p=points[i];q=shifted[i];separation=math.hypot((q[0]-p[0])*111320*math.cos(math.radians(p[1])),(q[1]-p[1])*111320)
    # Adjacent local-line island, not an E353 platform. Offset is an explicit
    # aerial-based game estimate; no surveyed alignment or platform assignment.
    stop.update(side=-1 if reverse else 1,platformLine='chuo-sobu-local',platformLateralOrigin=16+(separation if reverse else -separation)-3.78,platformPlacementEstimated=True,platformSideVerified=False,gamePlatformNumber=None)
  terminal=next(s for s in physical if s['name']=='竜王');route['sharedTerminals']=[{'id':'ryuo-platform2','entry':max(0,terminal['platformCenterDistance']-800),'exit':min(route['length'],terminal['platformCenterDistance']+800),'platform':'2','dimensionsEstimated':True}]if key=='kaiji'else[]
  data['routes'][direction]=route;data['serviceSources'].append(service['source'])
 announcements={}
 for direction,r in data['routes'].items():
  groups={k:{}for k in ['next','arrival','arrived','temporary']}
  for s in r['stops']:
   groups['next'][s['code']]=[{'text':'次は、'+s['name']+'です。','lang':'ja-JP'},{'text':'The next stop is '+s['english']+'.','lang':'en-US'}];groups['arrival'][s['code']]=[{'text':'まもなく、'+s['name']+'です。','lang':'ja-JP'},{'text':'We will soon arrive at '+s['english']+'.','lang':'en-US'}];groups['arrived'][s['code']]=[{'text':s['name']+'です。','lang':'ja-JP'},{'text':'This is '+s['english']+'.','lang':'en-US'}]
  announcements[direction]=groups
 payload={'data':data,'announcements':announcements,'commonSha256':common_sha,'stockSha256':stock_sha,'stage':'integrated-development-game','releaseReady':False};sha=packed(key+'.json.gz',payload)
 page=shell.replace('__NAME__',title).replace('__SCOPE__','新宿〜'+destination).replace('__END__',destination);page=page.replace('東行 ／ '+destination+' → 新宿','上り ／ '+destination+' → 新宿').replace('西行 ／ 新宿 → '+destination,'下り ／ 新宿 → '+destination)
 physical_count=len(data['routes']['forward']['physicalStops']);stop_counts={d:len(r['stops'])for d,r in data['routes'].items()}
 page=page.replace('新宿〜'+destination+'の39駅を収録。全駅に停車します。',f'新宿〜{destination}の全{physical_count}駅を収録。停車駅と通過駅を分けた特急運転です。')
 intro=f'新宿〜{destination}の両方向・全{physical_count}駅を収録。下りは{stop_counts["forward"]}駅、上りは{stop_counts["reverse"]}駅に停車し、それ以外の駅は通過します。E353系の基本編成9両（4〜12号車）で運転します。路線・出発駅の設定から、停車駅を選んで始められます。'
 page,count=re.subn(r'(<h2>'+re.escape(title)+r'を運転しよう</h2>)<p>.*?</p>',lambda m:m[1]+'<p>'+intro+'</p>',page,count=1,flags=re.S)
 if count!=1:raise ValueError('Missing game introduction')
 page=help_section(page,'2つの運転モード','<p>フリーランは時刻に縛られず走れます。「時刻通りに運転」は、収録した2026年10月の列車別時刻を目安に使います。遅れや運転変更などのリアルタイム情報は反映しません。乗降と音声案内が終われば、予定時刻より早く発車できます。自動・手動は両モードで選べます。</p>')
 page=help_section(page,'車両・ホーム・街','<p>E353系専用の車体・先頭形状・9両の編成を使用し、進行方向に合わせて号車の順序、扉、パンタグラフを変えます。メーカーの量産先行車資料を基にした模型で、量産車の台車・屋根・運転台などの細部は調整中です。ホームの向きは公式構内図を参照し、列車の番線が資料で確認できない場合はゲーム用のホームを選びます。寸法・配線・高さは推定を含みます。対向線には同じ路線の列車が走り、列車間隔はラッシュ・平日・休日のゲーム用設定から選べます。</p><p>線路・車両・架線は同じ高さ基準で配置し、ゲーム用のレール勾配を34‰以内に調整しています。地形はレールの実測高ではありません。街・乗客は元の共通モデルの詳細を保持しています。画質や街の量は設定画面から選べます。</p>')
 page=help_section(page,'音と放送','<p>収録列車の停車駅には、日本語・英語のゲーム用案内を用意しています。JR各線に加え、新宿の私鉄・地下鉄、立川の多摩モノレール、松本の上高地線などの乗換を案内します。通過駅は路線一覧・地図・ホームに残ります。番線や出口側は選択列車の資料で確認できた場合だけ案内します。</p><p>発車ベル、戸閉案内、戸閉の順に進みます。番線が不明な駅では戸閉案内から番線の数字を省きます。走行音・ドア音・警笛は合成音です。放送は端末の音声で読み上げ、日本語の声がない場合は字幕で案内します。本物の録音や発車メロディーは使用していません。</p>')
 page=page.replace('全区間で約3%以内','全区間で34‰以内')
 page=re.sub(r'<li>走行線形：.*?</li>', '<li>走行線形：<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html" target="_blank" rel="noopener">国土数値情報・鉄道データ（2025年12月31日時点）</a>を加工。線路ごとの位置・間隔・高さはゲーム向けに推定しています。<a id="download-route" href="#">加工した路線データを保存</a></li>',page,count=1,flags=re.S)
 page=page.replace('建物は共通の着色済み簡易模型を架空配置。','建物は共通の着色済み模型を架空配置。共通街データには <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors / ODbL-1.0</a> の加工データを含みます。')
 page=re.sub(r'<body\b([^>]*)>',lambda m:'<body'+m[1]+' data-packet-sha="'+sha+'">',page,count=1).replace('全39駅','全'+str(len(data['routes']['forward']['physicalStops']))+'駅')
 (OUT/(key+'.html')).write_text(page)
 reports.append({'id':key,'entry':'games/'+key+'.html','packet':'games/'+key+'.json.gz','sha256':sha,'directions':2,'physicalStations':len(data['routes']['forward']['physicalStops']),'releaseReady':False})
(OUT/'build-report.json').write_text(json.dumps({'base':'chuo-local-bundle-0.bin + chuo-local-bundle-1.bin','baseSha256':hashlib.sha256(base_bytes).hexdigest(),'retainedFeatures':['Published layout and controls','Manual and automatic driving','Starting station and both directions','Stop/pass inventory','Free/timetable modes and early departure','Cab/chase/map cameras','Keyboard and touch controls','Door/boarding lifecycle','Audio/volume/horn and text announcements','Local save/restore','Settings, help, mobile layout, renderer fallback','Traffic/signals and original neighbour adapter'],'developmentOnly':True,'games':reports},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(reports,ensure_ascii=False))
