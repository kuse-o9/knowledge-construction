"""Compile all selected source corridors into reusable 3D-ground topology inputs.

Non-noded source crossings stay disconnected. Station anchors split existing
edges, never connect nearby tracks. Source junctions still need grade review.
No inferred endpoint snapping or fake track is permitted.
This is a construction artifact, not a finished rail alignment or a game.
"""
from pathlib import Path
import collections,gzip,hashlib,importlib.util,json,math

HERE=Path(__file__).parent;DEST=HERE/'batch-001';OUT=DEST/'networks';OUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('graph',HERE/'rail-input-graph.py');G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
manifest=json.loads((DEST/'manifest.json').read_text());ids=sorted({key for job in manifest['jobs']for key in job['sourceCorridors']});source_index={r['id']:r for r in json.loads((DEST/'sources/index.json').read_text())['corridors']};catalog=json.loads(gzip.decompress((DEST/'sources/national-corridors.json.gz').read_bytes()))['corridors'];reports=[]

for at,key in enumerate(ids):
 c=catalog[key];terrain_path=DEST/'terrain-inputs'/(key+'.json.gz');terrain=json.loads(gzip.decompress(terrain_path.read_bytes()));height_by_point={tuple(p):h for p,h in zip(terrain['points'],terrain['terrainHeights'])}
 g=G.graph([c]);points=sorted(g['nodes']);node_index={p:i for i,p in enumerate(points)};node_heights={};edges=[]
 original={(s['sourceFeature'],i):(a,b)for s in c['sections']for i,(a,b)in enumerate(zip(s['coordinates'],s['coordinates'][1:]))if a!=b}
 for source,ps in g['sources'].items():
  a,b=map(tuple,ps);origin=original[source[2:4]]
  for point in [a,b]:
   if point not in node_heights:
    if point in height_by_point:node_heights[point]=height_by_point[point]
    else:
     error,_,_,t=G.projection(origin,point)
     if error>.001:raise ValueError('Anchor left its source segment')
     node_heights[point]=height_by_point[tuple(origin[0])]*(1-t)+height_by_point[tuple(origin[1])]*t
  edges.append({'a':node_index[a],'b':node_index[b],'metres':G.metres(a,b),'sourceFeature':source[2],'sourceSegment':source[3]})
 neighbours=collections.defaultdict(set)
 for edge in edges:neighbours[edge['a']].add(edge['b']);neighbours[edge['b']].add(edge['a'])
 components=[];component_for={}
 for first in range(len(points)):
  if first in component_for:continue
  cid=len(components);stack=[first];component_for[first]=cid;members=[]
  while stack:
   n=stack.pop();members.append(n)
   for other in neighbours[n]:
    if other not in component_for:component_for[other]=cid;stack.append(other)
  components.append({'id':cid,'nodes':len(members),'endpoints':[n for n in members if len(neighbours[n])==1],'junctions':[n for n in members if len(neighbours[n])>2]})
 stations=[];unmatched=[]
 for station in c['stations']:
  anchor=g['stationNodes'].get((c['operator'],c['line'],station['code']))
  if anchor is None:
   unmatched.append({'code':station['code'],'name':station['name'],'reason':'No source segment within 100 metres; requires review'});continue
  point,error=anchor;n=node_index[point]
  stations.append({'code':station['code'],'groupCode':station['groupCode'],'name':station['name'],'node':n,'component':component_for[n],'projectionErrorMetres':error,'platformVerified':False})
 payload={'id':key,'operator':c['operator'],'line':c['line'],'stage':'source-network-compiled','playable':False,'releaseReady':False,'sourceInputSha256':source_index[key]['sha256'],'terrainInputSha256':hashlib.sha256(terrain_path.read_bytes()).hexdigest(),'nodeColumns':['longitude','latitude','groundHeight'],'nodes':[[*p,node_heights[p]]for p in points],'edges':edges,'stations':stations,'unmatchedStations':unmatched,'components':components,'inventedConnectors':0,'railElevationVerified':False,'pending':['Verify current operating scope and route variants','Separate running tracks and platform edges','Resolve tunnel, bridge and elevated rail grades','Apply service, rolling stock, traffic, announcement and validation assets']}
 p=OUT/(key+'.json.gz');p.write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));reports.append({'id':key,'path':'networks/'+p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceInputSha256':payload['sourceInputSha256'],'nodes':len(points),'edges':len(edges),'stations':len(stations),'unmatchedStations':len(unmatched),'components':len(components),'totalSourceMetres':sum(e['metres']for e in edges),'inventedConnectors':0,'railElevationVerified':False})
 print(f'NETWORK {at+1}/{len(ids)} {c["line"]} nodes={len(points)} stations={len(stations)} unmatched={len(unmatched)} components={len(components)}',flush=True)

by_id={r['id']:r for r in reports}
for job in manifest['jobs']:
 job['networkArtifacts']=[{k:r[k]for k in ['id','path','sha256','sourceInputSha256']}for r in [by_id[key]for key in job['sourceCorridors']]]
 if job['stage']=='terrain-inputs-acquired':job['stage']='source-network-compiled'
manifest['networkCompilation']={'corridors':len(reports),'stations':sum(r['stations']for r in reports),'unmatchedStations':sum(r['unmatchedStations']for r in reports),'railElevationVerified':False}
(OUT/'index.json').write_text(json.dumps({'corridors':reports,'playableGames':0,'releaseReady':False},ensure_ascii=False,indent=2)+'\n');(DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps(manifest['networkCompilation']),flush=True)
