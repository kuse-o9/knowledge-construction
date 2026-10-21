"""Import official MLIT N02 geometry without inventing connectors or elevation.

Output is production INPUT, never a playable-route or release declaration.
Usage: python import-national-railways.py --archive path/N02-25_GML.zip
"""
from pathlib import Path
import argparse,collections,gzip,hashlib,json,math,zipfile
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'development/route-batches/batch-001'
SOURCE='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html'
TERMS='https://nlftp.mlit.go.jp/ksj/other/agreement.html'

def encoded(obj):return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def distance(a,b):return math.hypot((a[0]-b[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(a[1]-b[1])*111320)
def topology(sections):
 # Only source endpoints connect. A level crossing does not become a junction.
 nodes={};adj=collections.defaultdict(set);total=0
 for s in sections:
  ps=s['coordinates'];a=tuple(ps[0]);b=tuple(ps[-1]);nodes[a]=1;nodes[b]=1;adj[a].add(b);adj[b].add(a);total+=sum(distance(a,b)for a,b in zip(ps,ps[1:]))
 seen=set();components=[]
 for n in nodes:
  if n in seen:continue
  todo=[n];seen.add(n);size=0
  while todo:
   a=todo.pop();size+=1
   for b in adj[a]:
    if b not in seen:seen.add(b);todo.append(b)
  components.append(size)
 return {'sourceEndpointNodes':len(nodes),'connectedComponents':sorted(components,reverse=True),'totalSourceMetres':round(total,3),'inventedConnectors':0}
def main(archive):
 z=zipfile.ZipFile(archive);groups=collections.defaultdict(lambda:{'sections':[],'stations':[]})
 rawhash={};duplicates=0
 for kind,field in [('RailroadSection','sections'),('Station','stations')]:
  raw=z.read('N02-25_GML/UTF-8/N02-25_'+kind+'.geojson');rawhash[kind]=hashlib.sha256(raw).hexdigest()
  for i,f in enumerate(json.loads(raw)['features']):
   p=f['properties'];geometry=f['geometry'];assert geometry['type']=='LineString';ps=geometry['coordinates'];assert len(ps)>=2
   assert all(len(p)>=2 and 122<p[0]<155 and 20<p[1]<47 and all(math.isfinite(v)for v in p[:2])for p in ps)
   key=(p['N02_004'],p['N02_003']);record={'sourceFeature':i,'railwayType':p['N02_001'],'operatorType':p['N02_002'],'coordinates':ps}
   if field=='stations':record.update(name=p['N02_005'],code=p['N02_005c'],groupCode=p['N02_005g'])
   groups[key][field].append(record)
 (DEST/'sources').mkdir(parents=True,exist_ok=True);index=[];payloads={}
 for (operator,line),payload in sorted(groups.items()):
  payload.update(operator=operator,line=line,source=SOURCE,sourceDate='2025-12-31',coordinateReference='JGD2011 geographic coordinates, GRS80',elevation=None,geometryMeaning='Official map centerlines; not separate surveyed running tracks or platform edges.')
  points=[p for s in payload['sections']for p in s['coordinates']];assert points
  identity=hashlib.sha256(encoded([operator,line])).hexdigest()[:16];raw=encoded(payload);packed=gzip.compress(raw,mtime=0);payloads[identity]=payload
  index.append({'id':identity,'operator':operator,'line':line,'railwayTypes':sorted(set(x['railwayType']for x in payload['sections'])),'sectionCount':len(payload['sections']),'stationFeatures':len(payload['stations']),'stationNames':sorted(set(x['name']for x in payload['stations'])),'bbox':[min(p[0]for p in points),min(p[1]for p in points),max(p[0]for p in points),max(p[1]for p in points)],'topology':topology(payload['sections']),'path':'sources/national-corridors.json.gz','payloadKey':identity,'sha256':hashlib.sha256(packed).hexdigest(),'bytes':len(packed)})
 (DEST/'sources/national-corridors.json.gz').write_bytes(gzip.compress(encoded({'schema':1,'corridors':payloads}),mtime=0))
 (DEST/'sources/index.json').write_text(json.dumps({'source':SOURCE,'datasetDate':'2025-12-31','corridors':index},ensure_ascii=False,indent=2)+'\n')
 prov={'source':SOURCE,'download':'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip','acquired':'2026-10-21','datasetDate':'2025-12-31','archiveSha256':hashlib.sha256(Path(archive).read_bytes()).hexdigest(),'geojsonSha256':rawhash,'terms':TERMS,'termsChecked':'2026-10-21','termsName':'Public Data License 1.0 (site terms effective 2026-03-23; retain attribution and identify processing)','attribution':'国土数値情報（鉄道データ・2025年度）（国土交通省）をもとにBAYLINE開発用に加工。国が作成したゲームではありません。','transformations':['Group source records by exact operator/line identity','Preserve source coordinates and source-feature indices','Compress deterministic JSON without simplification','Compute endpoint-only topology; do not join gaps or infer crossings'],'limitations':['Two-dimensional reference geometry; no surveyed track heights, platform edges or signalling positions','Dataset reference date differs from current operation; each operator must be checked before release','Input import does not certify a game as playable, complete, or validated'],'counts':{'corridors':len(index),'sourceRailSections':sum(x['sectionCount']for x in index),'sourceStationFeatures':sum(x['stationFeatures']for x in index)}}
 (DEST/'sources/provenance.json').write_text(json.dumps(prov,ensure_ascii=False,indent=2)+'\n');print(json.dumps(prov['counts']))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--archive',required=True);main(p.parse_args().archive)
