"""Rebuild the four packed games from their retained models and reviewed JS sources.
Run after editing development/signalled-routes/<route>/rail*.js or shared signals.
Existing packed model bytes and extension payloads are preserved.
"""
from pathlib import Path
import re,json,gzip,base64,hashlib,sys
ROOT=Path(__file__).resolve().parents[2]
extension_version=hashlib.sha256(b''.join((ROOT/('chuo-'+name+'.bin')).read_bytes() for name in ['west','ome','okutama','fuji','lake'])).hexdigest()[:12]
shared='\n'.join((ROOT/'development/shared'/p).read_text() for p in ['rail-signals.js','rail-signal-runtime.js','rail-traffic-signalled.js','rail-tunnel-runtime.js','rail-junction-runtime.js','rail-boundary-runtime.js','rail-neighbour-runtime.js'])
(ROOT/'shared').mkdir(exist_ok=True)
for p in ['rail-signals.js','rail-signal-runtime.js','rail-tunnel-runtime.js','rail-neighbour-runtime.js']:(ROOT/'shared'/p).write_text((ROOT/'development/shared'/p).read_text())
selected=set(sys.argv[1:]);allowed={'chuo','chuo-local','keihin','sobu'}
if selected-allowed:raise ValueError('Unknown route')
previous={x['route']:x for x in json.loads((ROOT/'development/signalled-routes/release.json').read_text())}
report=[]
for name in ['chuo','chuo-local','keihin','sobu']:
 if selected and name not in selected:report.append(previous[name]);continue
 path=ROOT/(name+'.html');boot=path.read_text();inline=re.search(r'(<script id="game-bundle"[^>]*>)(.*?)(</script>)',boot,re.S)
 prefix='sobu-data' if name=='sobu' else name+'-bundle'
 raw=gzip.decompress(base64.b64decode(inline[2]) if inline else b''.join((ROOT/(prefix+f'-{i}.bin')).read_bytes() for i in range(2)))
 bundle=json.loads(raw)
 def script(m):
  text=m[1];source=ROOT/'development/signalled-routes'/name
  if text.lstrip().startswith('window.RAIL_ANNOUNCEMENTS='):return '<script>'+(source/'rail-announcements.js').read_text()+'</script>'
  if 'function speakText' in text:return '<script>'+(source/'rail-audio.js').read_text()+'</script>'
  if 'function atcLimit' in text:return '<script>'+(source/'rail-core.js').read_text()+'</script>'
  if 'function playerGap' in text:return '<script>'+shared+'</script>'
  if 'function updateTraffic' in text:return '<script>'+(source/'rail.js').read_text()+'</script>'
  if name=='chuo' and ('const q=new URLSearchParams(location.search),plans=' in text or 'Journey setup precedes the scene' in text):
   return '<script>'+'\n'.join((ROOT/p).read_text() for p in ['development/shared/through-services.js','development/shared/rail-journey-core.js','development/through-running/segment-store.js','development/through-running/chuo-journey.js']).replace('continuous1',extension_version)+'</script>'
  return m[0]
 bundle['html']=re.sub(r'<script>(.*?)</script>',script,bundle['html'],flags=re.S)
 if name=='chuo':
  if 'id="handoff-note"' not in bundle['html']:bundle['html']=bundle['html'].replace('<button id="next-section"','<p id="handoff-note" role="status"></p><button id="next-section"')
  boot=boot.replace("fetch('chuo-'+segment+'.bin')","fetch('chuo-'+segment+'.bin?v="+extension_version+"')")
  boot=boot.replace("Math.max(0,Number(q.get('leg'))||0)","Math.max(0,Math.floor(Number(q.get('leg'))||0))")
 if 'id="game-signal-note"' not in bundle['html']:
  bundle['html']=bundle['html'].replace('<h3>データと出典</h3>','<p id="game-signal-note">線路脇の3灯信号はゲーム用の閉塞表示です。実際の信号位置・信号方式・運転取扱いとは異なります。</p><h3>データと出典</h3>')
 bundle['html']=bundle['html'].replace('id="skip-wait" class="lcd-button" disabled','id="skip-wait" class="lcd-button" hidden disabled')
 bundle['html']=bundle['html'].replace('「発車時刻まで進める」で停車待ちを省略できます。','乗降と音声案内が終われば、予定時刻より早く発車できます。')
 bundle['html']=bundle['html'].replace('早着したら、乗降確認後に「発車時刻まで進める」で停車の待ち時間を飛ばせます。','乗降と音声案内が終われば、予定時刻より早く発車できます。')
 raw=json.dumps(bundle,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(raw,compresslevel=9,mtime=0)
 version=hashlib.sha256(packed).hexdigest()[:12]
 if inline:
  boot=boot[:inline.start()]+boot[inline.end():]
  old="const raw=atob(document.getElementById('game-bundle').textContent.trim()),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));"
  new="const parts=await Promise.all("+json.dumps([prefix+'-0.bin',prefix+'-1.bin'])+".map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('data');return new Uint8Array(await r.arrayBuffer());})),bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}"
  assert old in boot
  boot=boot.replace(old,new)
 split=(len(packed)+1)//2
 for i,data in enumerate([packed[:split],packed[split:]]):(ROOT/(prefix+f'-{i}.bin')).write_bytes(data)
 boot=re.sub(r'([\"\x27])('+prefix+r'-\d+\.bin)(?:\?[^\"\x27]*)?([\"\x27])',lambda m:m[1]+m[2]+'?v='+version+m[3],boot)
 if name=='chuo':boot=re.sub(r"fetch\('chuo-'\+segment\+'\.bin(?:\?[^']*)?'\)","fetch('chuo-'+segment+'.bin?v="+extension_version+"')",boot)
 path.write_text(boot)
 report.append({'route':name,'signals':'direction-specific 600m approximate blocks','bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest()})
 if name=='sobu':(ROOT/'development/sobu-package.json').write_text(json.dumps({'files':[prefix+f'-{i}.bin' for i in range(2)],'compressedBytes':len(packed),'uncompressedBytes':len(raw),'sha256':hashlib.sha256(packed).hexdigest(),'stationCount':10,'directions':2},indent=2))
(ROOT/'development/signalled-routes/release.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
