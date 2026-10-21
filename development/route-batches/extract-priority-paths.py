"""Extract continuous official reference paths for Azusa and Kaiji; no playable claim."""
from pathlib import Path
import gzip,json,importlib.util,hashlib
ROOT=Path(__file__).resolve().parents[2];DEST=ROOT/'development/route-batches/batch-001'
spec=importlib.util.spec_from_file_location('graph',Path(__file__).with_name('rail-input-graph.py'));G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
index=json.loads((DEST/'sources/index.json').read_text())['corridors']
catalog=json.loads(gzip.decompress((DEST/'sources/national-corridors.json.gz').read_bytes()))['corridors']
corridors=[catalog[x['id']]for x in index if x['operator']=='東日本旅客鉄道'and x['line']in ['中央線','篠ノ井線','大糸線']]
g=G.graph(corridors);allstations=[{**s,'sourceLine':c['line'],'sourceOperator':c['operator']}for c in corridors for s in c['stations']]
def station(name):
 values=[s for s in allstations if s['name']==name]
 if not values:raise ValueError('Missing station '+name)
 return min(((*g['stationNodes'][(s['sourceOperator'],s['sourceLine'],s['code'])],s)for s in values),key=lambda x:x[1])
(DEST/'reference-paths').mkdir(exist_ok=True)
for key,destination in [('azusa','松本'),('kaiji','竜王')]:
 a,deltaa,_=station('新宿');b,deltab,_=station(destination);points,edges,length=G.path(g,a,b)
 matches=[]
 for s in allstations:
  d,along,i,t=G.projection(points,G.midpoint(s['coordinates']))
  if d<90:matches.append({'name':s['name'],'sourceCode':s['code'],'sourceGroupCode':s['groupCode'],'sourceLine':s['sourceLine'],'distance':round(along,3),'projectionErrorMetres':round(d,3),'sourceCoordinates':s['coordinates'],'pointIndex':i,'pointFraction':t})
 # Source may provide the same station in two operator-line records.
 stops=[]
 for s in sorted(matches,key=lambda x:(x['distance'],x['sourceCode'])):
  if any(x['sourceGroupCode']==s['sourceGroupCode']and abs(x['distance']-s['distance'])<150 for x in stops):continue
  stops.append(s)
 payload={'id':key,'stage':'reference-path-extracted','playable':False,'start':'新宿','end':destination,'sourceDate':'2025-12-31','lengthMetres':length,'points':points,'physicalStationCandidates':stops,'sourceEdges':[{'operator':e[0][0],'line':e[0][1],'feature':e[0][2],'reverse':e[1]}for e in edges],'endpointMatchingErrorsMetres':[deltaa,deltab],'inventedConnectors':0,'stationAnchorMethod':'Interpolate onto existing source segments; no additional connector','limitations':['Not a surveyed per-running-track alignment','All source station candidates must be checked against the chosen service','No elevation, vehicle or platform geometry produced by this extraction']}
 assert stops[0]['name']=='新宿' and stops[-1]['name']==destination, 'Both terminal stations must be present'
 raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(raw,mtime=0);(DEST/'reference-paths'/(key+'.json.gz')).write_bytes(packed)
 report={k:v for k,v in payload.items()if k not in ['points','sourceEdges','physicalStationCandidates']};report.update(pointCount=len(points),stationCandidates=[s['name']for s in stops],sha256=hashlib.sha256(packed).hexdigest());(DEST/'reference-paths'/(key+'-audit.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
