from pathlib import Path
import gzip,hashlib,json,re,unittest

HERE=Path(__file__).parent;DEST=HERE/'batch-001';ROOT=HERE.parents[1]

class IntegratedGames(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.base=json.loads(gzip.decompress(b''.join((ROOT/f'chuo-local-bundle-{i}.bin').read_bytes()for i in [0,1])))['html'];cls.common=json.loads(gzip.decompress((DEST/'games/common.json.gz').read_bytes()))
 def test_published_controls_and_mobile_shell_are_preserved(self):
  base=re.sub(r'<script\b[^>]*>.*?</script>','',self.base,flags=re.S);ids=set(re.findall(r'\bid="([^"]+)"',base))
  for key in ['azusa','kaiji']:
   html=(DEST/'games'/(key+'.html')).read_text();self.assertTrue(ids<=set(re.findall(r'\bid="([^"]+)"',html)));self.assertIn('development-banner',html);self.assertNotIn('E231',html);self.assertNotIn('E233',html);self.assertNotIn('/local/e231.html',html)
   for href in re.findall(r'href="([^"]+)"',html):
    if href.startswith(('https://','http://','#')):continue
    self.assertTrue((DEST/'games'/href.split('#')[0]).resolve().is_file(),href)
 def test_entry_and_shared_packets_are_bound_to_exact_versions(self):
  for key in ['azusa','kaiji']:
   html=(DEST/'games'/(key+'.html')).read_text();file=DEST/'games'/(key+'.json.gz');self.assertEqual(re.search(r'data-packet-sha="([a-f0-9]+)"',html)[1],hashlib.sha256(file.read_bytes()).hexdigest());packet=json.loads(gzip.decompress(file.read_bytes()))
   for file,field in [('common.json.gz','commonSha256'),('e353.json.gz','stockSha256')]:self.assertEqual(packet[field],hashlib.sha256((DEST/'games'/file).read_bytes()).hexdigest())
 def test_original_passenger_and_city_detail_was_not_reduced(self):
  base_models=json.JSONDecoder().raw_decode(self.base.split('window.RAIL_PREBUILT_MODELS=',1)[1])[0];base_city=json.JSONDecoder().raw_decode(self.base.split('window.RAIL_CITY_MODELS=',1)[1])[0]
  self.assertEqual(self.common['passengerModels'],base_models['passengerModels']);self.assertEqual(self.common['city'],base_city);self.assertEqual(self.common['baselineStationPassengerCount'],128)
  audio=re.findall(r'<script[^>]*>(.*?)</script>',self.base,re.S)[4];self.assertEqual((DEST/'games/rail-audio.js').read_text(),audio)
 def test_games_keep_physical_stations_separate_from_service_stops(self):
  for key,expected in [('azusa',64),('kaiji',42)]:
   packet=json.loads(gzip.decompress((DEST/'games'/(key+'.json.gz')).read_bytes()));self.assertFalse(packet['releaseReady'])
   for route in packet['data']['routes'].values():
    self.assertEqual(len(route['physicalStops']),expected);self.assertLess(len(route['stops']),expected);self.assertTrue({s['code']for s in route['stops']}<={s['code']for s in route['physicalStops']});self.assertEqual(len(route['points']),len(route['groundHeights']));self.assertFalse(route['operatingSpeedVerified']);self.assertGreater(route['stops'][0]['distance'],packet['data']['train']['totalLength'])
 def test_numerical_and_browser_results_match_the_current_game_packets(self):
  for name in ['integrated-running-diagnostics.json','integrated-game-diagnostics.json']:
   report=json.loads((DEST/name).read_text());self.assertTrue(report['pass']);self.assertFalse(report['releaseReady'])
   for path,sha in report['inputHashes'].items():self.assertEqual(hashlib.sha256((DEST/path).read_bytes()).hexdigest(),sha)
  browser=json.loads((DEST/'integrated-game-diagnostics.json').read_text());self.assertFalse(browser['physicalGPU']);self.assertFalse(browser['realTimeFullRoute']);self.assertEqual(browser['errors'],[]);self.assertEqual(len(browser['runs']),6)
  for run in browser['runs']:
   if run.get('softwareRendering'):self.assertTrue(run['scene']['webgl2']);self.assertEqual(run['scene']['error'],0)
 def test_development_games_are_not_counted_as_completed_or_published(self):
  manifest=json.loads((DEST/'manifest.json').read_text());self.assertEqual(manifest['completedGames'],0);self.assertEqual(manifest['playableGames'],0)
  for job in manifest['jobs'][:2]:self.assertFalse(job['releaseReady']);self.assertFalse(job['completed']);self.assertFalse(job['playable'])

if __name__=='__main__':unittest.main()
