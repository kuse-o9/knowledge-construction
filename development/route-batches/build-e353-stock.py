"""Build a separate E353 visual draft, not an E233 recolour or a release-ready asset.
Dimensions below are provisional modelling parameters until checked against drawings.
"""
from pathlib import Path
import base64,collections,gzip,json,math,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];DEST=ROOT/'development/route-batches/batch-001/vehicles';DEST.mkdir(exist_ok=True)
class Mesh:
 def __init__(self):self.groups=collections.defaultdict(lambda:{'p':[],'n':[],'i':[]})
 def quad(self,color,a,b,c,d):
  g=self.groups[color];normal=np.cross(np.array(b)-a,np.array(c)-a);length=np.linalg.norm(normal)
  if length<1e-10:return
  normal=(normal/length).tolist();start=len(g['p']);g['p']+=[a,b,c,d];g['n'] +=[normal]*4;g['i'] +=[start,start+1,start+2]
  if np.linalg.norm(np.cross(np.array(c)-a,np.array(d)-a))>1e-10:g['i'] +=[start,start+2,start+3]
 def box(self,color,x,y,z,dx,dy,dz):
  p=[[x+a*dx/2,y+b*dy/2,z+c*dz/2]for a,b,c in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
  for face in [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]:self.quad(color,*[p[i]for i in face])
 def loft(self,color,sections):
  rings=[]
  for x,width,top in sections:rings.append([[x,-width*.94,1.0],[x,-width,top-.45],[x,-width*.80,top],[x,width*.80,top],[x,width,top-.45],[x,width*.94,1.0]])
  for a,b in zip(rings,rings[1:]):
   for i in range(6):j=(i+1)%6;self.quad(color,a[i],b[i],b[j],a[j])
  for ring,reverse in [(rings[0],False),(rings[-1],True)]:
   center=np.mean(ring,axis=0).tolist()
   for i in range(6):
    a,b=ring[i],ring[(i+1)%6]
    self.quad(color,center,b,a,center)if reverse else self.quad(color,center,a,b,center)
 def export(self):
  out=[];allpoints=[]
  for color,g in self.groups.items():
   ps=np.asarray(g['p']);ns=np.asarray(g['n']);indices=np.asarray(g['i']);assert np.max(abs(ps))<32;assert len(ps)<65536
   out.append({'color':color,'positions':base64.b64encode(np.rint(ps*1000).astype('<i2').tobytes()).decode(),'positionScale':.001,'normals':base64.b64encode(np.rint(ns*127).astype('i1').tobytes()).decode(),'indices':base64.b64encode(indices.astype('<u2').tobytes()).decode(),'indexType':16});allpoints.extend(g['p'])
  return {'origin':[0,0,0],'radius':float(np.linalg.norm(np.asarray(allpoints),axis=1).max()+.2),'groups':out}
def car(head=False,tail=False,doors=None,green=False):
 m=Mesh();white='#e5e7e8';purple='#8066ad';glass='#172c39';blue='#183f64';dark='#333d43';middle=[(-10,1.46,3.54),(10,1.46,3.54)];nose=[(-10,1.46,4.04),(6.7,1.46,4.04),(8.7,1.30,3.94),(11,.66,2.78)]
 m.loft(white,nose if head else middle)
 m.box(dark,-.4,0,.96,19,2.70,.38)
 # Underfloor power/control/air equipment, not a painted body stripe.
 for x in [-7.7,-4.8,-1.8,1.3,4.5,7.4]:m.box('#46515a',x,0,.78,2.3,2.0,.45)
 for side in [-1,1]:
  m.box(purple,-1 if head else 0,side*1.473,1.62,17 if head else 19.9,.045,.52)
  m.box(blue,-1 if head else 0,side*1.475,3.32,17 if head else 19.9,.025,.12)
  # E353's end vestibules; no four-door commuter arrangement.
  doors=doors if doors is not None else ([6.15]if head else[8.65])
  for x in doors:
   m.box('#d5d9df',x,side*1.477,2.26,.96,.035,2.08)
   m.box(glass,x,side*1.477,2.65,.70,.025,.78)
   m.box('#bcc4cc',x+.43,side*1.479,2.06,.035,.025,1.94)
  for x in [-6.8,-5.0,-3.2,-1.4,.4,2.2,4.0,5.8]:
   m.box(glass,x,side*1.477,2.88,1.30,.035,.91)
   m.box('#aab4bb',x,side*1.4775,2.39,1.30,.018,.035)
  # Seat backs remain separate geometry behind the windows.
  for x in np.arange(-6.5,5.5,1.16 if green else .96):
   for y in [-1.08,-.53,.53,1.08]:m.box('#69705f'if green else'#a9a5a1',float(x),y,1.85,.14,.46,.86)
 for x in [-4.2,3.4]:
  m.box('#b9c2cb',x,0,3.675,2.8,1.9,.27)
  for dx in [-1,-.6,-.2,.2,.6,1]:m.box('#586675',x+dx,0,3.83,.09,1.65,.03)
 m.box('#d0d7dc',-10.05,0,2.50,.14,1.30,2.40)
 m.box(glass,-10.14,0,2.67,.06,.73,1.15)
 if head:
  # Sloped cab shield and distinct nose profile.
  m.quad(glass,[8.70,-.96,4.07],[10.25,-.78,3.34],[10.25,.78,3.34],[8.70,.96,4.07])
  m.box(purple,10.98,0,2.05,.15,1.13,.54)
  m.box(blue,11.08,0,1.66,.12,1.15,.20)
  for side in [-1,1]:
   m.box('#cf4942'if tail else '#fff1c4',11.12,side*.45,2.40,.10,.14,.67)
   m.box('#62747f',11.02,side*.43,1.30,.16,.17,.20)
  m.box('#3a444b',11.0,0,1.08,.36,.45,.23)
 return m.export()
# Existing compatible shared bogie/pantograph components; body and cab are new meshes.
s=json.loads(gzip.decompress(b''.join((ROOT/f'chuo-bundle-{i}.bin').read_bytes()for i in [0,1])))['html'];base=json.JSONDecoder().raw_decode(s.split('window.RAIL_PREBUILT_MODELS=',1)[1])[0]
stock={'id':'e353-visual-draft-v1','stage':'vehicle-model-draft','releaseReady':False,'officialFacts':{'series':'E353','maximumVehicleSpeedKmh':130,'composition':'9-car + 3-car sets','source':'https://www.jreast.co.jp/train/express/azusa_kaiji.html'},'provisionalModelParameters':{'middleBodyLength':20.0,'headBodyLength':21.0,'width':2.92,'height':3.54,'doorCentresMiddle':[8.65],'doorCentresHead':[6.15]},'pending':['Validate dimensions and bogie centres against official drawings','Match door positions to car number and platform stopping positions','Check nose, windows, pantograph/roof equipment placement in 3D','Visual validation in the common engine before release'],'train':car(),'trainHead':car(True),'trainTail':car(True,True),'bogie':base['bogie'],'pantograph':base['pantograph']}
# Manufacturer's 2015 pre-series table and drawing; not evidence of every 2026 detail.
review=json.loads((DEST/'e353-source-review.json').read_text())
stock['manufacturerDimensions']={**review['dimensions'],'source':review['archiveUrl'],'documentSha256':review['documentSha256'],'pages':[104,105],'scope':'2015 pre-series; 2026 production differences pending'}
stock['doorCentresByCar']={str(n):([-7.65,6.15]if n==4 else[6.15]if n==12 else[-8.65]if n==10 else[6.2]if n==9 else[8.65])for n in range(4,13)}
for n in range(4,13):
 if n in [4,12]:
  stock[f'car{n}Front']=car(True,False,stock['doorCentresByCar'][str(n)])
  stock[f'car{n}Tail']=car(True,True,stock['doorCentresByCar'][str(n)])
 else:stock[f'car{n}']=car(doors=stock['doorCentresByCar'][str(n)],green=n==9)
stock['train']=stock['car6'];stock['trainHead']=stock['car12Front'];stock['trainTail']=stock['car4Tail']
# Roof component is a retained draft, resized to the manufacturer body envelope.
def pantograph(folded=False,xoffset=-7):
 model=json.loads(json.dumps(base['pantograph']))
 for group in model['groups']:
  ps=np.frombuffer(base64.b64decode(group['positions']),dtype='<i2').reshape(-1,3).astype(float)*group.get('positionScale',.001)
  scale=(.32 if folded else 1.82)/1.03
  ps[:,0]+=xoffset;ps[:,2]=3.63+(ps[:,2]-4.15)*scale
  ns=np.frombuffer(base64.b64decode(group['normals']),dtype='i1').reshape(-1,3).astype(float);ns[:,2]/=scale;ns/=np.linalg.norm(ns,axis=1)[:,None]
  group['positions']=base64.b64encode(np.rint(ps*1000).astype('<i2').tobytes()).decode();group['positionScale']=.001;group['normals']=base64.b64encode(np.rint(ns*127).astype('i1').tobytes()).decode()
 return model
stock['pantograph']=pantograph();stock['pantograph5']=pantograph();stock['pantograph5']['groups']+=pantograph(True,7)['groups']
stock['pending']=['Verify 2026 service consist and production changes against the 2015 pre-series source','Door centres are scaled modelling coordinates, not surveyed exact positions','Detailed bogie, roof equipment and nose validation remains pending']
raw=json.dumps(stock,ensure_ascii=False,separators=(',',':')).encode();(DEST/'e353-draft.json.gz').write_bytes(gzip.compress(raw,mtime=0))
summary={'stage':stock['stage'],'releaseReady':False,'source':stock['officialFacts']['source'],'meshes':{k:{'groups':len(stock[k]['groups']),'vertices':sum(len(base64.b64decode(g['positions']))//6 for g in stock[k]['groups']),'triangles':sum(len(base64.b64decode(g['indices']))//6 for g in stock[k]['groups'])}for k in ['train','trainHead','trainTail']},'pending':stock['pending']};(DEST/'e353-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False))
