from pathlib import Path
import json,re,gzip,hashlib
ROOT=Path(__file__).resolve().parents[2];R=ROOT/'development/sobu-source'
html=(R/'index.html').read_text();html=re.sub(r'<link rel="stylesheet" href="rail\.css[^\"]*">','<style>'+(R/'rail.css').read_text()+'</style>',html)
for name in ['../shared/rail-signals.js','../shared/rail-signal-runtime.js','rail-data.js','rail-core.js','rail-announcements.js','rail-recordings.js','rail-audio.js','city-models.js','rail-models.js','rail-traffic.js','rail-parallel.js','rail.js']:
 text=(R/name).read_text().replace('</script','<\\/script');html=re.sub(r'<script src="'+re.escape(name)+r'(?:\?[^\"]*)?"></script>',lambda m:'<script>'+text+'</script>',html)
assert len(re.findall(r'<script src=',html))==1
raw=json.dumps({'html':html,'models':{}},separators=(',',':'),ensure_ascii=False).encode();packed=gzip.compress(raw,compresslevel=9,mtime=0);parts=[packed[i:i+6*1024*1024] for i in range(0,len(packed),6*1024*1024)];names=[]
for i,p in enumerate(parts):name=f'sobu-data-{i}.bin';(ROOT/name).write_bytes(p);names.append(name)
boot='''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BAYLINE 総武線快速</title><style>body{background:#12232c;color:#edf4f5;font:16px/1.8 system-ui;padding:30px}a{color:#a0c9ed}</style></head><body><h1>総武線快速</h1><p id="loading">車両・ホーム・街のモデルを準備しています…</p><a href="index.html#game-room">ゲームの部屋に戻る</a><script>
(async()=>{try{const parts=await Promise.all(NAMES.map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('data');return new Uint8Array(await r.arrayBuffer());})),bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const bundle=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());document.open();document.write(bundle.html);document.close();}catch(e){document.getElementById('loading').textContent='ゲームのデータを読み込めませんでした。Ctrl＋F5で再読み込みしてください。';}})();
</script></body></html>'''.replace('NAMES',json.dumps(names));(ROOT/'sobu.html').write_text(boot)
report={'files':names,'compressedBytes':len(packed),'uncompressedBytes':len(raw),'sha256':hashlib.sha256(packed).hexdigest(),'stationCount':10,'directions':2};(ROOT/'development/sobu-package.json').write_text(json.dumps(report,indent=2));print(report)
