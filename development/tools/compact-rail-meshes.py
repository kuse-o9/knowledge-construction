"""Compact floating track/station vertices after geometric edits (2.5-10 mm error).
Only track/station meshes are changed. Train and city meshes are left alone.
"""
from pathlib import Path
import json,re,gzip,base64
from rail_model_io import load_yamanote,save_yamanote
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
def compact(value):
 if isinstance(value,list):
  for x in value:compact(x)
 elif isinstance(value,dict):
  if isinstance(value.get('positions'),str) and 'indices' in value and not value.get('positionScale'):
   p=np.frombuffer(base64.b64decode(value['positions']),dtype='<f4');scale=max(.005,np.ceil(float(np.max(np.abs(p)))/32760/.005)*.005)
   if not np.isfinite(p).all() or scale>.1:raise ValueError('Unexpected mesh range')
   value['positions']=base64.b64encode(np.rint(p/scale).astype('<i2').tobytes()).decode();value['positionScale']=float(scale)
  else:
   for v in value.values():compact(v)
def main():
 for name in ['chuo','chuo-local','keihin','sobu']:
  path=ROOT/(name+'.html');boot=path.read_text();inline=re.search(r'<script id="game-bundle"[^>]*>(.*?)</script>',boot,re.S);prefix='sobu-data' if name=='sobu' else name+'-bundle';raw=base64.b64decode(inline[1]) if inline else b''.join((ROOT/(prefix+f'-{i}.bin')).read_bytes() for i in range(2));payload=json.loads(gzip.decompress(raw));html=payload['html'];start=html.index('window.RAIL_PREBUILT_MODELS=')+len('window.RAIL_PREBUILT_MODELS=');m,length=json.JSONDecoder().raw_decode(html[start:])
  for kind in ['tracks','stations']:compact(m[kind])
  payload['html']=html[:start]+json.dumps(m,ensure_ascii=False,separators=(',',':'))+html[start+length:];packed=gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0)
  if inline:path.write_text(boot[:inline.start(1)]+base64.b64encode(packed).decode()+boot[inline.end(1):])
  else:
   mid=(len(packed)+1)//2
   for i,b in enumerate([packed[:mid],packed[mid:]]):(ROOT/(prefix+f'-{i}.bin')).write_bytes(b)
  print(name,len(raw),'->',len(packed),flush=True)
 for name in ['west','ome','okutama','fuji','lake']:
  path=ROOT/('chuo-'+name+'.bin');p=json.loads(gzip.decompress(path.read_bytes()))
  for kind in ['tracks','stations']:compact(p['models'][kind])
  path.write_bytes(gzip.compress(json.dumps(p,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0))
 m=load_yamanote(ROOT)
 for kind in ['tracks','stations']:compact(m[kind])
 save_yamanote(ROOT,m)
 for path in (ROOT/'yamanote/models').glob('*.json'):
  p=json.loads(path.read_text());compact(p);path.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')))
if __name__=='__main__':main()
