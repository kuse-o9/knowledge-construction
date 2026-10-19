"""Rebuild the four packed games from their retained models and reviewed JS sources.
Run after editing development/signalled-routes/<route>/rail*.js or shared signals.
Existing packed model bytes and extension payloads are preserved.
"""
from pathlib import Path
import re,json,gzip,base64,hashlib
ROOT=Path(__file__).resolve().parents[2]
shared='\n'.join((ROOT/'development/shared'/p).read_text() for p in ['rail-signals.js','rail-signal-runtime.js','rail-traffic-signalled.js'])
(ROOT/'shared').mkdir(exist_ok=True)
for p in ['rail-signals.js','rail-signal-runtime.js']:(ROOT/'shared'/p).write_text((ROOT/'development/shared'/p).read_text())
report=[]
for name in ['chuo','chuo-local','keihin','sobu']:
 path=ROOT/(name+'.html');boot=path.read_text();inline=re.search(r'(<script id="game-bundle"[^>]*>)(.*?)(</script>)',boot,re.S)
 prefix='keihin-bundle' if name=='keihin' else 'sobu-data'
 raw=gzip.decompress(base64.b64decode(inline[2]) if inline else b''.join((ROOT/(prefix+f'-{i}.bin')).read_bytes() for i in range(2)))
 bundle=json.loads(raw)
 def script(m):
  text=m[1];source=ROOT/'development/signalled-routes'/name
  if 'function atcLimit' in text:return '<script>'+(source/'rail-core.js').read_text()+'</script>'
  if 'function playerGap' in text:return '<script>'+shared+'</script>'
  if 'function updateTraffic' in text:return '<script>'+(source/'rail.js').read_text()+'</script>'
  return m[0]
 bundle['html']=re.sub(r'<script>(.*?)</script>',script,bundle['html'],flags=re.S)
 if 'id="game-signal-note"' not in bundle['html']:
  bundle['html']=bundle['html'].replace('<h3>データと出典</h3>','<p id="game-signal-note">線路脇の3灯信号はゲーム用の閉塞表示です。実際の信号位置・信号方式・運転取扱いとは異なります。</p><h3>データと出典</h3>')
 raw=json.dumps(bundle,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(raw,compresslevel=9,mtime=0)
 version=hashlib.sha256(packed).hexdigest()[:12]
 if inline:boot=boot[:inline.start(2)]+base64.b64encode(packed).decode()+boot[inline.end(2):]
 else:
  split=(len(packed)+1)//2
  for i,data in enumerate([packed[:split],packed[split:]]):(ROOT/(prefix+f'-{i}.bin')).write_bytes(data)
  boot=re.sub(r'([\"\x27])('+prefix+r'-\d+\.bin)(?:\?[^\"\x27]*)?([\"\x27])',lambda m:m[1]+m[2]+'?v='+version+m[3],boot)
 path.write_text(boot)
 report.append({'route':name,'signals':'direction-specific 600m approximate blocks','bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest()})
 if name=='sobu':(ROOT/'development/sobu-package.json').write_text(json.dumps({'files':[prefix+f'-{i}.bin' for i in range(2)],'compressedBytes':len(packed),'uncompressedBytes':len(raw),'sha256':hashlib.sha256(packed).hexdigest(),'stationCount':10,'directions':2},indent=2))
(ROOT/'development/signalled-routes/release.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
