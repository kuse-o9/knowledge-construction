"""Align the existing game's final Fujisan approach with the lake-segment station.
This edits approximate game geometry; it does not claim surveyed track accuracy.
Keeps station count and model topology, deforms only the final 1 km approach.
"""
from pathlib import Path
import gzip,json,base64,math,copy
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
A=6378137.;E2=6.69437999014e-3

def ecef(lon,lat,height):
 lon=np.radians(lon);lat=np.radians(lat);N=A/np.sqrt(1-E2*np.sin(lat)**2)
 return np.stack(((N+height)*np.cos(lat)*np.cos(lon),(N+height)*np.cos(lat)*np.sin(lon),(N*(1-E2)+height)*np.sin(lat)),axis=-1)
def geographic(x):
 x=np.asarray(x);lon=np.arctan2(x[...,1],x[...,0]);r=np.hypot(x[...,0],x[...,1]);lat=np.arctan2(x[...,2],r*(1-E2))
 for _ in range(7):
  N=A/np.sqrt(1-E2*np.sin(lat)**2);height=r/np.cos(lat)-N;lat=np.arctan2(x[...,2],r*(1-E2*N/(N+height)))
 return np.stack((np.degrees(lon),np.degrees(lat)),axis=-1)
def cumulative(points):
 p=np.asarray(points);d=p[1:]-p[:-1];length=np.hypot(d[:,0]*111320*np.cos(np.radians((p[1:,1]+p[:-1,1])/2)),d[:,1]*111320)
 return np.r_[0,np.cumsum(length)]

def main():
 path=ROOT/'chuo-fuji.bin';f=json.loads(gzip.decompress(path.read_bytes()));lake=json.loads(gzip.decompress((ROOT/'chuo-lake.bin').read_bytes()))
 reverse=f['data']['routes']['reverse'];last=reverse['stops'][-1];target=lake['data']['routes']['reverse']['stops'][0]
 if np.hypot((last['lon']-target['lon'])*90400,(last['lat']-target['lat'])*111200)<.5:print('Fujisan already aligned');return
 old_coordinate=[last['lon'],last['lat']]
 old_points=np.array(reverse['points']);old_dist=cumulative(old_points);anchor=last['distance'];start=anchor-1000
 old_h=f['models']['groundHeights']['reverse'][last['index']]+reverse['trackOffsets'][last['index']]
 target_r=lake['data']['routes']['reverse'];target_h=lake['models']['groundHeights']['reverse'][target['index']]+target_r['trackOffsets'][target['index']]
 origin=ecef(last['lon'],last['lat'],old_h);delta=ecef(target['lon'],target['lat'],target_h)-origin
 lon=math.radians(last['lon']);lat=math.radians(last['lat']);east=np.array([-math.sin(lon),math.cos(lon),0]);north=np.array([-math.sin(lat)*math.cos(lon),-math.sin(lat)*math.sin(lon),math.cos(lat)])
 tail=np.where(old_dist>=start-40)[0];world=ecef(old_points[tail,0],old_points[tail,1],np.full(len(tail),old_h));line=np.stack(((world-origin)@east,(world-origin)@north),axis=1);v=line[1:]-line[:-1];lens=(v*v).sum(axis=1)
 def weights(points):
  ps=np.asarray(points).reshape(-1,3);xy=np.stack(((ps-origin)@east,(ps-origin)@north),axis=1);diff=xy[:,None,:]-line[None,:-1,:];t=np.clip((diff*v[None,:,:]).sum(axis=2)/np.maximum(lens,1e-9),0,1);separation=diff-t[:,:,None]*v[None,:,:];ix=np.argmin((separation*separation).sum(axis=2),axis=1);along=old_dist[tail[ix]]+t[np.arange(len(ix)),ix]*(old_dist[tail[ix+1]]-old_dist[tail[ix]]);u=np.clip((along-start)/1000,0,1);return u*u*(3-2*u)
 def deform(points,constant=None):
  x=np.asarray(points);shape=x.shape;x=x.reshape(-1,3);w=weights(x) if constant is None else np.full(len(x),constant);return (x+w[:,None]*delta).reshape(shape)
 def metadata(value,constant=None):
  if isinstance(value,dict):return {k:(v if k=='groups' else metadata(v,constant))for k,v in value.items()}
  if isinstance(value,list):
   if len(value)==3 and all(isinstance(n,(int,float)) for n in value) and np.linalg.norm(value)>1e6:return deform(value,constant).tolist()
   return [metadata(v,constant)for v in value]
  return value
 def mesh(model,constant=None):
  if 'origin' not in model:return model
  old_origin=np.array(model['origin']);new_origin=deform(old_origin,constant);result=metadata(model,constant)
  if constant is None:
   for group in result.get('groups',[]):
    dtype='<i2' if group.get('positionScale') else '<f4';local=np.frombuffer(base64.b64decode(group['positions']),dtype=dtype).astype(float).reshape(-1,3)*group.get('positionScale',1);moved=deform(local+old_origin)-new_origin
    if np.allclose(local,moved,atol=.0001):continue
    group['positions']=base64.b64encode(moved.astype('<f4').tobytes()).decode();group.pop('positionScale',None)
    indices=np.frombuffer(base64.b64decode(group['indices']),dtype='<u4' if group.get('indexType')==32 else '<u2').reshape(-1,3);normals=np.zeros_like(moved);a,b,c=moved[indices[:,0]],moved[indices[:,1]],moved[indices[:,2]];n=np.cross(b-a,c-a)
    for column in range(3):np.add.at(normals,indices[:,column],n)
    norm=np.linalg.norm(normals,axis=1);normals/=np.maximum(norm[:,None],1e-9);group['normals']=base64.b64encode(np.rint(normals*127).clip(-127,127).astype('i1').tobytes()).decode()
   if result.get('radius'):result['radius']+=float(np.linalg.norm(delta))
  # Update geographic labels from the transformed model origin.
  if 'lon' in result and 'lat' in result:result['lon'],result['lat']=geographic(new_origin).tolist()
  return result
 old_cums={k:cumulative(r['points'])for k,r in f['data']['routes'].items()};new_cums={}
 for direction,r in f['data']['routes'].items():
  p=np.array(r['points']);hh=np.array(f['models']['groundHeights'][direction]);offset=np.array(r['trackOffsets']);xyz=ecef(p[:,0],p[:,1],hh+offset);w=weights(xyz);moved=deform(xyz);new_points=geographic(moved);r['points']=new_points.tolist();new_cums[direction]=cumulative(new_points);r['length']=float(new_cums[direction][-1]);f['models']['groundHeights'][direction]=(hh+(target_h-old_h)*w).tolist()
  for s in r['stops']:
   s['lon'],s['lat']=new_points[s['index']].tolist();s['distance']=float(new_cums[direction][s['index']])
 def remap(direction,d):return float(np.interp(d,old_cums[direction],new_cums[direction]))
 tracks=[]
 for m in f['models']['tracks']:
  # Meshes distant from the final approach are left byte-for-byte unchanged.
  near=m['end']>start-400 if m['direction']=='reverse' else m['start']<old_cums['forward'][-1]-start+400
  out=mesh(m) if near else copy.deepcopy(m)
  for key in ['start','end']:out[key]=remap(m['direction'],m[key])
  tracks.append(out)
 f['models']['tracks']=tracks
 stations=[]
 for m in f['models']['stations']:
  station=next(s for s in f['data']['routes'][m['direction']]['stops']if s['code']==m['code']);w=1. if m['code']=='FJ16' else 0.;out=mesh(m,w) if w else copy.deepcopy(m);out.update(lon=station['lon'],lat=station['lat'],distance=station['distance']);stations.append(out)
 f['models']['stations']=stations
 f['models']['masts']=metadata(f['models']['masts'])
 f['models']['stationArchitecture']={k:mesh(v,1.) if k=='FJ16' else v for k,v in f['models']['stationArchitecture'].items()}
 f['models']['assetRevision']=str(f['models'].get('assetRevision',''))+'-fujisan-align1'
 f['data']['sourceNote']=str(f['data'].get('sourceNote',''))+' 富士山駅の区間接続位置を河口湖区間と統一。最後の1kmの線路模型はゲーム用の補間。'
 compressed=gzip.compress(json.dumps(f,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0);path.write_bytes(compressed)
 report={'station':'富士山','oldCoordinate':old_coordinate,'targetCoordinate':[target['lon'],target['lat']],'displacementMetres':float(np.linalg.norm(delta)),'approachMetres':1000,'trackAccuracy':'game interpolation, not surveyed','newPacketBytes':len(compressed)}
 (ROOT/'development/through-running/fujisan-alignment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(report)
if __name__=='__main__':main()
