"""Bind acquired terrain to each job without passing the rail-height/structure gate."""
from pathlib import Path
import gzip,hashlib,json,math
DEST=Path(__file__).parent/'batch-001';manifest=json.loads((DEST/'manifest.json').read_text());ids={s for j in manifest['jobs']for s in j['sourceCorridors']};rows=[]
for key in sorted(ids):
 p=DEST/'terrain-inputs'/(key+'.json.gz');d=json.loads(gzip.decompress(p.read_bytes()));assert d['complete']and not d['missingIndices'];assert len(d['points'])==len(d['terrainHeights']);assert all(isinstance(h,(int,float))and math.isfinite(h)for h in d['terrainHeights']);rows.append({'id':key,'path':'terrain-inputs/'+p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceInputSha256':d['sourceInputSha256'],'points':len(d['points']),'terrainOnly':True,'railElevationVerified':False})
lookup={r['id']:r for r in rows}
for job in manifest['jobs']:
 job['terrainArtifacts']=[lookup[k]for k in job['sourceCorridors']]
 if job['stage']=='source-inputs-materialized':job['stage']='terrain-inputs-acquired'
manifest['terrainAcquisition']={'sharedCorridors':len(rows),'pointsAcrossCorridors':sum(r['points']for r in rows),'missingHeights':0,'railElevationVerified':False};(DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(DEST/'terrain-inputs/index.json').write_text(json.dumps({'source':'https://tile.plateauview.mlit.go.jp/terrain','method':'Cesium sampleTerrain level 14','corridors':rows,'terrainInputComplete':True,'doesNotValidate':['rail elevation','tunnels','bridges','platform edges','3D rendering','operation']},ensure_ascii=False,indent=2)+'\n');print(json.dumps(manifest['terrainAcquisition']))
