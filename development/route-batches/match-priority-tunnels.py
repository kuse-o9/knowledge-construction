"""Match acquired OSM tunnel ways to the MLIT reference paths for manual review.
No rail heights are inferred and no route is released by this script.
"""
from pathlib import Path
import gzip,json,math
import numpy as np
from scipy.spatial import cKDTree
DEST=Path(__file__).parent/'batch-001'
source=json.loads(gzip.decompress((DEST/'sources/chuo-tunnels.json.gz').read_bytes()))
for key in ['azusa','kaiji']:
 p=json.loads(gzip.decompress((DEST/'reference-paths'/(key+'.json.gz')).read_bytes()));xy=np.array(p['points'])*[90400,111200];a=xy[:-1];v=xy[1:]-a;l2=(v*v).sum(axis=1);length=np.sqrt(l2);cumulative=np.r_[0,np.cumsum(length)];tree=cKDTree(a+v*.5);matched=[];uncertain=[]
 for way in source['data']['elements']:
  raw=way.get('geometry',[])
  if len(raw)<2:continue
  ps=np.array([[x['lon'],x['lat']]for x in raw])*[90400,111200];_,ix=tree.query(ps,k=min(32,len(v)));diff=ps[:,None,:]-a[ix];t=np.clip((diff*v[ix]).sum(axis=2)/np.maximum(l2[ix],1e-12),0,1);errors=np.linalg.norm(diff-t[:,:,None]*v[ix],axis=2);pick=np.argmin(errors,axis=1);rows=np.arange(len(ps));indices=ix[rows,pick];distance=errors[rows,pick];along=cumulative[indices]+length[indices]*t[rows,pick];near=distance<35
  if not near.any():continue
  originalLength=float(np.linalg.norm(np.diff(ps,axis=0),axis=1).sum());span=float(along.max()-along.min());direction=ps[-1]-ps[0];heading=v[indices[len(indices)//2]];agreement=abs(float(direction@heading))/(max(np.linalg.norm(direction)*np.linalg.norm(heading),1e-9))
  record={'osmWay':way['id'],'name':way.get('tags',{}).get('name'),'tags':way.get('tags',{}),'start':float(along.min()),'end':float(along.max()),'maxMatchingErrorMetres':float(distance.max()),'matchedVertexFraction':float(near.mean()),'headingAgreement':agreement,'sourceWayLength':originalLength,'review':'pending'}
  if near.mean()>=.8 and span>8 and .65<span/max(originalLength,1)<1.35 and agreement>.75:matched.append(record)
  else:uncertain.append(record)
 matched.sort(key=lambda r:r['start']);groups=[]
 for item in matched:
  if groups and item['start']<=groups[-1]['end']+20:groups[-1]['end']=max(groups[-1]['end'],item['end']);groups[-1]['ways'].append(item['osmWay'])
  else:groups.append({'start':item['start'],'end':item['end'],'ways':[item['osmWay']],'railHeight':'unresolved','review':'pending'})
 report={'id':key,'stage':'tunnel-candidates-matched','playable':False,'releaseReady':False,'source':source['source'],'license':'ODbL 1.0','copyright':'https://www.openstreetmap.org/copyright','credit':'© OpenStreetMap contributors; matched to processed MLIT N02 reference geometry','ranges':groups,'matchedWays':matched,'uncertainNearbyWays':uncertain,'unresolvedBridges':'Acquisition timed out on both public Overpass endpoints; not inferred from terrain.','limitations':['Candidate matching is not approval of a tunnel or surveyed portal location','Terrain height must not be used as tunnel rail height','Every range still requires source/geometry and visual checks']}
 (DEST/'reference-paths'/(key+'-structures-audit.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'id':key,'tunnelRanges':len(groups),'matchedWays':len(matched),'uncertainNearbyWays':len(uncertain)}))
