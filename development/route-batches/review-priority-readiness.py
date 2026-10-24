"""Record completed checks while leaving unfinished reproduction gates closed."""
from pathlib import Path
import argparse, gzip, hashlib, importlib.util, json, subprocess

HERE=Path(__file__).resolve().parent
DEST=HERE/'batch-001'
REPORTS=['geometry-review-diagnostics.json','integrated-game-diagnostics.json',
         'integrated-running-diagnostics.json','train-scene-diagnostics.json',
         'station-model-diagnostics.json','station-scene-diagnostics.json',
         'local-platform-diagnostics.json','priority-speed-diagnostics.json',
         'station-rail-profile-diagnostics.json','station-loop-diagnostics.json',
         'terminal-interlocking-diagnostics.json']

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def review(candidate):
    evidence={}
    for name in REPORTS:
        report=json.loads((DEST/name).read_text())
        if report.get('pass')is not True:raise ValueError('Incomplete check: '+name)
        for file,sha in report['inputHashes'].items():
            if digest(DEST/file)!=sha:raise ValueError('Stale evidence: '+name+' '+file)
        evidence[name]=digest(DEST/name)
    # Run the actual bilingual wording assertions; do not infer a pass from source presence.
    announced=json.loads(subprocess.check_output(['node',str(HERE/'test_reviewed_announcements.cjs')],text=True))
    if not announced['pass']or announced['stationDirectionCases']!=39 or announced['nonJRTransferChecks']!=5:
        raise ValueError('Announcements incomplete')
    evidence['games/announcements-reviewed.js']=digest(DEST/'games/announcements-reviewed.js')
    candidate=Path(candidate)
    staged=json.loads((candidate/'candidate-manifest.json').read_text())
    checked=json.loads((candidate/'candidate-validation.json').read_text())
    if checked.get('pass')is not True or len(checked['runs'])!=10:
        raise ValueError('Candidate publication checks incomplete')
    for file,sha in checked['inputHashes'].items():
        if digest(candidate/file)!=sha:raise ValueError('Stale publication candidate '+file)
    units=json.loads((DEST/'validation-suite-summary.json').read_text())
    if units['testsRun']<48 or units['passed']!=units['testsRun']or units['failures']or units['errors']or units['skipped']:
        raise ValueError('Unit suite incomplete')
    terminal=json.loads((DEST/'terminal-interlocking-diagnostics.json').read_text())
    if terminal['assertions']<25 or not terminal['oppositeDirectionExclusion']or not terminal['rearClearance']:
        raise ValueError('Shared terminal validation incomplete')
    for name in ['sources/station-topology-review-20261024.json','sources/priority-speed-review.json']:
        evidence[name]=digest(DEST/name)
    manifest_path=DEST/'manifest.json'
    manifest=json.loads(manifest_path.read_text())
    spec=importlib.util.spec_from_file_location('release_gate',HERE/'release-gate.py')
    gate_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate_module)
    jobs=[]
    for job,key,expected in zip(manifest['jobs'][:2],['azusa','kaiji'],[64,42]):
        packet=json.loads(gzip.decompress((DEST/'games'/(key+'.json.gz')).read_bytes()))
        for direction,route in packet['data']['routes'].items():
            if len(route['physicalStops'])!=expected:raise ValueError('Physical station inventory incomplete')
            if len({s['code']for s in route['physicalStops']})!=expected:raise ValueError('Duplicate physical station codes')
            if not {s['code']for s in route['stops']}<={s['code']for s in route['physicalStops']}:
                raise ValueError('Selected service missing a physical station')
            if any(not s['directionalPlatformChoiceReviewed']for s in route['physicalStops']if s['name']not in ['大久保','東中野']):
                raise ValueError('Direction platform review incomplete')
        # Each gate has its own meaning. Mesh/software passes cannot certify
        # measured dimensions, 2026 operating restrictions or unbuilt neighbours.
        for gate in ['allStationsAndStops','bilingualAnnouncements',
                     'manualAutoAndEarlyDeparture','saveAndLoad','softwareRendering']:
            job['qualityGates'][gate]='passed'
        job['expectedPhysicalStationCodes']=[s['code']for s in packet['data']['routes']['forward']['physicalStops']]
        job['workArtifacts']['publicationReview']='priority-release-review.json'
        pending=[g for g,state in job['qualityGates'].items()if state!='passed']
        problems=gate_module.validate(job)
        jobs.append({'jobId':job['id'],'name':job['name'],'ready':not problems,
                     'passedGates':[g for g,state in job['qualityGates'].items()if state=='passed'],
                     'pendingGates':pending,'blockingProblems':problems,'packetSha256':digest(DEST/'games'/(key+'.json.gz'))})
    report={'checked':'2026-10-24','releaseReady':all(j['ready']for j in jobs),
            'public':False,'deployed':False,'softwareValidationPass':True,
            'packagingAndPublicationGuardPass':True,'candidateCases':10,
            'units':units,'jobs':jobs,'evidence':evidence,
            'limits':'Software and direct-positioning checks; no physical GPU, listening, phone or full-route real-time test claim. Source and reconstruction limitations remain in geometry-review-status.json.'}
    (DEST/'publication-candidate-manifest.json').write_text(json.dumps(staged,ensure_ascii=False,indent=2)+'\n')
    (DEST/'publication-candidate-validation.json').write_text(json.dumps(checked,ensure_ascii=False,indent=2)+'\n')
    (DEST/'priority-release-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'releaseReady':report['releaseReady'],'public':False,'jobs':jobs},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--candidate',required=True)
    review(parser.parse_args().candidate)
