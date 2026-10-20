from pathlib import Path
import gzip,json,re
root=Path(__file__).resolve().parents[2];meta=json.loads((root/'development/sobu-package.json').read_text());bundle=json.loads(gzip.decompress(b''.join((root/p).read_bytes() for p in meta['files'])));html=bundle['html'];m=re.search(r'<script>(window.RAIL_PREBUILT_MODELS=.*?;\s*)</script>',html,re.S);assert m,'model source missing';(root/'development/sobu-source/rail-models.js').write_text(m[1]);print('Restored model source from published packet')

m=re.search(r'<script>(window.RAIL_DATA=.*?;\s*)</script>',html,re.S);assert m,'route source missing';(root/'development/sobu-source/rail-data.js').write_text(m[1]);print('Restored route source from published packet')
