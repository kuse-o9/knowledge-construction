from pathlib import Path
import re,gzip,json,hashlib,base64,io
from PIL import Image
R=Path(__file__).resolve().parents[2];S=R/'shared';source=R/'development/tools/build-performance-release.py'
t=(R/'development/shared/rail-tunnel-runtime.js').read_text()
rows=[]
png=io.BytesIO();Image.new('RGB',(1,1),(27,82,101)).save(png,format='PNG');baseurl='data:image/png;base64,'+base64.b64encode(png.getvalue()).decode()
def patch_driver(runtime):
 def change(old,new):
  nonlocal runtime
  if old not in runtime:raise ValueError('Missing runtime anchor '+old[:100])
  runtime=runtime.replace(old,new)
 change('const decodedMeshes=new WeakMap();','const decodedMeshes=window.BaylineMeshCache.create(64*1024*1024);')
 visibility=re.search(r"function updateTrainVisibility\(\)\{for\(const car of trainInstances\)for\(const part of (.*?)\)part.show=(.*?);\}",runtime)
 if not visibility:raise ValueError('Missing visibility function')
 change(visibility[0],"function updateTrainVisibility(){for(const car of trainInstances){const visible="+visibility[2]+";if(car.visible===visible)continue;car.visible=visible;for(const part of "+visibility[1]+")part.show=visible;}}")
 anchor='for(const part of item.parts)part.show=t<1&&!boarded;'
 change(anchor,"if(!force&&item.lastT===t&&item.lastBoarded===boarded&&item.lastCurrent===current)continue;item.lastT=t;item.lastBoarded=boarded;item.lastCurrent=current;"+anchor)
 change('viewer.imageryLayers.addImageryProvider(new Ces.UrlTemplateImageryProvider(',"viewer.imageryLayers.addImageryProvider(await Ces.SingleTileImageryProvider.fromUrl('"+baseurl+"'));viewer.imageryLayers.addImageryProvider(new Ces.UrlTemplateImageryProvider(")
 change('const tunnelResult=window.BaylineTunnels.setup(',"window.BaylineRecovery.watch(viewer,(retry=false)=>{state.running=false;if(retry)setView('cab');save();if(!retry)setView('map');});const tunnelResult=window.BaylineTunnels.setup(")
 if 'window.GamePublication?.registerPause'not in runtime:runtime=runtime.replace('void initialize3D();requestAnimationFrame(tick);',"window.GamePublication?.registerPause(()=>{state.running=false;save();if(viewer)viewer.useDefaultRenderLoop=false;});void initialize3D();requestAnimationFrame(tick);")
 return runtime
for key,prefix in [('chuo','chuo-bundle'),('chuo-local','chuo-local-bundle'),('keihin','keihin-bundle'),('sobu','sobu-data')]:
 packed=b''.join((R/f'{prefix}-{i}.bin').read_bytes()for i in [0,1]);j=json.loads(gzip.decompress(packed));scripts=list(re.finditer(r'<script[^>]*>(.*?)</script>',j['html'],re.S));runtime=patch_driver(scripts[-1][1]);(S/f'rail-driver-{key}.js').write_text(runtime)
 if key=='chuo-local':
  shared=scripts[8][1];a=shared.index('/* Terrain openings');b=shared.index('/* Existing Tachikawa branch');shared=shared[:a]+t+'\n'+shared[b:];(S/'rail-scene-shared.js').write_text(shared)
 row={'id':key,'parts':[f'{prefix}-{i}.bin'for i in [0,1]],'sha256':hashlib.sha256(packed).hexdigest(),'driver':f'shared/rail-driver-{key}.js'};rows.append(row)
 title={'chuo':'中央線快速','chuo-local':'中央・総武線各駅停車','keihin':'京浜東北・根岸線','sobu':'総武線快速'}[key]
 boot='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BAYLINE '+title+'</title><style>body{background:#12232c;color:#edf4f5;font:16px/1.8 system-ui;padding:30px}a{color:#a0c9ed}button{padding:10px 16px;cursor:pointer}</style></head><body><h1>'+title+'</h1><p id="loading" role="status">車両・ホーム・街のモデルを準備しています…</p><button id="retry-loading" hidden>もう一度読み込む</button> <a href="index.html#game-room">ゲームの部屋に戻る</a><script src="config.js"></script><script src="game-publication.js"></script><script src="shared/rail-loader.js" data-route=\''+json.dumps(row,separators=(',',':'))+'\'></script></body></html>'
 (R/f'{key}.html').write_text(boot)
# Yamanote already has ordinary external scripts, so its source can be patched directly.
y=R/'yamanote/rail.js';ys=y.read_text();ys=patch_driver(ys)if'window.BaylineMeshCache.create'not in ys else ys;y.write_text(ys)
p=R/'yamanote/index.html';ys=p.read_text()
if '../shared/rail-mesh-cache.js'not in ys:ys=ys.replace('<script src="rail.js', '<script src="../shared/rail-mesh-cache.js"></script><script src="../shared/rail-recovery.js"></script><script src="rail.js')
p.write_text(ys)
(R/'development/performance/3d-release.json').write_text(json.dumps({'detailReduced':False,'resolutionReduced':False,'featuresRemoved':False,'changes':['64 MiB LRU decoded geometry cache','Windowed tunnel clipping and differential entity reuse','Regional aerial imagery overlay prevents Cesium 1.117 edge intersection crash','Stationary passenger transforms and train visibility cached','Recoverable loader and saved-state reload button'],'bundles':rows},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows))
