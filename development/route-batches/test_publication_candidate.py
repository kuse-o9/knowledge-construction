"""Publishing must retain current candidate data and reject mixed versions."""
from pathlib import Path
import importlib.util, json, shutil, tempfile, unittest
HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('candidate_stage',HERE/'prepare-priority-candidate.py')
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
PRODUCTION=HERE.parents[2]/'app'
class CandidatePackaging(unittest.TestCase):
 def test_exact_current_runtime_and_guard_are_preserved(self):
  with tempfile.TemporaryDirectory(prefix='rail-stage-') as tmp:
   report=stage.stage(Path(tmp)/'out',PRODUCTION)
   self.assertEqual(len(report['assets']),15)
   self.assertTrue(report['sourceIntegrityVerified'])
   for row in report['assets']:
    relative=Path(row['path']).relative_to(stage.PUBLIC)
    self.assertEqual((Path(tmp)/'out'/row['path']).read_bytes(),(stage.CURRENT/relative).read_bytes())
   self.assertFalse(report['releaseReady'])
 def test_mixed_packet_is_rejected_before_staging(self):
  with tempfile.TemporaryDirectory(prefix='rail-corrupt-') as tmp:
   source=Path(tmp)/'source';shutil.copytree(stage.CURRENT/'games',source/'games',ignore=shutil.ignore_patterns('*.png'))
   (source/'games/azusa.json.gz').write_bytes(b'wrong version')
   with self.assertRaisesRegex(ValueError,'entry/packet mismatch'):
    stage.stage(Path(tmp)/'out',PRODUCTION,source)
if __name__=='__main__':unittest.main()
