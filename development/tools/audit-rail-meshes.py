"""Validate edited model buffers and sample rail-to-centerline alignment.
This is a numerical geometry check, not a GPU/visual inspection.
"""
from pathlib import Path
import json,gzip,re,base64,importlib.util
from rail_model_io import load_yamanote
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('align',Path(__file__).with_name('align-chuo-fujisan.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
def value(s,key):return json.JSONDecoder().raw_decode(s.split(key,1)[1])[0]
def inspect(name,data,models,detailed=None):
 geometries={}
 for key,r in data['routes'].items():
  p=np.asarray(r['points']);world=h.ecef(p[:,0],p[:,1],np.array(models['groundHeights'][key])+np.array(r['trackOffsets']));geometries[key]=(world,cKDTree(world))
 count=0;vertices=0;rail_error=0;samples=0;endcap_error=0
 for m in detailed or models['tracks']+models['stations']:
  for group in m.get('groups',[]):
   p=np.frombuffer(base64.b64decode(group['positions']),dtype='<i2' if group.get('positionScale') else '<f4').astype(float).reshape(-1,3)*group.get('positionScale',1)
   idx=np.frombuffer(base64.b64decode(group['indices']),dtype='<u4' if group.get('indexType')==32 else '<u2');assert np.isfinite(p).all() and idx.size%3==0 and idx.max()<len(p),(name,m['id'])
   assert len(base64.b64decode(group['normals']))==p.size,(name,m['id'],'normal count')
   count+=1;vertices+=len(p)
   if group['color']!='#b8bec0' or 'start' not in m or m.get('direction') not in geometries:continue
   x=p[::max(1,len(p)//80)]+np.array(m['origin']);line,tree=geometries[m['direction']];_,nearest=tree.query(x);candidates=np.stack((np.clip(nearest-1,0,len(line)-2),np.clip(nearest,0,len(line)-2)),axis=1);a=line[candidates];v=line[candidates+1]-a;diff=x[:,None,:]-a;t=np.clip((diff*v).sum(axis=2)/np.maximum((v*v).sum(axis=2),1e-10),0,1);distance=np.sqrt(((diff-t[:,:,None]*v)**2).sum(axis=2).min(axis=1));interior=(nearest>0)&(nearest<len(line)-1);rail_error=max(rail_error,float(distance[interior].max()) if np.any(interior) else 0);endcap_error=max(endcap_error,float(distance[~interior].max()) if np.any(~interior) else 0);samples+=int(interior.sum())
 assert rail_error<1.4 and endcap_error<7,(name,rail_error,endcap_error)
 return {'meshGroups':count,'vertices':vertices,'railSamples':samples,'maximumRailDistanceFromCenterMeters':rail_error,'endpointCapMaximumDistanceMeters':endcap_error}
def main():
 report={}
 for name in ['chuo','chuo-local','keihin','sobu']:
  boot=(ROOT/(name+'.html')).read_text();m=re.search(r'<script id="game-bundle"[^>]*>(.*?)</script>',boot,re.S);prefix='sobu-data' if name=='sobu' else name+'-bundle';raw=base64.b64decode(m[1]) if m else b''.join((ROOT/(prefix+f'-{i}.bin')).read_bytes() for i in range(2));html=json.loads(gzip.decompress(raw))['html'];report[name]=inspect(name,value(html,'window.RAIL_DATA='),value(html,'window.RAIL_PREBUILT_MODELS='));print(name,report[name],flush=True)
 for name in ['west','ome','okutama','fuji','lake']:
  p=json.loads(gzip.decompress((ROOT/('chuo-'+name+'.bin')).read_bytes()));report[name]=inspect(name,p['data'],p['models']);print(name,report[name],flush=True)
 data=value((ROOT/'yamanote/rail-data.js').read_text(),'window.RAIL_DATA=');models=load_yamanote(ROOT);detailed=[m for p in (ROOT/'yamanote/models').glob('*.json') for m in json.loads(p.read_text())['models']];report['yamanote']=inspect('yamanote',data,models,detailed);print('yamanote',report['yamanote'],flush=True)
 (ROOT/'development/mesh-alignment-audit.json').write_text(json.dumps({'scope':'numerical only; GPU not verified','routes':report},indent=2))
if __name__=='__main__':main()
