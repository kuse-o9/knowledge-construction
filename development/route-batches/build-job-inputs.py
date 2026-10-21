"""Materialize each of the 100 jobs' source bindings and complete station inventories.
These are validation inputs, not playable games. Shared geometry stays deduplicated.
"""
from pathlib import Path
import gzip,hashlib,json
ROOT=Path(__file__).resolve().parents[2];DEST=ROOT/'development/route-batches/batch-001'
manifest=json.loads((DEST/'manifest.json').read_text());index=json.loads((DEST/'sources/index.json').read_text());catalog={x['id']:x for x in index['corridors']};raw=json.loads(gzip.decompress((DEST/'sources/national-corridors.json.gz').read_bytes()))['corridors']
(DEST/'job-inputs').mkdir(exist_ok=True);summaries=[]
for job in manifest['jobs']:
 refs=[catalog[k]for k in job['sourceCorridors']];stations=[]
 for ref in refs:
  for s in raw[ref['id']]['stations']:stations.append({'corridorId':ref['id'],'operator':ref['operator'],'line':ref['line'],'sourceCode':s['code'],'groupCode':s['groupCode'],'name':s['name'],'sourceGeometry':s['coordinates']})
 payload={'jobId':job['id'],'name':job['name'],'scope':job['scope'],'stage':'source-inputs-materialized','playable':False,'references':[{'id':x['id'],'sha256':x['sha256'],'sourceDate':'2025-12-31','operator':x['operator'],'line':x['line'],'connectedComponents':x['topology']['connectedComponents']}for x in refs],'stationCandidates':stations,'coordinateDimensions':2,'inventedConnectors':0,'nextRequired':['Verify current operating scope and choose source subpaths','Check all stations, stopping and passing patterns against the chosen service','Acquire heights and resolve tunnels/bridges/platform edges','Supply the correct vehicle, operation, audio and neighbour assets','Run mandatory quality checks before building any public route entry']}
 p=DEST/'job-inputs'/(job['id']+'.json.gz');p.write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));job['inputArtifact']={'path':'development/route-batches/batch-001/job-inputs/'+p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 if job['stage']=='reference-imported':job['stage']='source-inputs-materialized'
 summaries.append({'jobId':job['id'],'path':'job-inputs/'+p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'stationCandidates':len(stations),'status':payload['stage']})
# One small manifest permits jobs to resume without duplicating national geometry.
(DEST/'job-inputs/index.json').write_text(json.dumps({'jobs':summaries,'allJobsMaterialized':len(summaries)==100,'playableGames':0},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'materialized':len(summaries),'stationCandidatesAcrossJobs':sum(x['stationCandidates']for x in summaries),'sharedSourceCorridors':len(set(c['id']for j in manifest['jobs']for c in [catalog[k]for k in j['sourceCorridors']]))}))

(DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
