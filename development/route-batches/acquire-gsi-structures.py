"""Acquire GSI railway classifications along existing source alignments.

Only source data/candidates are produced. No rail heights, bridges or tunnel
portals are approved here, and this script cannot change publication status.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import math
import time
import urllib.request
import numpy as np
from scipy.spatial import cKDTree
from gsi_vector import decode, tile, lonlat, rail_state

HERE = Path(__file__).parent
DEST = HERE / 'batch-001'
URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'


def metres(a, b):
    return math.hypot((b[0]-a[0])*111320*math.cos(math.radians((a[1]+b[1])/2)), (b[1]-a[1])*111320)


def needed_tiles(points, z):
    tiles = set()
    for a, b in zip(points, points[1:]):
        count = max(1, math.ceil(metres(a, b) / 80))
        for i in range(count + 1):
            p = [a[k] + (b[k]-a[k])*i/count for k in range(2)]
            # Cover both sides of a source path at tile boundaries.
            for dx, dy in [(0, 0), (-.0012, 0), (.0012, 0), (0, -.001), (0, .001)]:
                tiles.add(tile(p[0]+dx, p[1]+dy, z))
    return tiles


def acquire(x, y, z, cache):
    url = URL.format(z=z, x=x, y=y)
    file = cache / f'{z}-{x}-{y}.pbf'
    last = None
    for attempt in range(2):
        try:
            if file.exists():
                raw = file.read_bytes()
            else:
                with urllib.request.urlopen(url, timeout=25) as response:
                    raw = response.read(16*1024*1024+1)
                if len(raw) > 16*1024*1024:
                    raise ValueError('Tile exceeds bound')
                # Validate before caching.
                decode(raw, {'railway'})
                file.write_bytes(raw)
            data = decode(raw, {'railway'}).get('railway', {'extent': 4096, 'features': []})
            features = []
            for i, f in enumerate(data['features']):
                if f['type'] != 2:
                    continue
                features.append({'sourceTile': [z, x, y], 'sourceFeatureIndex': i,
                                 'properties': f['properties'],
                                 'paths': [[lonlat(p, x, y, z, data['extent']) for p in path] for path in f['paths']]})
            return {'tile': [z, x, y], 'url': url, 'sha256': hashlib.sha256(raw).hexdigest(),
                    'bytes': len(raw)}, features
        except Exception as error:
            last = error
            if attempt == 0:
                time.sleep(.25)
    raise RuntimeError(f'{url}: {last}')


def match(points, features):
    # Along-distance uses the exact formula used by the driving engine, not
    # the constant latitude scale used solely for nearest-segment searching.
    scale = np.array([111320*math.cos(math.radians(np.mean(np.array(points)[:, 1]))), 111320])
    xy = np.array(points) * scale
    a, v = xy[:-1], np.diff(xy, axis=0)
    l2 = (v*v).sum(axis=1)
    lengths = np.array([metres(a, b) for a, b in zip(points, points[1:])])
    cumulative = np.r_[0, np.cumsum(lengths)]
    tree = cKDTree(a+v*.5)
    matched, uncertain = [], []
    for feature in features:
        props = feature['properties']
        # JR only: exclude crossing subway/private lines and suspended sections.
        if not str(props.get('rtCode', '')).startswith(('40201', '40216')):
            continue
        state = rail_state(props.get('railState'), 14)
        if state not in ('bridge-or-viaduct', 'tunnel', 'underground', 'snow-shed'):
            continue
        for path_index, path in enumerate(feature['paths']):
            if len(path) < 2:
                continue
            ps = np.array(path)*scale
            _, ix = tree.query(ps, k=min(32, len(v)))
            diff = ps[:, None, :] - a[ix]
            t = np.clip((diff*v[ix]).sum(axis=2)/np.maximum(l2[ix], 1e-12), 0, 1)
            errors = np.linalg.norm(diff-t[:, :, None]*v[ix], axis=2)
            pick = np.argmin(errors, axis=1)
            rows = np.arange(len(ps))
            indices = ix[rows, pick]
            distance = errors[rows, pick]
            if not (distance < 40).any():
                continue
            along = cumulative[indices]+lengths[indices]*t[rows, pick]
            original = sum(metres(a, b) for a, b in zip(path, path[1:]))
            span = float(along.max()-along.min())
            forward = ps[-1]-ps[0]
            direction = v[indices[len(indices)//2]]
            agreement = abs(float(forward@direction))/max(float(np.linalg.norm(forward)*np.linalg.norm(direction)), 1e-9)
            item = {'kind': state, 'sourceTile': feature['sourceTile'],
                    'sourceFeatureIndex': feature['sourceFeatureIndex'], 'pathIndex': path_index,
                    'rtCode': props.get('rtCode'), 'snglDbl': props.get('snglDbl'),
                    'start': round(float(along.min()), 3), 'end': round(float(along.max()), 3),
                    'maxMatchingErrorMetres': round(float(distance.max()), 3),
                    'matchedVertexFraction': round(float((distance < 40).mean()), 4),
                    'sourceLength': round(original, 3), 'headingAgreement': round(agreement, 4),
                    'review': 'pending', 'railHeight': 'unresolved'}
            if distance.max() < 40 and span > 3 and .65 < span/max(original, 1) < 1.35 and agreement > .75:
                matched.append(item)
            else:
                uncertain.append(item)
    matched.sort(key=lambda f: (f['kind'], f['start']))
    groups = []
    for item in matched:
        # A small gap tolerance only joins source-classified fragments. It does
        # not turn ambiguous nearby railways into an accepted structure.
        if groups and groups[-1]['kind'] == item['kind'] and item['start'] <= groups[-1]['end']+4:
            groups[-1]['end'] = max(groups[-1]['end'], item['end'])
            groups[-1]['members'].append(item)
        else:
            groups.append({'kind': item['kind'], 'start': item['start'], 'end': item['end'],
                           'members': [item], 'review': 'pending', 'railHeight': 'unresolved'})
    return {'length': float(cumulative[-1]), 'ranges': groups, 'uncertainNearbyFeatures': uncertain}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', required=True)
    args = parser.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    alignments = {key: json.loads(gzip.decompress((DEST/'alignments'/f'{key}.json.gz').read_bytes())) for key in ['azusa', 'kaiji']}
    tiles = set().union(*(needed_tiles(a['points'], 14) for a in alignments.values()))
    print(json.dumps({'tilesToAcquire': len(tiles)}), flush=True)
    metadata, features, failures = [], [], []
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(acquire, x, y, 14, cache): [x, y] for x, y in sorted(tiles)}
        for future in as_completed(jobs):
            try:
                meta, fs = future.result()
                metadata.append(meta)
                features.extend(fs)
            except Exception as error:
                failures.append({'tile': jobs[future], 'error': str(error)})
            if (len(metadata)+len(failures)) % 20 == 0:
                print(json.dumps({'acquired': len(metadata), 'failed': len(failures)}), flush=True)
    source = {'source': '国土地理院 地理院地図Vector提供実験', 'urlTemplate': URL,
              'specification': 'https://github.com/gsi-cyberjapan/gsimaps-vector-experiment',
              'attributeSpecification': 'https://maps.gsi.go.jp/help/pdf/vector/attribute.pdf',
              'license': 'PDL1.0',
              'licenseURL': 'https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html',
              'credit': '地理院タイル（ベクトルタイル）を加工して作成',
              'sourceAsOf': '2026-07-01 (provider README; not survey date)',
              'acquiredAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'requestedTiles': len(tiles), 'tiles': sorted(metadata, key=lambda x: x['tile']),
              'failures': failures, 'features': sorted(features, key=lambda x: (x['sourceTile'], x['sourceFeatureIndex']))}
    raw = gzip.compress(json.dumps(source, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    (DEST/'sources/chuo-gsi-railways.json.gz').write_bytes(raw)
    for key, alignment in alignments.items():
        report = {'id': key, 'stage': 'source-structure-candidates', 'releaseReady': False,
                  'sourceSha256': hashlib.sha256(raw).hexdigest(),
                  'alignmentSha256': hashlib.sha256((DEST/'alignments'/f'{key}.json.gz').read_bytes()).hexdigest(),
                  'completeTileAcquisition': not failures,
                  'distanceFormula': 'same local mean-latitude metres function as game core',
                  'limitations': ['Map classification does not provide rail elevation',
                                 'Parallel lines and source epoch differences require review',
                                 'Tile-clipped endpoints are not tunnel portals',
                                 'No candidate here is an approved game structure'],
                  **match(alignment['points'], features)}
        (DEST/'reference-paths'/f'{key}-gsi-structures-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps({'id': key, 'ranges': {kind: sum(x['kind']==kind for x in report['ranges']) for kind in ['bridge-or-viaduct', 'tunnel', 'underground', 'snow-shed']}, 'uncertain': len(report['uncertainNearbyFeatures'])}), flush=True)
    if failures:
        raise SystemExit('Incomplete source acquisition; inspect failures')


if __name__ == '__main__':
    main()
