"""Prepare incremental public releases from verified games, never source-only jobs.

This builds a reviewable upload plan. GitHub saves, deployment and public hash
readback are separate steps; writing a local catalogue is not a deployment.
"""
from pathlib import Path,PurePosixPath
import argparse,hashlib,importlib.util,json,os

HERE=Path(__file__).parent;ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('release_gate',HERE/'release-gate.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
CATALOG='rail-games/catalog.json'

def digest(data):return hashlib.sha256(data).hexdigest()
def encode(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
def public_path(value):
 if not isinstance(value,str)or '\\'in value or '?'in value or '#'in value or ':'in value:raise ValueError('Invalid public artifact path')
 p=PurePosixPath(value)
 if p.is_absolute()or '..'in p.parts or not value.startswith('rail-games/')or str(p)!=value or value==CATALOG:raise ValueError('New game artifacts must be isolated below rail-games/')
 return value
def check_assets(assets,root):
 for item in assets:
  path=public_path(item['path']);p=(root/path).resolve()
  if not p.is_relative_to(root.resolve())or not p.is_file()or digest(p.read_bytes())!=item['sha256']:raise ValueError('Missing or changed public artifact: '+path)

def prepare(manifest,root=ROOT):
 root=Path(root);catalog_path=root/CATALOG
 previous=json.loads(catalog_path.read_text())if catalog_path.exists()else {'schema':1,'routes':[]}
 if previous.get('schema')!=1:raise ValueError('Unsupported public catalogue version')
 routes={}
 for entry in previous['routes']:
  if entry['id']in routes:raise ValueError('Duplicate existing public route')
  check_assets(entry['assets'],root);public_path(entry['path']);routes[entry['id']]=entry
 blocked=[];eligible=[];upload={}
 for job in manifest['jobs']:
  errors=gate.validate(job,root=root)
  if errors:
   blocked.append({'jobId':job['id'],'reasons':errors});continue
  publication=job.get('publication',{})
  if not publication.get('operator'):raise ValueError('Verified route needs its public operator: '+job['id'])
  assets=sorted(job['releaseArtifacts'],key=lambda a:a['path']);check_assets(assets,root)
  entry=public_path(job['entryPoint'])
  if not entry.endswith('.html'):raise ValueError('Public game entry must be tested HTML')
  version=digest(encode(assets))
  record={'id':job['id'],'name':job['name'],'operator':publication['operator'],'path':entry,'version':version,'assets':assets}
  for asset in assets:
   old=upload.get(asset['path'])
   if old is not None and old!=asset['sha256']:raise ValueError('Two releases disagree on a shared artifact')
   upload[asset['path']]=asset['sha256']
  routes[job['id']]=record;eligible.append(job['id'])
 catalog={'schema':1,'routes':sorted(routes.values(),key=lambda r:r['id'])}
 data=encode(catalog);changed=bool(eligible)and(not catalog_path.exists()or catalog_path.read_bytes()!=data)
 # A rerun never creates empty public routes or removes existing released games.
 if not changed:upload={}
 if changed:upload[CATALOG]=digest(data)
 plan={'schema':1,'batch':manifest['batch'],'eligibleJobs':eligible,'blockedJobs':blocked,'catalogChanged':changed,'publicRoutes':len(routes),'uploads':[{'path':p,'sha256':sha}for p,sha in sorted(upload.items())],'deploymentComplete':False,'publicReadbackComplete':False,'nextSteps':['Upload only the listed tested assets and catalogue in one commit','Check the Pages deployment for that commit','Read back every uploaded public asset and compare its SHA-256','Record deployed commit, public URL and readback results']if changed else []}
 return plan,data

def atomic_write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_name(path.name+'.pending');temporary.write_bytes(data);os.replace(temporary,path)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--manifest',default=str(HERE/'batch-001/manifest.json'));p.add_argument('--write',action='store_true',help='Write catalogue only when verified new releases exist');a=p.parse_args();manifest=json.loads(Path(a.manifest).read_text());plan,data=prepare(manifest)
 if a.write and plan['catalogChanged']:atomic_write(ROOT/CATALOG,data)
 atomic_write(Path(a.manifest).with_name('publication-plan.json'),encode(plan))
 print(json.dumps({k:plan[k]for k in ['eligibleJobs','catalogChanged','publicRoutes','deploymentComplete','publicReadbackComplete']},ensure_ascii=False))
