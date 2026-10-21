"""Retain the existing controls/stop model, allowing a validated per-stock speed ceiling.
Actual operating speed profiles are separate, still-required route inputs.
"""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent/'batch-001/engine';OUT.mkdir(exist_ok=True)
p=ROOT/'development/signalled-routes/chuo-local/rail-core.js';source=p.read_text();text=source.replace("const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));", "const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));\nfunction vehicleMaximum(route){const n=Number(route.vehicleMaximum);return (Number.isFinite(n)&&n>0&&n<=360?n:120)/3.6;}")
assert text.count('0,120/3.6)')==1;text=text.replace('0,120/3.6)','0,vehicleMaximum(geo.route))').replace('s.speed>120/3.6+1e-6','s.speed>vehicleMaximum(route)+1e-6')
(OUT/'rail-core.js').write_text(text)
(OUT/'provenance.json').write_text(json.dumps({'stage':'development-core','releaseReady':False,'base':'development/signalled-routes/chuo-local/rail-core.js','baseSha256':hashlib.sha256(source.encode()).hexdigest(),'change':'Per-route vehicle maximum replaces the fixed 120 km/h storage/motion ceiling. Station/line limits remain independent.','pending':['Stock-specific acceleration and braking verification','Validated route-specific operating profiles','Integration with the batch route scene and controls']},ensure_ascii=False,indent=2)+'\n')
