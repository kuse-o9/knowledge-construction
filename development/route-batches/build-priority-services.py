"""Bind selected October 2026 weekday services to physical station candidates.

Timetable facts are transcribed from JR East's train-specific pages, not inferred
from a generic list. These profiles do not supply track speeds or platform meshes.
"""
from pathlib import Path
import gzip,hashlib,json

HERE=Path(__file__).parent;DEST=HERE/'batch-001'
PROFILES=[
 ('azusa','forward','あずさ13号','13M','https://timetables.jreast.co.jp/2610/train/050/054701.html',[
  ('新宿',None,'10:00','9'),('立川','10:25','10:25','6'),('八王子','10:33','10:34','4'),('甲府','11:28','11:29','1'),('小淵沢','11:53','11:53','1'),('茅野','12:06','12:07',None),('上諏訪','12:12','12:12',None),('岡谷','12:19','12:20',None),('塩尻','12:27','12:27',None),('松本','12:37',None,'3')]),
 ('azusa','reverse','あずさ54号','54M','https://timetables.jreast.co.jp/2610/train/060/063811.html',[
  ('松本',None,'18:40','2'),('塩尻','18:48','18:49',None),('岡谷','18:56','18:56',None),('上諏訪','19:03','19:03',None),('茅野','19:09','19:09',None),('小淵沢','19:22','19:23','2'),('韮崎','19:39','19:39',None),('甲府','19:47','19:48','2'),('八王子','20:41','20:42','2'),('立川','20:50','20:51','3'),('新宿','21:17',None,'7')]),
 ('kaiji','forward','かいじ47号','5147M','https://timetables.jreast.co.jp/2610/train/110/111441.html',[
  ('新宿','18:28','18:30','10'),('立川','18:58','18:59','6'),('八王子','19:07','19:08','4'),('大月','19:33','19:34','3'),('塩山','19:54','19:54','1'),('山梨市','19:59','20:00','3'),('石和温泉','20:04','20:05',None),('甲府','20:11','20:12','1'),('竜王','20:16',None,'2')]),
 ('kaiji','reverse','かいじ2号','5102M','https://timetables.jreast.co.jp/2610/train/085/087651.html',[
  ('竜王',None,'06:58','2'),('甲府','07:02','07:03','2'),('石和温泉','07:08','07:09',None),('山梨市','07:13','07:13','1'),('塩山','07:17','07:18','3'),('大月','07:36','07:36','5'),('八王子','08:03','08:04','2'),('立川','08:12','08:13','3'),('新宿','08:43','08:44','7')]),
]

def seconds(s):
 return None if s is None else sum(int(n)*m for n,m in zip(s.split(':'),[3600,60]))

out=DEST/'services';out.mkdir(exist_ok=True);index=[]
for key,direction,title,number,url,rows in PROFILES:
 path=DEST/'reference-paths'/(key+'.json.gz');data=json.loads(gzip.decompress(path.read_bytes()))
 stations=data['physicalStationCandidates'];stops=[]
 for name,arrival,departure,platform in rows:
  matches=[s for s in stations if s['name']==name]
  if len(matches)!=1:raise ValueError(f'{title}: ambiguous or missing station {name}')
  station=matches[0];stops.append({'name':name,'sourceCode':station['sourceCode'],'sourceGroupCode':station['sourceGroupCode'],'referenceDistance':station['distance'],'arrival':seconds(arrival),'departure':seconds(departure),'reportedPlatform':platform})
 distances=[s['referenceDistance']for s in stops]
 assert distances==sorted(distances,reverse=direction=='reverse')
 selected={s['sourceCode']for s in stops}
 payload={'id':key+'-'+direction,'route':key,'direction':direction,'name':title,'trainNumber':number,'stage':'service-pattern-bound','releaseReady':False,'source':url,'retrieved':'2026-10-21','timetableMonth':'2026-10','operatingDays':'Weekdays only; date exceptions must be rechecked before offering a real-date timetable','scope':{'start':rows[0][0],'end':rows[-1][0],'clippedFromLongerService':key=='kaiji','note':'Kaiji 47/2 operate to/from Tokyo; this game profile initially covers the Shinjuku–Ryuo portion only.' if key=='kaiji' else 'Whole selected service'},'referencePathSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'stops':stops,'passingStationSourceCodes':[s['sourceCode']for s in (stations if direction=='forward' else reversed(stations)) if s['sourceCode']not in selected],'vehicle':{'type':'E353','maximumKmh':130,'source':'https://www.jreast.co.jp/train/express/azusa_kaiji.html','formationForThisTrain':'pending verification'},'pending':['Verify current per-running-track alignment and service-specific stop markers','Create platforms matching reported track numbers; unspecified numbers remain unknown','Supply independently verified station-boundary operating speeds','Verify train formation, vehicle dimensions, acceleration and braking','Integrate bilingual announcements and complete route rendering checks']}
 target=out/(payload['id']+'.json');target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
 index.append({'id':payload['id'],'path':'services/'+target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'stops':len(stops),'passingStations':len(payload['passingStationSourceCodes'])})
(out/'index.json').write_text(json.dumps({'profiles':index,'releaseReady':False},ensure_ascii=False,indent=2)+'\n');print(json.dumps(index,ensure_ascii=False))
