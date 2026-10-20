"""Inventory only. Does not re-run or claim real-time/GPU coverage from numerical tests."""
from pathlib import Path
import json,gzip,re,hashlib
r=Path(__file__).resolve().parents[2];out=[];stations=[]
for name in ['yamanote','chuo','chuo-local','keihin','sobu','west','ome','okutama','fuji','lake']:
 if name=='yamanote':
  d=json.JSONDecoder().raw_decode((r/'yamanote/rail-data.js').read_text().split('window.RAIL_DATA=',1)[1])[0];a=json.JSONDecoder().raw_decode((r/'yamanote/rail-announcements.js').read_text().split('window.RAIL_ANNOUNCEMENTS=',1)[1])[0]
 elif name in ['west','ome','okutama','fuji','lake']:
  p=json.loads(gzip.decompress((r/('chuo-'+name+'.bin')).read_bytes()));d=p['data'];a=p['announcements']
 else:
  prefix='sobu-data'if name=='sobu'else name+'-bundle';p=json.loads(gzip.decompress(b''.join((r/(prefix+f'-{i}.bin')).read_bytes()for i in [0,1])));d=json.JSONDecoder().raw_decode(p['html'].split('window.RAIL_DATA=',1)[1])[0];a=json.JSONDecoder().raw_decode(p['html'].split('window.RAIL_ANNOUNCEMENTS=',1)[1])[0]
 for direction,route in d['routes'].items():
  key=name+':'+direction;checks={'numericalFullRun':'passed (research-tests-final.log)','realTimeFullRun':'not-run','softwareGPUFullRun':'not-run','allCameraViewsAlongWholeRoute':'not-run','physicalGPU':'unavailable','physicalAudioListening':'unavailable','physicalPhoneTouch':'unavailable','individualStationOfficialTransferReview':'pending'}
  out.append({'key':key,'dataId':d['id'],'geometryAndStopsHash':hashlib.sha256(json.dumps([route['points'],route['stops']],sort_keys=True).encode()).hexdigest(),'stationCount':len(route['stops']),'physicalStationCount':len(route.get('physicalStops',route['stops'])),'start':route['stops'][0]['name'],'end':route['stops'][-1]['name'],'checks':checks})
  for s in route['stops']:
   stages={stage:[e.get('lang') for e in a.get(direction,{}).get(stage,{}).get(s['code'],[]) ]for stage in ['next','arrival','arrived']}
   stations.append({'key':key,'code':s['code'],'name':s['name'],'scriptLanguages':stages,'nativeListening':'not-tested','individualOfficialTransferReview':'pending'})
realtime=r/'development/browser-validation/realtime-running.json'
if realtime.exists():
 for run in json.loads(realtime.read_text())['runs']:
  key='lake:'+run.get('initial',{}).get('direction','');entry=next((x for x in out if x['key']==key),None)
  if entry:
   entry['realTimeEvidence']={'file':'realtime-running.json','status':run['status'],'wallSeconds':run.get('wallSeconds'),'lastSample':run.get('samples',[None])[-1] if run.get('samples') else None}
   if run['status']=='completed':entry['checks']['realTimeFullRun']='completed, sound off / cab only';entry['checks']['softwareGPUFullRun']='completed, Mesa llvmpipe WebGL2 / cab only'
report={'updated':'2026-10-20','deduplication':'One job per built corridor, direction, geometry/stops hash. Numerical, sampled-render and wall-clock runs remain separate evidence types.','jobs':out,'userAcceptance':{'date':'2026-10-20','planningStatus':'closed by user decision','items':['physicalGPU','physicalAudioListening','physicalPhoneTouch','realTimeFullRun'],'meaning':'ユーザーの指示で予定上の確認を終了。未実施の検査を実施・合格したという意味ではない。'},'completionRule':'No physical validation or whole-route camera/transfer review is inferred from numerical tests or touch emulation.'}
(r/'development/browser-validation/validation-ledger.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(r/'development/browser-validation/station-announcement-inventory.json').write_text(json.dumps({'stationDirectionEntries':len(stations),'method':'Script presence inventory only, not a listening or all-transfers correctness test.','stations':stations},ensure_ascii=False,indent=2))
print(json.dumps({'jobs':len(out),'stationDirectionEntries':len(stations),'realTimeCompleted':sum(x['checks']['realTimeFullRun'].startswith('completed')for x in out)}))
