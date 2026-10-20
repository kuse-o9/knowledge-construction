"""Smooth retained game track geometry together with its meshes, never stations.

The displacement is bounded to 3 m and fades to zero for 280 m around every
station and at endpoints. This is an approximate visual correction, not a survey.
Run once per asset generation; the assetRevision marker makes it idempotent.
Requires numpy/scipy. Then run build-signalled-routes.py.
"""
from pathlib import Path
import base64,gzip,json,re,importlib.util
from rail_model_io import load_yamanote,save_yamanote
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('alignment',Path(__file__).with_name('align-chuo-fujisan.py'))
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
ecef,geographic,cumulative=helpers.ecef,helpers.geographic,helpers.cumulative
MARK='smooth-track-v1'

def transform(data,models):
 if models.get('curveRevision')==MARK:return None
 fields={};report={}
 for direction,r in data['routes'].items():
  p=np.array(r['points']);old=cumulative(p);h=np.array(models['groundHeights'][direction])+np.array(r['trackOffsets'])
  world=ecef(p[:,0],p[:,1],h);smooth=gaussian_filter1d(world,2,axis=0,mode='nearest');delta=smooth-world
  radial=world/np.linalg.norm(world,axis=1)[:,None];delta-=radial*(delta*radial).sum(axis=1)[:,None]
  nearest=np.min(np.abs(old[:,None]-np.array([s['distance'] for s in r['stops']])[None,:]),axis=1)
  factor=np.clip((nearest-280)/100,0,1);factor*=np.clip(np.minimum(old,old[-1]-old)/80,0,1);factor=factor*factor*(3-2*factor)
  delta*=factor[:,None];delta*=np.minimum(1,3/np.maximum(np.linalg.norm(delta,axis=1),1e-10))[:,None]
  newp=geographic(world+delta);new=cumulative(newp)
  # Keep protected coordinates bit-for-bit, particularly inter-segment endpoints.
  newp[np.linalg.norm(delta,axis=1)<1e-9]=p[np.linalg.norm(delta,axis=1)<1e-9];new=cumulative(newp)
  fields[direction]={'world':world,'delta':delta,'tree':cKDTree(world),'old':old,'new':new,'points':newp}
  r['points']=newp.tolist();r['length']=float(new[-1]);r.pop('stationSpeeds',None)
  for s in r['stops']:s['distance']=float(new[s['index']]);s['lon'],s['lat']=newp[s['index']].tolist()
  r['groundHeights']=models['groundHeights'][direction]
  report[direction]={'points':len(p),'maximumDisplacement':float(np.linalg.norm(delta,axis=1).max()),'lengthBefore':float(old[-1]),'lengthAfter':float(new[-1])}
 def field(x,direction):
  shape=np.asarray(x).shape;v=np.asarray(x).reshape(-1,3);f=fields[direction];_,nearest=f['tree'].query(v)
  candidates=np.stack((np.clip(nearest-1,0,len(f['world'])-2),np.clip(nearest,0,len(f['world'])-2)),axis=1)
  a=f['world'][candidates];b=f['world'][candidates+1];ab=b-a;diff=v[:,None,:]-a;t=np.clip((diff*ab).sum(axis=2)/np.maximum((ab*ab).sum(axis=2),1e-9),0,1)
  dist=((diff-t[:,:,None]*ab)**2).sum(axis=2);pick=np.argmin(dist,axis=1);idx=candidates[np.arange(len(v)),pick];tt=t[np.arange(len(v)),pick]
  move=f['delta'][idx]*(1-tt[:,None])+f['delta'][idx+1]*tt[:,None]
  return (v+move).reshape(shape)
 def remap(direction,d):return float(np.interp(d,fields[direction]['old'],fields[direction]['new']))
 def metadata(v,direction,key=''):
  if isinstance(v,dict):return {k:(x if k in ['groups','fallback','roof'] else metadata(x,direction,k)) for k,x in v.items()}
  if isinstance(v,list):
   if len(v)==3 and all(isinstance(n,(float,int)) for n in v) and np.linalg.norm(v)>1e6:return field(v,direction).tolist()
   return [metadata(x,direction,key) for x in v]
  if key in ['distance','start','end'] and isinstance(v,(float,int)):return remap(direction,v)
  return v
 def mesh(m,direction):
  if not isinstance(m,dict) or 'origin' not in m:return m
  origin=np.array(m['origin']);new_origin=field(origin,direction);out=metadata(m,direction)
  for group in out.get('groups',[]):
   dtype='<i2' if group.get('positionScale') else '<f4';local=np.frombuffer(base64.b64decode(group['positions']),dtype=dtype).astype(float).reshape(-1,3)*group.get('positionScale',1)
   moved=field(local+origin,direction)-new_origin
   if np.allclose(local,moved,atol=.0001):continue
   group['positions']=base64.b64encode(moved.astype('<f4').tobytes()).decode();group.pop('positionScale',None)
   indices=np.frombuffer(base64.b64decode(group['indices']),dtype='<u4' if group.get('indexType')==32 else '<u2').reshape(-1,3)
   normals=np.zeros_like(moved);a,b,c=moved[indices[:,0]],moved[indices[:,1]],moved[indices[:,2]];n=np.cross(b-a,c-a)
   for col in range(3):np.add.at(normals,indices[:,col],n)
   normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9);group['normals']=base64.b64encode(np.rint(normals*127).clip(-127,127).astype('i1').tobytes()).decode()
  out['radius']=m.get('radius',500)+6
  if 'fallback' in out:out['fallback']=mesh(out['fallback'],direction)
  return out
 for kind in ['tracks','stations']:
  models[kind]=[mesh(m,m['direction']) if m.get('direction') in fields else m for m in models[kind]]
 for direction in fields:
  if isinstance(models.get('masts'),dict) and direction in models['masts']:models['masts'][direction]=metadata(models['masts'][direction],direction)
 # OSM-aligned neighbouring traffic data are separate routes and are not deformed.
 models['curveRevision']=MARK
 models['curveAudit']=report
 return report,fields,mesh,metadata

def main():
 report={}
 for name in ['chuo','chuo-local','keihin','sobu']:
  path=ROOT/(name+'.html');boot=path.read_text();inline=re.search(r'<script id="game-bundle"[^>]*>(.*?)</script>',boot,re.S);prefix='sobu-data' if name=='sobu' else name+'-bundle'
  payload=json.loads(gzip.decompress(base64.b64decode(inline[1]) if inline else b''.join((ROOT/(prefix+f'-{i}.bin')).read_bytes() for i in range(2))))
  data_match=re.search(r'window.RAIL_DATA=',payload['html']);model_match=re.search(r'window.RAIL_PREBUILT_MODELS=',payload['html']);decoder=json.JSONDecoder()
  data,dn=decoder.raw_decode(payload['html'][data_match.end():]);models,mn=decoder.raw_decode(payload['html'][model_match.end():])
  result=transform(data,models)
  if not result:continue
  report[name]=result[0]
  for start,end,value in sorted([(data_match.end(),data_match.end()+dn,data),(model_match.end(),model_match.end()+mn,models)],reverse=True):payload['html']=payload['html'][:start]+json.dumps(value,ensure_ascii=False,separators=(',',':'))+payload['html'][end:]
  packed=gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0)
  if inline:boot=boot[:inline.start(1)]+base64.b64encode(packed).decode()+boot[inline.end(1):];path.write_text(boot)
  else:
   mid=(len(packed)+1)//2
   for i,b in enumerate([packed[:mid],packed[mid:]]):(ROOT/(prefix+f'-{i}.bin')).write_bytes(b)
  print(name,report[name],flush=True)
 for name in ['west','ome','okutama','fuji','lake']:
  path=ROOT/('chuo-'+name+'.bin');payload=json.loads(gzip.decompress(path.read_bytes()));result=transform(payload['data'],payload['models'])
  if result:report[name]=result[0];path.write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0));print(name,report[name],flush=True)
 path=ROOT/'yamanote/rail-data.js';text=path.read_text();decoder=json.JSONDecoder();di=text.index('window.RAIL_DATA=')+len('window.RAIL_DATA=');data,dn=decoder.raw_decode(text[di:])
 models=load_yamanote(ROOT);result=transform(data,models)
 if result:
  report['yamanote']=result[0]
  for asset in (ROOT/'yamanote/models').glob('*.json'):
   packet=json.loads(asset.read_text());packet['models']=[result[2](m,m['direction']) if m.get('direction') in result[1] else m for m in packet['models']];asset.write_text(json.dumps(packet,ensure_ascii=False,separators=(',',':')))
  path.write_text(text[:di]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+text[di+dn:]);save_yamanote(ROOT,models);print('yamanote',report['yamanote'],flush=True)
 if report:(ROOT/'development/curve-alignment-audit.json').write_text(json.dumps({'revision':MARK,'stationProtectionMeters':280,'maximumShiftMeters':3,'routes':report},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
