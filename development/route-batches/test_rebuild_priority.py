"""Ensure rebuilding cannot discard the tested station geometry and speed tiers."""
from pathlib import Path
import gzip, json, subprocess, tempfile, unittest
HERE = Path(__file__).parent
CANDIDATE = HERE.parents[1] / 'rail-games/priority/batch-001/games'
class RebuildPriority(unittest.TestCase):
 def test_generated_routes_preserve_current_tested_geometry(self):
  with tempfile.TemporaryDirectory(prefix='rail-rebuild-') as out:
   subprocess.run(['python',str(HERE/'build-priority-games.py'),'--output-dir',out],check=True,capture_output=True,text=True)
   self.assertEqual((Path(out)/'model-builder.js').read_bytes(),(CANDIDATE/'model-builder.js').read_bytes())
   for key in ['azusa','kaiji']:
    old=json.loads(gzip.decompress((CANDIDATE/(key+'.json.gz')).read_bytes()))
    new=json.loads(gzip.decompress((Path(out)/(key+'.json.gz')).read_bytes()))
    for direction,route in old['data']['routes'].items():
     # Wording can clarify provenance; every numeric field and station must survive.
     expected={k:v for k,v in route.items() if k!='prototypeLimitsNote'}
     actual={k:v for k,v in new['data']['routes'][direction].items() if k!='prototypeLimitsNote'}
     self.assertEqual(actual,expected,(key,direction))
    self.assertEqual(new['data']['train'],old['data']['train'])
 def test_mesh_template_is_the_validated_candidate(self):
  self.assertEqual((HERE/'priority-model-builder.js').read_bytes(),(CANDIDATE/'model-builder.js').read_bytes())
if __name__=='__main__': unittest.main()
