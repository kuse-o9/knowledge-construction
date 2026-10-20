"""Read/write retained Yamanote models, including the compressed model package."""
from pathlib import Path
import json,gzip,re,hashlib
def load_yamanote(root):
 path=Path(root)/'yamanote/rail-models.js';text=path.read_text();marker='window.RAIL_PREBUILT_MODELS='
 if marker in text:return json.JSONDecoder().raw_decode(text.split(marker,1)[1])[0]
 return json.loads(gzip.decompress(b''.join((Path(root)/f'yamanote/rail-models-{i}.bin').read_bytes() for i in range(2))))
def save_yamanote(root,models):
 root=Path(root);raw=json.dumps(models,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(raw,compresslevel=9,mtime=0);version=hashlib.sha256(packed).hexdigest()[:12];mid=(len(packed)+1)//2
 for i,p in enumerate([packed[:mid],packed[mid:]]):(root/f'yamanote/rail-models-{i}.bin').write_bytes(p)
 script="""/* Retained model package. Wait for RAIL_MODELS_READY before initializing 3D. */
window.RAIL_MODELS_READY=(async()=>{const parts=await Promise.all(FILES.map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('models');return new Uint8Array(await r.arrayBuffer());})),bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}window['RAIL_PREBUILT_MODELS']=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());})();
""".replace('FILES',json.dumps([f'rail-models-{i}.bin?v={version}' for i in range(2)]))
 (root/'yamanote/rail-models.js').write_text(script)
 return {'sha256':hashlib.sha256(packed).hexdigest(),'bytes':len(packed)}
