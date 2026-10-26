from pathlib import Path
import gzip,json,base64,unittest,hashlib,re
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'rail-games/priority/batch-001/games'
class ExpressGeometry(unittest.TestCase):
 def test_doorway_apertures_not_hidden_by_body(self):
  stock=json.loads(gzip.decompress((BASE/'e353.json.gz').read_bytes()));cases=0
  for n in range(4,13):
   for suffix in (['Front','Tail'] if n in [4,12] else ['']):
    model=stock['car'+str(n)+suffix]
    triangles=[]
    for group in model['groups']:
     if group['color']!='#e5e7e8':continue
     points=np.frombuffer(base64.b64decode(group['positions']),dtype='<i2').reshape(-1,3)*group['positionScale'];indices=np.frombuffer(base64.b64decode(group['indices']),dtype='<u2').reshape(-1,3)
     for tri in points[indices]:
      if np.all(tri[:,1]>1.3)or np.all(tri[:,1]<-1.3):triangles.append(tri[:,[0,2]])
    for x in stock['doorCentresByCar'][str(n)]:
     for z in [1.4,2.,2.8]:
      target=np.array([x,z])
      for tri in triangles:
       a,b,c=tri;matrix=np.stack([b-a,c-a],axis=1)
       if abs(np.linalg.det(matrix))<1e-9:continue
       u,v=np.linalg.solve(matrix,target-a)
       self.assertFalse(u>1e-6 and v>1e-6 and u+v<1-1e-6,(n,x,z))
      cases+=1
  self.assertEqual(cases,39)
 def test_every_public_integrity_chain(self):
  for key in ['azusa','kaiji']:
   path=BASE/(key+'.json.gz');packet=json.loads(gzip.decompress(path.read_bytes()));html=(BASE/(key+'.html')).read_text();self.assertIn(hashlib.sha256(path.read_bytes()).hexdigest(),html);self.assertEqual(packet['stockSha256'],hashlib.sha256((BASE/'e353.json.gz').read_bytes()).hexdigest());self.assertEqual(packet['commonSha256'],hashlib.sha256((BASE/'common.json.gz').read_bytes()).hexdigest());self.assertIn('express-service.js?v=pa1',html)
if __name__=='__main__':unittest.main()
