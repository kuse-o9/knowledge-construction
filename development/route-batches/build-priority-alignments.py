"""Give the development train scene real source-track buffers and exact stop anchors.

The buffers come from adjacent source paths, rather than invented straight lines.
Surface heights are diagnostic only; rail grades require tunnel/bridge review.
"""
from pathlib import Path
import gzip,hashlib,importlib.util,json,math
import numpy as np
from scipy.spatial import cKDTree

HERE=Path(__file__).parent;DEST=HERE/'batch-001'
spec=importlib.util.spec_from_file_location('graph',HERE/'rail-input-graph.py');G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
catalog=json.loads(gzip.decompress((DEST/'sources/national-corridors.json.gz').read_bytes()))['corridors'];index=json.loads((DEST/'sources/index.json').read_text())['corridors'];selected=[(r['id'],catalog[r['id']])for r in index if r['operator']=='東日本旅客鉄道' and r['line']in ['中央線','篠ノ井線','大糸線']]
g=G.graph([c for _,c in selected]);heights={};segments=[]
for key,c in selected:
 terrain=json.loads(gzip.decompress((DEST/'terrain-inputs'/(key+'.json.gz')).read_bytes()))
 heights.update({tuple(p):h for p,h in zip(terrain['points'],terrain['terrainHeights'])})
 for s in c['sections']:
  segments.extend((a,b)for a,b in zip(s['coordinates'],s['coordinates'][1:])if a!=b)
scale=np.array([90400,111320]);centres=np.array([[(a[0]+b[0])/2,(a[1]+b[1])/2]for a,b in segments])*scale;tree=cKDTree(centres)
def ground(p):
 if tuple(p)in heights:return heights[tuple(p)]
 _,indices=tree.query(np.array(p)*scale,k=min(64,len(segments)));best=None
 for i in np.atleast_1d(indices):
  a,b=segments[i];d,_,_,t=G.projection([a,b],p)
  if best is None or d<best[0]:best=(d,heights[tuple(a)]*(1-t)+heights[tuple(b)]*t)
 if best[0]>.001:raise ValueError(f'No matching source segment height: {p}, {best[0]}m')
 return best[1]
def station_node(name):
 values=[g['stationNodes'][(c['operator'],c['line'],s['code'])]for _,c in selected for s in c['stations']if s['name']==name]
 return min(values,key=lambda v:v[1])[0]
def join(*pieces):
 out=[]
 for piece in pieces:
  if out and out[-1]!=piece[0]:raise ValueError('Disconnected buffer path')
  out.extend(piece[1:]if out else piece)
 return out
def distances(points):
 out=[0]
 for a,b in zip(points,points[1:]):out.append(out[-1]+G.metres(a,b))
 return out
def at(points,ds,d):
 import bisect
 i=min(len(points)-2,max(0,bisect.bisect_right(ds,d)-1));t=(d-ds[i])/(ds[i+1]-ds[i]);a,b=points[i:i+2];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
outdir=DEST/'alignments';outdir.mkdir(exist_ok=True);reports=[]
for key,end,after in [('azusa','松本','田沢'),('kaiji','竜王','塩崎')]:
 reference=DEST/'reference-paths'/(key+'.json.gz');data=json.loads(gzip.decompress(reference.read_bytes()));start=station_node('新宿');finish=station_node(end)
 prefix=G.path(g,station_node('四ツ谷'),start)[0];suffix=G.path(g,finish,station_node(after))[0]
 points=join(prefix,data['points'],suffix);ds=distances(points);origin=distances(prefix)[-1];a=origin-350;b=origin+data['lengthMetres']+350
 if a<0 or b>ds[-1]:raise ValueError('Insufficient verified source-track buffer')
 cut=[at(points,ds,a)]+[p for p,d in zip(points,ds)if a<d<b]+[at(points,ds,b)]
 # Insert every physical candidate at its exact source-segment projection.
 candidates=[];insert={}
 for s in data['physicalStationCandidates']:
  error,along,i,t=G.projection(cut,G.midpoint(s['sourceCoordinates']));p=[cut[i][0]+(cut[i+1][0]-cut[i][0])*t,cut[i][1]+(cut[i+1][1]-cut[i][1])*t]
  candidates.append((s,tuple(p),error));insert.setdefault(i,[]).append((t,p))
 anchored=[]
 for i,p in enumerate(cut):
  if not anchored or anchored[-1]!=p:anchored.append(p)
  for t,p2 in sorted(insert.get(i,[])):
   if 1e-10<t<1-1e-10 and anchored[-1]!=p2:anchored.append(p2)
 # Endpoints may differ at <1e-10 from the interpolation arithmetic.
 ds=distances(anchored);positions={tuple(p):i for i,p in enumerate(anchored)};physical=[]
 for s,p,error in candidates:
  i=positions.get(p)
  if i is None:
   distance,i=min((G.metres(p,q),i)for i,q in enumerate(anchored))
   if distance>.001:raise ValueError('Unanchored physical station')
  physical.append({'code':s['sourceCode'],'groupCode':s['sourceGroupCode'],'name':s['name'],'index':i,'distance':ds[i],'sourceProjectionErrorMetres':error,'platformGeometryVerified':False})
 hs=[ground(p)for p in anchored]
 payload={'id':key,'stage':'buffered-source-alignment','playable':False,'releaseReady':False,'points':anchored,'groundHeights':hs,'length':ds[-1],'physicalStops':physical,'sourceReferenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'sourceBuffer':{'before':'四ツ谷→新宿','after':end+'→'+after,'trimmedBeforeMetres':physical[0]['distance'],'trimmedAfterMetres':ds[-1]-physical[-1]['distance'],'inventedConnectors':0},'heightMethod':'Original shared terrain samples at source vertices; linear interpolation on the same segment for inserted anchors. Ground only, not rail elevation.','pending':['Survey per-track alignment and actual stop markers','Verify rail grade through all tunnels and bridges','Build correct physical platforms, structures and adjacent tracks']}
 p=outdir/(key+'.json.gz');p.write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));report={'id':key,'path':'alignments/'+p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'points':len(anchored),'physicalStations':len(physical),'buffer':payload['sourceBuffer'],'railElevationVerified':False};reports.append(report)
(outdir/'index.json').write_text(json.dumps({'alignments':reports,'releaseReady':False},ensure_ascii=False,indent=2)+'\n');print(json.dumps(reports,ensure_ascii=False))
