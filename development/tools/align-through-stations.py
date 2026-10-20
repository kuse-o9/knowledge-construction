"""Align existing through-game station coordinates and altitude datums.
Repairs two legacy mountain profiles that added altitude twice. Station/track
meshes, metadata, distances and ground-relative offsets are edited together.
Terrain-derived heights remain approximate; this is not surveyed railway data.
"""
from pathlib import Path
import base64,gzip,json,re,importlib.util
import numpy as np
from scipy.spatial import cKDTree
from scipy.interpolate import PchipInterpolator
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('alignment',Path(__file__).with_name('align-chuo-fujisan.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
MARK='through-coordinate-height-v1'
def unpack(name):
 if name=='main':
  boot=(ROOT/'chuo.html').read_text();m=re.search(r'<script id="game-bundle"[^>]*>(.*?)</script>',boot,re.S);raw=base64.b64decode(m[1]) if m else b''.join((ROOT/f'chuo-bundle-{i}.bin').read_bytes() for i in range(2));html=json.loads(gzip.decompress(raw))['html'];dec=json.JSONDecoder();return {'data':dec.raw_decode(html.split('window.RAIL_DATA=',1)[1])[0],'models':dec.raw_decode(html.split('window.RAIL_PREBUILT_MODELS=',1)[1])[0]}
 return json.loads(gzip.decompress((ROOT/('chuo-'+name+'.bin')).read_bytes()))
def anchor(p,direction,name):
 r=p['data']['routes'][direction];s=next(s for s in r['stops'] if s['name']==name);i=s['index'];return np.array([s['lon'],s['lat']]),p['models']['groundHeights'][direction][i]+r['trackOffsets'][i]
def edit(p,name,targets):
 if p['models'].get('throughAlignmentRevision')==MARK:return
 data,models=p['data'],p['models'];fields={};audit={}
 for direction,r in data['routes'].items():
  points=np.array(r['points']);old=h.cumulative(points);gh=np.array(models['groundHeights'][direction]);height=gh+np.array(r['trackOffsets']);world=h.ecef(points[:,0],points[:,1],height);new_points=points.copy();new_height=height.copy();overrides={}
  for station,provider in targets:
   target,alt=anchor(provider,direction,station);s=next(x for x in r['stops'] if x['name']==station);delta=target-points[s['index']];u=np.clip((1500-np.abs(old-s['distance']))/1220,0,1);weight=u*u*(3-2*u);new_points+=delta*weight[:,None];new_height+=(alt-height[s['index']])*weight;overrides[station]=alt
  if name in ['west','okutama']:
   # In the legacy packets rail offsets reached +325/+367m. Re-anchor platform
   # heights to ground +3.7m and interpolate between flat platform sections.
   xs=[];ys=[]
   for s in r['stops']:
    alt=overrides.get(s['name'],float(gh[s['index']]+3.7))
    for d in [max(0,s['distance']-280),min(old[-1],s['distance']+280)]:xs.append(d);ys.append(alt)
   xs=[0]+xs+[old[-1]];ys=[ys[0]]+ys+[ys[-1]]
   unique={float(x):float(y) for x,y in zip(xs,ys)};xs=sorted(unique);new_height=PchipInterpolator(xs,[unique[x] for x in xs])(old)
  new=h.cumulative(new_points);new_world=h.ecef(new_points[:,0],new_points[:,1],new_height)
  fields[direction]={'world':world,'delta':new_world-world,'tree':cKDTree(world),'old':old,'new':new}
  r['points']=new_points.tolist();r['trackOffsets']=(new_height-gh).tolist();r['groundHeights']=gh.tolist();r['length']=float(new[-1])
  for s in r['stops']:s['lon'],s['lat']=new_points[s['index']].tolist();s['distance']=float(new[s['index']])
  audit[direction]={'maximumVerticalCorrectionMeters':float(np.max(np.abs(new_height-height))),'maximumGradePerMille':float(np.max(np.abs(np.diff(new_height)/np.maximum(np.diff(new),1e-8)))*1000),'offsetMinimum':float(np.min(new_height-gh)),'offsetMaximum':float(np.max(new_height-gh))}
 def move(x,key,constant=None):
  shape=np.asarray(x).shape;v=np.asarray(x).reshape(-1,3);f=fields[key]
  if constant is not None:return (v+constant).reshape(shape)
  _,nearest=f['tree'].query(v);cand=np.stack((np.clip(nearest-1,0,len(f['world'])-2),np.clip(nearest,0,len(f['world'])-2)),axis=1);a=f['world'][cand];ab=f['world'][cand+1]-a;diff=v[:,None,:]-a;t=np.clip((diff*ab).sum(axis=2)/np.maximum((ab*ab).sum(axis=2),1e-8),0,1);pick=np.argmin(((diff-t[:,:,None]*ab)**2).sum(axis=2),axis=1);idx=cand[np.arange(len(v)),pick];t=t[np.arange(len(v)),pick];return (v+f['delta'][idx]*(1-t[:,None])+f['delta'][idx+1]*t[:,None]).reshape(shape)
 def meta(v,key,constant=None,label=''):
  if isinstance(v,dict):return {k:(x if k in ['groups','fallback','roof'] else meta(x,key,constant,k)) for k,x in v.items()}
  if isinstance(v,list):
   if len(v)==3 and all(isinstance(n,(int,float)) for n in v) and np.linalg.norm(v)>1e6:return move(v,key,constant).tolist()
   return [meta(x,key,constant,label) for x in v]
  if label in ['distance','start','end'] and isinstance(v,(int,float)):return float(np.interp(v,fields[key]['old'],fields[key]['new']))
  return v
 def mesh(m,key,constant=None):
  if not isinstance(m,dict) or 'origin' not in m:return m
  origin=np.array(m['origin']);new_origin=move(origin,key,constant);out=meta(m,key,constant)
  for group in out.get('groups',[]):
   x=np.frombuffer(base64.b64decode(group['positions']),dtype='<i2' if group.get('positionScale') else '<f4').astype(float).reshape(-1,3)*group.get('positionScale',1);moved=move(x+origin,key,constant)-new_origin
   if np.allclose(x,moved,atol=.0001):continue
   group['positions']=base64.b64encode(moved.astype('<f4').tobytes()).decode();group.pop('positionScale',None);idx=np.frombuffer(base64.b64decode(group['indices']),dtype='<u4' if group.get('indexType')==32 else '<u2').reshape(-1,3);normal=np.zeros_like(moved);a,b,c=moved[idx[:,0]],moved[idx[:,1]],moved[idx[:,2]];n=np.cross(b-a,c-a)
   for col in range(3):np.add.at(normal,idx[:,col],n)
   normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);group['normals']=base64.b64encode(np.rint(normal*127).clip(-127,127).astype('i1').tobytes()).decode()
  out['radius']=float(m.get('radius',500)+np.max(np.linalg.norm(fields[key]['delta'],axis=1))+10)
  if isinstance(out.get('fallback'),dict):out['fallback']=mesh(out['fallback'],key,constant)
  if isinstance(out.get('roof'),dict):out['roof']=mesh(out['roof'],key,constant)
  return out
 models['tracks']=[mesh(m,m['direction']) if m.get('direction') in fields else m for m in models['tracks']]
 stations=[]
 for m in models['stations']:
  key=m.get('direction')
  if key not in fields:stations.append(m);continue
  s=next(s for s in data['routes'][key]['stops'] if s['code']==m['code']);constant=fields[key]['delta'][s['index']];stations.append(mesh(m,key))
 models['stations']=stations
 if isinstance(models.get('masts'),dict):
  for key in fields:
   if key in models['masts']:models['masts'][key]=meta(models['masts'][key],key)
 models['throughAlignmentRevision']=MARK;models['throughAlignmentAudit']=audit
 return audit
def main():
 all={name:unpack(name) for name in ['main','west','ome','okutama','fuji','lake']};prior=ROOT/'development/through-running/connection-alignment-audit.json';report=json.loads(prior.read_text()).get('corrections',{}) if prior.exists() else {}
 for name,targets in [('west',[('高尾',all['main'])]),('ome',[('立川',all['main'])]),('okutama',[('青梅',all['ome'])]),('fuji',[('大月',all['west']),('富士山',all['lake'])])]:
  result=edit(all[name],name,targets)
  if not result:report[name]=all[name]['models'].get('throughAlignmentAudit',report.get(name,{}))
  if result:(ROOT/('chuo-'+name+'.bin')).write_bytes(gzip.compress(json.dumps(all[name],ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0));report[name]=result;print(name,result,flush=True)
 checks=[]
 for a,b,station in [('main','west','高尾'),('main','ome','立川'),('ome','okutama','青梅'),('west','fuji','大月'),('fuji','lake','富士山')]:
  for direction in ['reverse','forward']:
   x,xh=anchor(all[a],direction,station);y,yh=anchor(all[b],direction,station);horizontal=float(np.hypot((x[0]-y[0])*90400,(x[1]-y[1])*111200));vertical=abs(xh-yh);assert horizontal<.01 and vertical<.01,(a,b,direction,horizontal,vertical);checks.append({'from':a,'to':b,'station':station,'direction':direction,'horizontalErrorMeters':horizontal,'heightErrorMeters':vertical})
 (ROOT/'development/through-running/connection-alignment-audit.json').write_text(json.dumps({'revision':MARK,'corrections':report,'connections':checks},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
