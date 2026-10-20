"""Export only already-built railways for position/height-correct nearby traffic."""
from pathlib import Path
import json,gzip,hashlib,sys
sys.path.insert(0,str(Path(__file__).parent))
from rail_model_io import load_yamanote
root=Path(__file__).resolve().parents[2];out=[]
for name in ['yamanote','chuo','chuo-local','keihin','sobu']:
 if name=='yamanote':
  data=json.JSONDecoder().raw_decode((root/'yamanote/rail-data.js').read_text().split('window.RAIL_DATA=',1)[1])[0];models=load_yamanote(root)
 else:
  prefix='sobu-data' if name=='sobu' else name+'-bundle';bundle=json.loads(gzip.decompress(b''.join((root/(prefix+f'-{i}.bin')).read_bytes()for i in [0,1])));html=bundle['html']
  data=json.JSONDecoder().raw_decode(html.split('window.RAIL_DATA=',1)[1])[0];models=json.JSONDecoder().raw_decode(html.split('window.RAIL_PREBUILT_MODELS=',1)[1])[0]
 routes={}
 for key,r in data['routes'].items():
  if key not in ['forward','reverse']:continue
  routes[key]={k:v for k,v in r.items()if k in ['label','points','stops','trackOffsets','loop','gameMaximum','stationSpeeds','physicalStops']};routes[key]['groundHeights']=models['groundHeights'][key]
 out.append({'id':name,'dataId':data['id'],'cars':data['train']['cars'],'routes':routes,'stock':{k:models[k]for k in ['train','trainHead','trainTail','bogie','pantograph']if k in models},'credit':models.get('credit'),'license':models.get('license')})
packed=gzip.compress(json.dumps({'version':1,'corridors':out},ensure_ascii=False,separators=(',',':')).encode(),mtime=0)
p=root/'shared/neighbour-corridors.bin';p.write_bytes(packed)
print(json.dumps({'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'corridors':[x['id']for x in out]}))
