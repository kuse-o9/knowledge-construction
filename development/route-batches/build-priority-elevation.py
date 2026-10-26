"""Estimated game rail elevation; never a survey or released operating profile."""
from pathlib import Path
import gzip,json,hashlib,math,argparse
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix
from scipy.ndimage import gaussian_filter1d
HERE=Path(__file__).parent; DEST=HERE/'batch-001'
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',type=Path,default=DEST/'generated-rail-profiles');OUTPUT=parser.parse_args().output_dir;OUTPUT.mkdir(parents=True,exist_ok=True)
fragment_path=DEST/'sources/tunnel-fragment-review.json'
fragment_review=json.loads(fragment_path.read_text())
def load(p):return json.loads(gzip.decompress(p.read_bytes()))
def ds(points):
 out=[0.]
 for a,b in zip(points,points[1:]):out.append(out[-1]+math.hypot((b[0]-a[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(b[1]-a[1])*111320))
 return np.array(out)
master=None
for key in ['azusa','kaiji']:
 source=DEST/'alignments'/f'{key}.json.gz'; a=load(source); x=ds(a['points']); ground=np.array(a['groundHeights']); target=ground+.8
 auditpath=DEST/'reference-paths'/f'{key}-gsi-structures-audit.json'; audit=json.loads(auditpath.read_text()); structures=[]
 reviewed=next(r for r in fragment_review['routes']if r['id']==key)
 if reviewed['auditSha256']!=hashlib.sha256(auditpath.read_bytes()).hexdigest():raise ValueError('Tunnel review source changed')
 # A fixed 40 m matcher split real corridor tunnels where the two source
 # maps disagree. Restore only individually inspected source fragments.
 ranges=[dict(r)for r in audit['ranges']]+[dict(r)for r in reviewed['acceptedFragments']]
 merged=[]
 for r in sorted(ranges,key=lambda r:(r['kind'],r['start'])):
  if merged and merged[-1]['kind']==r['kind']and r['start']<=merged[-1]['end']+.001:
   merged[-1]['end']=max(merged[-1]['end'],r['end'])
  else:merged.append(dict(r))
 for r in merged:
  if r['kind'] not in ['bridge-or-viaduct','tunnel','underground','snow-shed']:continue
  lo,hi=r['start'],r['end'];mask=(x>=lo)&(x<=hi)
  target[mask]=np.interp(x[mask],[lo,hi],np.interp([lo,hi],x,ground)+.8)
  structures.append({'kind':r['kind'],'start':lo,'end':hi,'railHeightVerified':False,'positionReview':'pending'})
 if master is None:
  n=len(x);A=lil_matrix((2*(n-1)+2*n,2*n));b=np.zeros(A.shape[0]);row=0
  for i in range(n-1):
   for sign in [1,-1]:A[row,i]=-sign;A[row,i+1]=sign;b[row]=.0328*(x[i+1]-x[i]);row+=1
  for i in range(n):
   A[row,i]=1;A[row,n+i]=-1;b[row]=target[i];row+=1
   A[row,i]=-1;A[row,n+i]=-1;b[row]=-target[i];row+=1
  sol=linprog(np.r_[np.zeros(n),np.ones(n)],A_ub=A.tocsr(),b_ub=b,bounds=[(None,None)]*n+[(0,None)]*n,method='highs')
  if not sol.success:raise ValueError(sol.message)
  fine=np.linspace(0,x[-1],int(x[-1]/5)+1); smooth=gaussian_filter1d(np.interp(fine,x,sol.x[:n]),7,mode='nearest');rail=np.interp(x,fine,smooth);master=(x,rail)
 else:rail=np.interp(x,*master)
 for r in structures:
  sample=np.linspace(r['start'],r['end'],max(2,int((r['end']-r['start'])/5)))
  delta=np.interp(sample,x,rail-ground)
  r.update(startHeight=float(np.interp(r['start'],x,rail)),endHeight=float(np.interp(r['end'],x,rail)),maxTerrainAboveRail=float(max(0,-min(delta))),maxRailAboveTerrain=float(max(0,max(delta))))
 profile={'id':key,'railHeights':rail.tolist(),'trackOffsets':(rail-ground).tolist(),'structures':structures,'surveyedRailHeights':False,'releaseReady':False,'method':'GSI-classified span endpoint interpolation; L1 terrain fit constrained to 32.8 per mille before lateral station offsets (under34 after offsets) and smoothed over 35 m. Kaiji shares Azusa prefix. Game estimate only.','limitations':['Ground samples and tile-clipped structures are not surveyed rail elevations or portals.','Stations, bridge clearances and portal heights require individual review.'],'inputHashes':{str(source.relative_to(DEST)):hashlib.sha256(source.read_bytes()).hexdigest(),str(auditpath.relative_to(DEST)):hashlib.sha256(auditpath.read_bytes()).hexdigest()},'diagnostics':{'maxGradePerMille':float(max(abs(np.diff(rail)/np.diff(x)))*1000),'originalGroundMaxGradePerMille':float(max(abs(np.diff(ground)/np.diff(x)))*1000)}}
 profile['inputHashes'][str(fragment_path.relative_to(DEST))]=hashlib.sha256(fragment_path.read_bytes()).hexdigest()
 out=OUTPUT/f'{key}-rail-profile.json.gz';out.write_bytes(gzip.compress(json.dumps(profile,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));print(key,profile['diagnostics'])
