"""Retain local-line-only platforms alongside the Sobu Rapid tracks.
Uses the existing local game models and the already retained local alignment;
never adds a platform to a rapid track at a station served only by local trains.
"""
from pathlib import Path
import json,re,gzip,base64,copy,math
ROOT=Path(__file__).resolve().parents[2]
def unpack(name):
 boot=(ROOT/(name+'.html')).read_text();m=re.search(r'<script id="game-bundle"[^>]*>(.*?)</script>',boot,re.S)
 prefix='sobu-data' if name=='sobu' else name+'-bundle'
 return json.loads(gzip.decompress(base64.b64decode(m[1]) if m else b''.join((ROOT/(prefix+f'-{i}.bin')).read_bytes() for i in range(2))))
def value(html,key):
 start=html.index(key)+len(key);v,length=json.JSONDecoder().raw_decode(html[start:]);return start,length,v
def main():
 payload=unpack('sobu');local=unpack('chuo-local');a,an,data=value(payload['html'],'window.RAIL_DATA=');b,bn,models=value(payload['html'],'window.RAIL_PREBUILT_MODELS=');_,_,source=value(local['html'],'window.RAIL_PREBUILT_MODELS=')
 if models.get('passingPlatformRevision')=='local-platforms-v1':print('Passing platforms already added');return
 added=[]
 for direction,route in data['routes'].items():
  names={s['name'] for s in route['stops']};physical=copy.deepcopy(route['stops']);parallel=models['parallelRoutes'][direction]
  for station in source['stations']:
   if station['direction']!=direction or station['name'] in names:continue
   # Keep only stations along the common Kinshicho-Chiba surface corridor.
   if station['lon']<139.811 or station['lon']>140.115:continue
   ps=min(parallel['stops'],key=lambda s:math.hypot((s['lon']-station['lon'])*90400,(s['lat']-station['lat'])*111200))
   separation=math.hypot((ps['lon']-station['lon'])*90400,(ps['lat']-station['lat'])*111200)
   if ps['name']!=station['name'] or separation>2:raise ValueError('Local station is not aligned: '+station['name'])
   m=copy.deepcopy(station);m['id']='local:'+m['id'];m['direction']='local-'+direction;m['distance']=ps['distance'];models['stations'].append(m)
   # Physical passing locations use projection onto this direction's rapid route.
   i=min(range(len(route['points'])),key=lambda i:math.hypot((route['points'][i][0]-station['lon'])*90400,(route['points'][i][1]-station['lat'])*111200))
   physical.append({'code':m['code'],'name':m['name'],'english':m['english'],'lon':m['lon'],'lat':m['lat'],'index':i,'distance':route['stops'][0]['distance'] if i==0 else 0,'localPlatform':True})
   added.append({'direction':direction,'name':m['name'],'code':m['code'],'alignmentErrorMeters':separation})
  # Same distance formula as RailCore.geometry.
  cumulative=[0]
  for p,q in zip(route['points'],route['points'][1:]):cumulative.append(cumulative[-1]+math.hypot((q[0]-p[0])*111320*math.cos((p[1]+q[1])*math.pi/360),(q[1]-p[1])*111320))
  for s in physical:
   if s.get('localPlatform'):s['distance']=cumulative[s['index']]
  route['physicalStops']=sorted(physical,key=lambda s:s['distance'])
 models['passingPlatformRevision']='local-platforms-v1'
 for start,length,v in sorted([(a,an,data),(b,bn,models)],reverse=True):payload['html']=payload['html'][:start]+json.dumps(v,ensure_ascii=False,separators=(',',':'))+payload['html'][start+length:]
 packed=gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0);mid=(len(packed)+1)//2
 for i,chunk in enumerate([packed[:mid],packed[mid:]]):(ROOT/f'sobu-data-{i}.bin').write_bytes(chunk)
 (ROOT/'development/passing-stations-audit.json').write_text(json.dumps({'revision':'local-platforms-v1','platforms':added},ensure_ascii=False,indent=2));print('Added',len(added),'directional local platforms')
if __name__=='__main__':main()
