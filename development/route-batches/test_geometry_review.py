from pathlib import Path
import gzip,json,hashlib,math,unittest
import numpy as np
import base64
HERE=Path(__file__).parent;DEST=HERE/'batch-001'
def unpack(path):return json.loads(gzip.decompress((DEST/path).read_bytes()))
def distances(points):
 return np.r_[0,np.cumsum([math.hypot((b[0]-a[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(b[1]-a[1])*111320)for a,b in zip(points,points[1:])])]
class GeometryReview(unittest.TestCase):
 def test_collectors_and_specific_bogies_follow_the_manufacturer_review(self):
  stock=unpack('vehicles/e353-draft.json.gz')
  def vertices(model):return np.concatenate([np.frombuffer(base64.b64decode(g['positions']),dtype='<i2').reshape(-1,3)*g.get('positionScale',.001)for g in model['groups']])
  self.assertEqual(stock['pantographCars'],[5,7,10]);active=vertices(stock['pantograph']);self.assertGreater(active[:,0].min(),5);self.assertAlmostEqual(active[:,2].max(),5.45)
  self.assertEqual(stock['doorCentresByCar'],{'4':[-7.65,6.15],'5':[-8.65],'6':[-8.65],'7':[8.65],'8':[-8.65],'9':[-6.2],'10':[8.65],'11':[-8.65],'12':[6.15]})
  both=vertices(stock['pantograph5']);spare=both[both[:,0]<0];self.assertGreater(len(spare),0);self.assertLessEqual(spare[:,2].max(),3.95);self.assertGreaterEqual(spare[:,2].min(),3.54)
  for kind in ['DT81A','DT82A','TR265','TR265A','TR265B']:
   model=stock['bogie'+kind];points=vertices(model);self.assertTrue(np.isfinite(points).all());self.assertGreater(len(points),360)
   for g in model['groups']:
    count=len(base64.b64decode(g['positions']))//6;indices=np.frombuffer(base64.b64decode(g['indices']),dtype='<u2');self.assertLess(indices.max(),count)
  for key in ['azusa','kaiji']:
   for formation in unpack(f'games/{key}.json.gz')['data']['train']['formations'].values():
    for car in formation:
     self.assertEqual(len(car['bogieModels']),2)
     if car['number']in[4,12]:self.assertEqual(car['bogieModels'],['bogieTR265','bogieTR265A']if car['reverse']else['bogieTR265A','bogieTR265'])
     else:self.assertEqual(car['bogieModels'],['bogieDT82A']*2 if car['number']in[5,7,10]else['bogieDT81A']*2 if car['number']in[6,11]else['bogieTR265B']*2 if car['number']==8 else['bogieTR265A']*2)
 def test_manufacturer_facts_and_directional_formation(self):
  stock=unpack('vehicles/e353-draft.json.gz');d=stock['manufacturerDimensions'];self.assertEqual(d['bogieCentres'],14.15);self.assertEqual(d['headPitch'],21.43);self.assertEqual(d['roofHeight'],3.54);self.assertEqual(d['floorHeight'],1.13)
  for key in ['azusa','kaiji']:
   train=unpack(f'games/{key}.json.gz')['data']['train'];self.assertAlmostEqual(train['totalLength'],186.36);self.assertFalse(train['verified'])
   for direction,formation in train['formations'].items():
    self.assertEqual([c['number']for c in formation],list(range(12,3,-1))if direction=='forward'else list(range(4,13)));self.assertEqual(sum(len(c['doorCentres'])for c in formation),10);self.assertEqual(sorted(c['number']for c in formation if c['pantograph']),[5,7,10]);self.assertTrue(all(c['bogieHalfSpan']==7.075 for c in formation))
 def test_estimated_profiles_are_bounded_and_keep_source_bindings(self):
  for key in ['azusa','kaiji']:
   p=unpack(f'alignments/{key}-rail-profile.json.gz');a=unpack(f'alignments/{key}.json.gz');x=distances(a['points']);self.assertFalse(p['surveyedRailHeights']);self.assertFalse(p['releaseReady']);self.assertLessEqual(max(abs(np.diff(p['railHeights'])/np.diff(x))),.034000001);self.assertGreater(max(s['maxTerrainAboveRail']for s in p['structures']if s['kind']=='tunnel'),400 if key=='kaiji'else 400)
   for file,sha in p['inputHashes'].items():self.assertEqual(hashlib.sha256((DEST/file).read_bytes()).hexdigest(),sha)
 def test_shared_corridor_has_shared_elevation(self):
  a=unpack('alignments/azusa.json.gz');b=unpack('alignments/kaiji.json.gz');pa=unpack('alignments/azusa-rail-profile.json.gz');pb=unpack('alignments/kaiji-rail-profile.json.gz');self.assertTrue(np.allclose(pb['railHeights'],np.interp(distances(b['points']),distances(a['points']),pa['railHeights']),atol=1e-8))
 def test_reviewed_tunnel_fragments_do_not_leave_deep_open_trenches(self):
  review=json.loads((DEST/'sources/tunnel-fragment-review.json').read_text())
  self.assertFalse(review['surveyedPortalPositions'])
  for key in ['azusa','kaiji']:
   profile=unpack(f'alignments/{key}-rail-profile.json.gz');alignment=unpack(f'alignments/{key}.json.gz');x=distances(alignment['points'])
   tunnels=[r for r in profile['structures']if r['kind']=='tunnel']
   for probe in [48200,61440,65590]:self.assertTrue(any(r['start']<=probe<=r['end']for r in tunnels),(key,probe))
   deep=[float(d)for d,h in zip(x,profile['trackOffsets'])if h< -5 and not any(r['start']-25<=d<=r['end']+25 for r in profile['structures']if r['kind']in ['tunnel','underground','snow-shed'])]
   self.assertEqual(deep,[],(key,deep))
   accepted=next(r for r in review['routes']if r['id']==key)['acceptedFragments']
   self.assertEqual(len(accepted),9)
   self.assertTrue(all(r['rtCode']=='40201000121'for r in accepted))
 def test_platform_map_review_never_invents_assignment_verification(self):
  review=json.loads((DEST/'sources/priority-platform-review.json').read_text());self.assertEqual(len(review['stations']),62);self.assertTrue(all(not r['assignmentVerifiedByMapAlone']for r in review['stations']))
  for key in ['azusa','kaiji']:
   for route in unpack(f'games/{key}.json.gz')['data']['routes'].values():
    self.assertTrue(all(not s['platformGeometryVerified']for s in route['physicalStops']))
    for stop in route['stops']:
     if stop.get('reportedPlatform')is None:self.assertFalse(stop['platformSideVerified'])
 def test_strict_scene_regression_matches_current_inputs(self):
  r=json.loads((DEST/'geometry-review-diagnostics.json').read_text());self.assertTrue(r['pass'],r.get('fatal'));self.assertEqual(r['errors'],[]);self.assertFalse(r['physicalGPU']);self.assertFalse(r['releaseReady'])
  for file,sha in r['inputHashes'].items():self.assertEqual(hashlib.sha256((DEST/file).read_bytes()).hexdigest(),sha)
  models=[row for row in r['runs']if row['kind']=='station-models'];self.assertEqual(sum(row['stations']for row in models),212);self.assertTrue(all(row['cacheSize']<=32 and row['maxGradePerMille']<35 for row in models))
  scenes=[row for row in r['runs']if row['kind']!='station-models'];self.assertEqual(len(scenes),16)
  for row in scenes:
   self.assertTrue(row['pass']);self.assertEqual(row['glError'],0);self.assertLessEqual(row['clippingPolygons'],100)
   if row['kind'].startswith('bridge'):self.assertTrue(row['tilesLoaded']);self.assertFalse(row['clippingEnabled'])
 def test_unreviewed_work_blocks_publication(self):
  status=json.loads((DEST/'geometry-review-status.json').read_text());self.assertFalse(status['requestedChecksComplete']);self.assertFalse(status['releaseReady']);self.assertFalse(status['public']);self.assertGreater(len(status['remaining']),0)
  m=json.loads((DEST/'manifest.json').read_text());self.assertEqual(m['completedGames'],0)
  for job in m['jobs'][:2]:self.assertEqual(job['qualityGates']['elevationTunnelAndBridge'],'pending');self.assertFalse(job['releaseReady'])
if __name__=='__main__':unittest.main()
