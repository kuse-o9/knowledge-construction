from pathlib import Path
import base64,gzip,hashlib,importlib.util,json,unittest
import numpy as np
HERE=Path(__file__).parent;DEST=HERE/'batch-001'
spec=importlib.util.spec_from_file_location('input_graph',HERE/'rail-input-graph.py');G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
class BatchInputs(unittest.TestCase):
 def test_all_100_jobs_bound_and_not_falsely_released(self):
  m=json.loads((DEST/'manifest.json').read_text());self.assertEqual(len(m['jobs']),100);self.assertEqual(len({j['id']for j in m['jobs']}),100);self.assertEqual([j['planNumber']for j in m['jobs'][:5]],[2,3,4,5,6]);self.assertEqual(m['sourceBindingProblems'],[])
  self.assertTrue(all(j['sourceCorridors']and not j['releaseReady']and not j['completed']and not j['playable']for j in m['jobs']))
 def test_every_payload_hash_preserves_geometry(self):
  index=json.loads((DEST/'sources/index.json').read_text());data=json.loads(gzip.decompress((DEST/'sources/national-corridors.json.gz').read_bytes()))['corridors']
  for row in index['corridors']:
   d=data[row['payloadKey']];packed=gzip.compress(json.dumps(d,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode(),mtime=0);self.assertEqual(hashlib.sha256(packed).hexdigest(),row['sha256']);self.assertEqual(len(d['sections']),row['sectionCount']);self.assertEqual(len(d['stations']),row['stationFeatures']);self.assertEqual(row['topology']['inventedConnectors'],0)
 def test_no_artificial_connection_at_track_crossings(self):
  def line(name,coordinates):return {'operator':'TEST','line':name,'sections':[{'coordinates':coordinates,'sourceFeature':0}],'stations':[]}
  g=G.graph([line('A',[[139,35],[139.02,35]]),line('B',[[139.01,34.99],[139.01,35.01]])]);self.assertRaises(ValueError,G.path,g,(139,35),(139.01,35.01))
 def test_station_anchor_does_not_drop_a_terminal(self):
  for name,terminal in [('azusa','松本'),('kaiji','竜王')]:
   d=json.loads(gzip.decompress((DEST/'reference-paths'/(name+'.json.gz')).read_bytes()));ss=d['physicalStationCandidates'];self.assertEqual(ss[0]['name'],'新宿');self.assertEqual(ss[-1]['name'],terminal);self.assertEqual(d['inventedConnectors'],0);self.assertTrue(all(a['distance']<=b['distance']for a,b in zip(ss,ss[1:])));self.assertLess(max(d['endpointMatchingErrorsMetres']),.01)
 def test_vehicle_is_distinct_complete_mesh_not_a_recolour(self):
  d=json.loads(gzip.decompress((DEST/'vehicles/e353-draft.json.gz').read_bytes()));self.assertFalse(d['releaseReady']);self.assertEqual(d['provisionalModelParameters']['doorCentresMiddle'],[-8.65,8.65]);self.assertEqual(d['provisionalModelParameters']['doorCentresHead'],[-8.65])
  for name in ['train','trainHead','trainTail']:
   triangles=0
   for group in d[name]['groups']:
    ps=np.frombuffer(base64.b64decode(group['positions']),dtype='<i2').reshape(-1,3)*group['positionScale'];ns=np.frombuffer(base64.b64decode(group['normals']),dtype='i1').reshape(-1,3);ix=np.frombuffer(base64.b64decode(group['indices']),dtype='<u2').reshape(-1,3);self.assertEqual(len(ps),len(ns));self.assertLess(int(ix.max()),len(ps));areas=np.linalg.norm(np.cross(ps[ix[:,1]]-ps[ix[:,0]],ps[ix[:,2]]-ps[ix[:,0]]),axis=1);self.assertTrue((areas>1e-9).all());triangles+=len(ix)
   self.assertGreater(triangles,1000)
 def test_all_100_materialized_input_hashes(self):
  m=json.loads((DEST/'manifest.json').read_text())
  for job in m['jobs']:
   artifact=job['inputArtifact'];p=HERE.parents[1]/artifact['path'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),artifact['sha256']);d=json.loads(gzip.decompress(p.read_bytes()));self.assertEqual(d['jobId'],job['id']);self.assertTrue(d['stationCandidates']);self.assertFalse(d['playable'])
 def test_passing_gate_labels_alone_never_release_a_fake_game(self):
  spec=importlib.util.spec_from_file_location('gate',HERE/'release-gate.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
  job=json.loads((DEST/'manifest.json').read_text())['jobs'][0];job['qualityGates']={k:'passed'for k in job['qualityGates']};errors=gate.validate(job);self.assertIn('No release artifacts',errors);self.assertIn('No validation report',errors)
 def test_terrain_matches_the_exact_path_revision(self):
  for name in ['azusa','kaiji']:
   p=DEST/'reference-paths'/(name+'.json.gz');route=json.loads(gzip.decompress(p.read_bytes()));terrain=json.loads(gzip.decompress((DEST/'reference-paths'/(name+'-terrain.json.gz')).read_bytes()));self.assertEqual(terrain['referencePathSha256'],hashlib.sha256(p.read_bytes()).hexdigest());self.assertEqual(len(terrain['heights']),len(route['points']));self.assertTrue(all(np.isfinite(h)for h in terrain['heights']))
 def test_all_shared_terrain_inputs_are_complete_and_versioned(self):
  m=json.loads((DEST/'manifest.json').read_text());ids={k for j in m['jobs']for k in j['sourceCorridors']};rows=json.loads((DEST/'terrain-inputs/index.json').read_text())['corridors'];self.assertEqual({r['id']for r in rows},ids);self.assertEqual(len(rows),102)
  for row in rows:
   p=DEST/row['path'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),row['sha256']);d=json.loads(gzip.decompress(p.read_bytes()));self.assertTrue(d['complete']);self.assertEqual(d['missingIndices'],[]);self.assertFalse(row['railElevationVerified']);self.assertEqual(len(d['points']),len(d['terrainHeights']))
  self.assertTrue(all(j['qualityGates']['elevationTunnelAndBridge']=='pending' for j in m['jobs']))
 def test_networks_preserve_every_source_segment_without_gap_filling(self):
  m=json.loads((DEST/'manifest.json').read_text());rows=json.loads((DEST/'networks/index.json').read_text())['corridors'];catalog=json.loads(gzip.decompress((DEST/'sources/national-corridors.json.gz').read_bytes()))['corridors'];self.assertEqual({r['id']for r in rows},{key for job in m['jobs']for key in job['sourceCorridors']})
  for row in rows:
   p=DEST/row['path'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),row['sha256']);d=json.loads(gzip.decompress(p.read_bytes()));source=catalog[row['id']];expected={(s['sourceFeature'],i):(a,b)for s in source['sections']for i,(a,b)in enumerate(zip(s['coordinates'],s['coordinates'][1:]))if a!=b};totals={key:0 for key in expected}
   self.assertEqual(d['inventedConnectors'],0);self.assertFalse(d['railElevationVerified']);self.assertEqual(len(d['stations'])+len(d['unmatchedStations']),len(source['stations']))
   for edge in d['edges']:
    key=(edge['sourceFeature'],edge['sourceSegment']);self.assertIn(key,expected);a,b=expected[key]
    for n in [edge['a'],edge['b']]:
     point=d['nodes'][n];self.assertTrue(all(np.isfinite(x)for x in point));self.assertLess(G.projection([a,b],point[:2])[0],.001)
    totals[key]+=edge['metres']
   for key,metres in totals.items():self.assertAlmostEqual(metres,G.metres(*expected[key]),delta=.001)
 def test_service_profiles_keep_passing_stations_and_direction_specific_stops(self):
  patterns={}
  for key in ['azusa','kaiji']:
   alignment=json.loads(gzip.decompress((DEST/'alignments'/(key+'.json.gz')).read_bytes()));self.assertEqual(alignment['sourceBuffer']['inventedConnectors'],0);self.assertGreater(alignment['sourceBuffer']['trimmedBeforeMetres'],349);self.assertGreater(alignment['sourceBuffer']['trimmedAfterMetres'],349)
   codes={s['code']for s in alignment['physicalStops']}
   for direction in ['forward','reverse']:
    service=json.loads((DEST/'services'/(key+'-'+direction+'.json')).read_text());stops={s['sourceCode']for s in service['stops']};passing=set(service['passingStationSourceCodes']);self.assertFalse(stops&passing);self.assertEqual(stops|passing,codes);self.assertFalse(service['releaseReady']);self.assertEqual(service['timetableMonth'],'2026-10');patterns[key+'-'+direction]=stops
  self.assertNotEqual(patterns['azusa-forward'],patterns['azusa-reverse'])
 def test_diagnostics_cover_current_source_and_component_versions(self):
  for name in ['service-running-diagnostics.json','train-scene-diagnostics.json']:
   report=json.loads((DEST/name).read_text());self.assertTrue(report['pass']);self.assertFalse(report['releaseReady']);self.assertFalse(report['physicalGPU']);self.assertFalse(report['realTime']);self.assertTrue(report['inputHashes']);self.assertEqual(len(report['runs']),4)
   for file,sha in report['inputHashes'].items():self.assertEqual(hashlib.sha256((DEST/file).read_bytes()).hexdigest(),sha)
   if name=='train-scene-diagnostics.json':
    self.assertEqual(sum(r['checkedLocations']for r in report['runs']),420)
    for run in report['runs']:self.assertEqual(run['canvasSize'],[1200,700]);self.assertEqual(run['ready'],run['primitives']);self.assertEqual(run['glError'],0)
if __name__=='__main__':unittest.main()
