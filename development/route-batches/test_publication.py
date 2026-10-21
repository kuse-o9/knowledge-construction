from pathlib import Path
import hashlib,importlib.util,json,tempfile,unittest

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('publisher',HERE/'prepare-publication.py');P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)

class Publication(unittest.TestCase):
 def fixture(self,root):
  path='rail-games/fixture/index.html';p=root/path;p.parent.mkdir(parents=True);p.write_text('<!doctype html><html lang="ja"><title>Fixture</title></html>');sha=hashlib.sha256(p.read_bytes()).hexdigest()
  job={'id':'fixture','name':'検査用','qualityGates':dict.fromkeys(P.gate.REQUIRED_GATES,'passed'),'entryPoint':path,'publication':{'operator':'TEST'},'releaseArtifacts':[{'path':path,'sha256':sha}],'validationReport':'report.json','expectedPhysicalStationCodes':['A','B']}
  report={'pass':True,'jobId':job['id'],'directions':['forward','reverse'],'physicalStationCodes':['A','B'],'stationCodesByDirection':{'forward':['A','B'],'reverse':['B','A']},'qualityGateResults':dict(job['qualityGates']),'testedArtifactHashes':{path:sha}};(root/'report.json').write_text(json.dumps(report));return {'batch':'fixture','jobs':[job]}
 def test_current_100_unfinished_jobs_produce_no_public_upload(self):
  m=json.loads((HERE/'batch-001/manifest.json').read_text());plan,_=P.prepare(m);self.assertEqual(plan['eligibleJobs'],[]);self.assertEqual(plan['uploads'],[]);self.assertFalse(plan['catalogChanged']);self.assertFalse(plan['deploymentComplete']);self.assertEqual(len(plan['blockedJobs']),100)
 def test_ready_subset_publishes_without_waiting_for_pending_job(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);m=self.fixture(root);m['jobs'].append({'id':'pending','qualityGates':{'render':'pending'}});plan,data=P.prepare(m,root);self.assertEqual(plan['eligibleJobs'],['fixture']);self.assertEqual(len(plan['blockedJobs']),1);self.assertTrue(plan['catalogChanged']);self.assertEqual(len(json.loads(data)['routes']),1)
 def test_rerun_is_idempotent_and_pending_upgrade_keeps_existing_release(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);m=self.fixture(root);_,data=P.prepare(m,root);(root/P.CATALOG).write_bytes(data);plan,_=P.prepare(m,root);self.assertFalse(plan['catalogChanged']);self.assertEqual(plan['uploads'],[])
   m['jobs'][0]['qualityGates']['softwareRendering']='pending';plan,data2=P.prepare(m,root);self.assertEqual(json.loads(data2),json.loads(data));self.assertEqual(plan['publicRoutes'],1);self.assertEqual(plan['uploads'],[])
 def test_tampered_game_cannot_enter_public_catalogue(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);m=self.fixture(root);(root/m['jobs'][0]['entryPoint']).write_text('changed');plan,_=P.prepare(m,root);self.assertEqual(plan['uploads'],[]);self.assertEqual(plan['eligibleJobs'],[])
 def test_existing_release_corruption_is_rejected_instead_of_silently_dropping_it(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);m=self.fixture(root);_,data=P.prepare(m,root);(root/P.CATALOG).write_bytes(data);(root/m['jobs'][0]['entryPoint']).unlink();self.assertRaises(ValueError,P.prepare,m,root)
 def test_public_paths_cannot_overwrite_existing_games_or_escape_repository(self):
  for path in ['index.html','chuo.html','shared/rail-signals.js','../game.html','rail-games/../index.html','rail-games/x/../../index.html','rail-games/x.html?x=1','rail-games/catalog.json','https://example.com/','rail-games\\x.html']:
   with self.subTest(path=path):self.assertRaises(ValueError,P.public_path,path)
 def test_removing_quality_gates_does_not_bypass_publication_checks(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);m=self.fixture(root);m['jobs'][0]['qualityGates']={};plan,_=P.prepare(m,root);self.assertEqual(plan['uploads'],[]);self.assertEqual(plan['eligibleJobs'],[])
 def test_one_direction_missing_a_station_cannot_pass(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);m=self.fixture(root);p=root/'report.json';r=json.loads(p.read_text());r['stationCodesByDirection']['reverse']=['A'];p.write_text(json.dumps(r));plan,_=P.prepare(m,root);self.assertEqual(plan['eligibleJobs'],[])

if __name__=='__main__':unittest.main()
