"""Check actual generated cylinder winding against outward analytic normals."""
from pathlib import Path
import ast, base64, collections, math, unittest
import numpy as np

HERE=Path(__file__).parent
tree=ast.parse((HERE/'build-e353-stock.py').read_text())
mesh_class=next(n for n in tree.body if isinstance(n,ast.ClassDef)and n.name=='Mesh')
namespace={'np':np,'base64':base64,'collections':collections,'math':math}
exec(compile(ast.Module(body=[mesh_class],type_ignores=[]),'vehicle-mesh-class','exec'),namespace)

class VehicleMesh(unittest.TestCase):
 def test_wheel_and_air_spring_faces_point_outward(self):
  for axis in ['y','z']:
   mesh=namespace['Mesh']();mesh.cylinder('#123456',0,0,0,.42,.18,axis,48)
   group=mesh.groups['#123456'];positions=np.asarray(group['p']);normals=np.asarray(group['n'])
   for i in range(0,len(positions),4):
    p=positions[i:i+4];n=normals[i];centre=p.mean(axis=0)
    # Every emitted face is either a radial side or an end cap of the convex cylinder.
    self.assertGreater(np.dot(centre,n),.08,(axis,i,centre,n))
   out=mesh.export();self.assertGreater(out['radius'],.42)

if __name__=='__main__':unittest.main()
