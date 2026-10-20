"""Join the existing Fujisan platform as a physical game switchback.
Keeps the lake alignment as reference; blends the Fuji approach over 600 m.
Not a surveyed station track diagram. Warps rails and station meshes together,
rotating lateral offsets so the rail gauge survives the bend.
"""
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
import base64,gzip,json,importlib.util
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('geo',Path(__file__).with_name('align-chuo-fujisan.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
MARK='fujisan-physical-switchback-v1'
def main():
 path=ROOT/'chuo-fuji.bin';p=json.loads(gzip.decompress(path.read_bytes()));lake=json.loads(gzip.decompress((ROOT/'chuo-lake.bin').read_bytes()))
 if p['models'].get('switchbackRevision')==MARK:print('Switchback already aligned');return
 fields={}
 for key,r in p['data']['routes'].items():
  ref=lake['data']['routes'][key];a=next(s for s in r['stops']if s['name']=='富士山');b=next(s for s in ref['stops']if s['name']=='富士山');old=h.cumulative(r['points']);refd=h.cumulative(ref['points']);oldp=np.array(r['points']);gh=np.array(p['models']['groundHeights'][key]);height=gh+np.array(r['trackOffsets']);oldw=h.ecef(oldp[:,0],oldp[:,1],height)
  # Same direction label on both segments reverses physically at Fujisan.
  target_d=b['distance']+a['distance']-old;rp=np.array(ref['points']);refh=np.array(lake['models']['groundHeights'][key])+np.array(ref['trackOffsets']);target=np.stack([np.interp(target_d,refd,rp[:,i])for i in [0,1]],axis=1);targeth=np.interp(target_d,refd,refh)
  u=np.clip((600-np.abs(old-a['distance']))/420,0,1);w=u*u*(3-2*u);newp=oldp+(target-oldp)*w[:,None];newh=height+(targeth-height)*w;neww=h.ecef(newp[:,0],newp[:,1],newh);new=h.cumulative(newp)
  fields[key]={'oldw':oldw,'neww':neww,'tree':cKDTree(oldw),'old':old,'new':new}
  r['points']=newp.tolist();r['trackOffsets']=(newh-gh).tolist();r['length']=float(new[-1]);r['groundHeights']=gh.tolist()
  for st in r['stops']:st['lon'],st['lat']=newp[st['index']].tolist();st['distance']=float(new[st['index']])
  for k in ['stationSpeeds','physicalStops']:
   for st in r.get(k,[]):
    canonical=next((x for x in r['stops']if x['code']==st['code']),None)
    if canonical:
     st['distance']=canonical['distance']
     if 'index' in st:st['index']=canonical['index']
 def move(value,key):
  shape=np.asarray(value).shape;v=np.asarray(value).reshape(-1,3);f=fields[key];_,nearest=f['tree'].query(v);cand=np.stack((np.clip(nearest-1,0,len(f['oldw'])-2),np.clip(nearest,0,len(f['oldw'])-2)),axis=1);a=f['oldw'][cand];ab=f['oldw'][cand+1]-a;diff=v[:,None,:]-a;t=np.clip((diff*ab).sum(2)/np.maximum((ab*ab).sum(2),1e-9),0,1);pick=np.argmin(((diff-t[:,:,None]*ab)**2).sum(2),axis=1);idx=cand[np.arange(len(v)),pick];t=t[np.arange(len(v)),pick,None]
  def basis(points):
   fw=points[idx+1]-points[idx];fw/=np.linalg.norm(fw,axis=1)[:,None];center=points[idx]*(1-t)+points[idx+1]*t;up=center/np.linalg.norm(center,axis=1)[:,None];left=np.cross(up,fw);left/=np.linalg.norm(left,axis=1)[:,None];up=np.cross(fw,left);return center,fw,left,up
  oldc,of,ol,ou=basis(f['oldw']);newc,nf,nl,nu=basis(f['neww']);offset=v-oldc;result=newc+np.sum(offset*of,axis=1)[:,None]*nf+np.sum(offset*ol,axis=1)[:,None]*nl+np.sum(offset*ou,axis=1)[:,None]*nu
  return result.reshape(shape)
 def meta(v,key,label=''):
  if isinstance(v,dict):return {k:(x if k in ['groups','fallback','roof']else meta(x,key,k))for k,x in v.items()}
  if isinstance(v,list):
   if len(v)==3 and all(isinstance(x,(int,float))for x in v)and np.linalg.norm(v)>1e6:return move(v,key).tolist()
   return [meta(x,key,label)for x in v]
  if label in ['distance','start','end']and isinstance(v,(float,int)):return float(np.interp(v,fields[key]['old'],fields[key]['new']))
  return v
 def mesh(model,key):
  if 'origin'not in model:return model
  origin=np.array(model['origin']);neworigin=move(origin,key);out=meta(model,key)
  for group in out.get('groups',[]):
   local=np.frombuffer(base64.b64decode(group['positions']),dtype='<i2'if group.get('positionScale')else'<f4').astype(float).reshape(-1,3)*group.get('positionScale',1);moved=move(local+origin,key)-neworigin
   if np.allclose(local,moved,atol=.0001):continue
   scale=max(.005,float(np.max(np.abs(moved)))/32760);group['positions']=base64.b64encode(np.rint(moved/scale).astype('<i2').tobytes()).decode();group['positionScale']=scale
   idx=np.frombuffer(base64.b64decode(group['indices']),dtype='<u4'if group.get('indexType')==32 else'<u2').reshape(-1,3);normal=np.zeros_like(moved);aa,bb,cc=moved[idx[:,0]],moved[idx[:,1]],moved[idx[:,2]];n=np.cross(bb-aa,cc-aa)
   for col in range(3):np.add.at(normal,idx[:,col],n)
   normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-9);group['normals']=base64.b64encode(np.rint(normal*127).clip(-127,127).astype('i1').tobytes()).decode()
  out['radius']=float(model.get('radius',500)+np.max(np.linalg.norm(fields[key]['neww']-fields[key]['oldw'],axis=1))+5)
  for k in ['roof','fallback']:
   if isinstance(model.get(k),dict):out[k]=mesh(model[k],key)
  return out
 m=p['models'];m['tracks']=[mesh(x,x['direction'])if x.get('direction')in fields else x for x in m['tracks']];m['stations']=[mesh(x,x['direction'])if x.get('direction')in fields else x for x in m['stations']]
 if isinstance(m.get('masts'),dict):
  for key in fields:
   if key in m['masts']:m['masts'][key]=meta(m['masts'][key],key)
 m['switchbackRevision']=MARK;m['assetRevision']=str(m.get('assetRevision',''))+'-switchback1';path.write_bytes(gzip.compress(json.dumps(p,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));print('Aligned Fujisan switchback rails, stations, heights and distance metadata')
if __name__=='__main__':main()
