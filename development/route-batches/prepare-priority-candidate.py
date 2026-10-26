"""Build an isolated release candidate; this never publishes or passes fidelity gates.

The public layout deliberately retains the development directory depth so shared
scene, terrain, neighbour and navigation URLs resolve without rewriting runtime
code. Production authority comes from the existing server publication catalogue.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse, hashlib, importlib.util, json, shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEST = HERE / 'batch-001'
PUBLIC = 'rail-games/priority/batch-001'
FILES = ['common.json.gz', 'e353.json.gz', 'rail.js', 'shared.js',
         'rail-audio.js', 'loader.js', 'model-builder.js',
         'scene-start.js', 'announcements-reviewed.js']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.links.append(attrs['src'])
        if tag == 'link' and attrs.get('href'):
            self.links.append(attrs['href'])

def stage(output, production):
    output, production = Path(output).resolve(), Path(production).resolve()
    # Candidate output must not overwrite a checkout or production's files.
    if output == ROOT or output.is_relative_to(ROOT) or output == production or output.is_relative_to(production):
        raise ValueError('Use a separate scratch directory for release candidates')
    output.mkdir(parents=True, exist_ok=True)
    assets = []
    def write(relative, data):
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        assets.append({'path': relative, 'sha256': sha(path), 'bytes': len(data)})
    for filename in FILES:
        data = ((HERE / 'priority-packet-loader.js') if filename == 'loader.js' else (DEST / 'games' / filename)).read_bytes()
        if filename == 'loader.js':
            marker = "if(!['azusa','kaiji'].includes(id))throw Error('Unknown route');"
            text = data.decode()
            if text.count(marker) != 1:
                raise ValueError('Review loader before adding production guard')
            text = text.replace(marker, marker + "\n if(!window.GamePublication||!(await GamePublication.guard(id)))return;\n GamePublication.registerPause(()=>window.dispatchEvent(new Event('pagehide')));")
            data = text.encode()
        write(PUBLIC + '/games/' + filename, data)
    for filename in ['rail-core.js', 'train-scene.js']:
        write(PUBLIC + '/engine/' + filename, (DEST / 'engine' / filename).read_bytes())
    for key in ['azusa', 'kaiji']:
        write(PUBLIC + '/games/' + key + '.json.gz', (DEST / 'games' / (key + '.json.gz')).read_bytes())
        text = (DEST / 'games' / (key + '.html')).read_text()
        marker = '<script src="loader.js"></script>'
        if text.count(marker) != 1:
            raise ValueError('Review entry scripts before staging')
        text = text.replace(marker, '<script src="../../../../config.js"></script><script src="../../../../game-publication.js"></script>' + marker)
        write(PUBLIC + '/games/' + key + '.html', text.encode())
    # Existing production dependencies are kept separate from new release assets.
    dependencies = []
    for filename in ['config.js', 'game-publication.js', 'game-publication.css',
                     'game-unavailable.html', 'game-unavailable.js', 'shared/neighbour-corridors.bin',
                     'index.html', 'chuo.html', 'depot-3d.html']:
        src = production / filename
        if not src.is_file():
            raise ValueError('Missing current production dependency: ' + filename)
        target = output / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
        dependencies.append({'path': filename, 'sha256': sha(src), 'bytes': src.stat().st_size})
    for key in ['azusa', 'kaiji']:
        entry = output / PUBLIC / 'games' / (key + '.html')
        parser = Links()
        parser.feed(entry.read_text())
        for link in parser.links:
            if link.startswith(('https://', 'http://', 'data:', '#')):
                continue
            target = (entry.parent / link.split('?')[0]).resolve()
            if not target.is_relative_to(output) or not target.is_file():
                raise ValueError('Unresolved candidate dependency: ' + link)
    spec = importlib.util.spec_from_file_location('release_gate', HERE / 'release-gate.py')
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    manifest = json.loads((DEST / 'manifest.json').read_text())
    jobs = []
    for job in manifest['jobs'][:2]:
        jobs.append({'jobId': job['id'], 'name': job['name'], 'ready': not (problems := gate.validate(job)), 'problems': problems})
    report = {'schema': 1, 'stage': 'isolated-publication-candidate',
              'deployed': False, 'public': False,
              'releaseReady': all(j['ready'] for j in jobs),
              'layoutAndDependenciesResolved': True,
              'catalogueGuard': 'Existing server catalogue; absent or hidden rows stop packet loading',
              'assets': sorted(assets, key=lambda r: r['path']),
              'productionDependencies': dependencies, 'jobs': jobs,
              'note': 'Packaging does not resolve geometry, rolling stock, current operating limits or neighbouring-line implementation.'}
    (output / 'candidate-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--production-root', required=True)
    args = parser.parse_args()
    report = stage(args.output, args.production_root)
    print(json.dumps({'assets': len(report['assets']), 'layoutAndDependenciesResolved': True,
                      'releaseReady': report['releaseReady'], 'deployed': False}, ensure_ascii=False))
