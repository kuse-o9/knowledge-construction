from pathlib import Path
import gzip, importlib.util, json, math, unittest
HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('terminal_alignment',HERE/'terminal-alignment.py')
terminal=importlib.util.module_from_spec(spec);spec.loader.exec_module(terminal)
def packet(key):return json.loads(gzip.decompress((HERE/f'../../rail-games/priority/batch-001/games/{key}.json.gz').read_bytes()))['data']
class TerminalAlignment(unittest.TestCase):
 def test_platform_side_and_train_clearance_at_all_four_layouts(self):
  cases=0
  for key in ['azusa','kaiji']:
   data=packet(key)
   for route in data['routes'].values():
    for s in route['physicalStops']:
     if not s.get('terminalLayout'):continue
     l=s['terminalLayout'];platform=next(p for p in l['platforms']if l['platform']in p['numbers'])
     delta=platform['centre']-l['nativeTrackOffset']
     self.assertEqual(math.copysign(1,delta),s['side']*l['nativeDirection'],(key,s['name'],l['platform']))
     self.assertGreaterEqual(abs(delta)-platform['width']/2,data['train']['width']/2+.10)
     cases+=1
  self.assertEqual(cases,82)
 def test_shared_middle_track_and_separate_through_lines(self):
  kaiji=packet('kaiji');azusa=packet('azusa');centres=[]
  for direction,route in kaiji['routes'].items():
   s=next(s for s in route['physicalStops']if s['name']=='竜王')
   self.assertEqual(s['gamePlatformKey'],'2');self.assertEqual(s['terminalLayout']['nativeTrackOffset'],0)
   centres.append(route['points'][s['index']]);self.assertEqual(route['sharedTerminals'][0]['id'],'ryuo-platform2')
  self.assertEqual(centres[0],centres[1])
  for direction,route in azusa['routes'].items():
   s=next(s for s in route['physicalStops']if s['name']=='竜王')
   self.assertEqual(s['gamePlatformKey'],'1'if direction=='forward'else'3');self.assertNotEqual(route['points'][s['index']],centres[0]);self.assertEqual(route['sharedTerminals'],[])
 def test_turnouts_are_continuous_and_have_zero_endpoint_slope(self):
  for direction in ['forward','reverse']:
   for p in ['1','2','3']:
    f=lambda d:terminal.separation(6,d,direction,p)
    for d in [-800,-300,300,800]:
     self.assertLess(abs(f(d+.001)-f(d-.001))/.002,1e-6)
    self.assertEqual(f(801),6);self.assertTrue(all(math.isfinite(f(d))for d in range(-1000,1001)))
if __name__=='__main__':unittest.main()
