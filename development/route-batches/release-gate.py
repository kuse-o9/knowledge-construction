"""Fail closed: a manifest entry and source map never count as a completed game."""
from pathlib import Path
import hashlib,json,argparse
ROOT=Path(__file__).resolve().parents[2]
def validate(job,root=ROOT):
 problems=[]
 for gate,state in job['qualityGates'].items():
  if state!='passed':problems.append('quality:'+gate+':'+state)
 artifacts=job.get('releaseArtifacts',[])
 if not artifacts:problems.append('No release artifacts')
 for artifact in artifacts:
  p=(root/artifact['path']).resolve()
  if not p.is_relative_to(root.resolve()):problems.append('Artifact outside repository');continue
  if not p.is_file():problems.append('Missing artifact: '+artifact['path']);continue
  if hashlib.sha256(p.read_bytes()).hexdigest()!=artifact['sha256']:problems.append('Artifact hash mismatch: '+artifact['path'])
 if not job.get('entryPoint') or job.get('entryPoint') not in [a['path']for a in artifacts]:problems.append('No tested game entry point among release artifacts')
 if not job.get('validationReport'):problems.append('No validation report')
 else:
  reportPath=(root/job['validationReport']).resolve()
  if not reportPath.is_relative_to(root.resolve()) or not reportPath.is_file():problems.append('Missing validation report')
  else:
   try:
    report=json.loads(reportPath.read_text())
    if report.get('pass') is not True or report.get('jobId')!=job['id']:problems.append('Validation report does not pass this job')
    if set(report.get('directions',[]))!={'forward','reverse'}:problems.append('Both directions not validated')
    if not job.get('expectedPhysicalStationCodes') or set(report.get('physicalStationCodes',[]))!=set(job['expectedPhysicalStationCodes']):problems.append('All physical stations not validated')
    for artifact in artifacts:
     if report.get('testedArtifactHashes',{}).get(artifact['path'])!=artifact['sha256']:problems.append('Report does not cover artifact hash: '+artifact['path'])
   except (ValueError,TypeError):problems.append('Invalid validation report')
 return problems
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--manifest',default=str(Path(__file__).parent/'batch-001/manifest.json'));p.add_argument('--require-ready',action='store_true');a=p.parse_args();m=json.loads(Path(a.manifest).read_text());results=[{'jobId':j['id'],'ready':not (errors:=validate(j)),'problems':errors}for j in m['jobs']];out={'batch':m['batch'],'requested':m['goal'],'ready':sum(x['ready']for x in results),'jobs':results};Path(a.manifest).with_name('release-readiness.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'requested':out['requested'],'ready':out['ready']}));raise SystemExit(1 if a.require_ready and out['ready']<out['requested']else 0)
