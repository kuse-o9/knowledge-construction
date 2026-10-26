"""Source-based track identities with explicitly estimated transition dimensions."""
import math

import json
from pathlib import Path
_MODELS = json.loads((Path(__file__).parent/'batch-001/sources/station-layout-models.json').read_text())['stations']
LAYOUTS = {name: {'tracks': row['trackOffsets'],
                 'platforms': [(p['numbers'], p['centre']) for p in row['platforms']],
                 'runningPlatforms': row['runningPlatforms']}
           for name, row in _MODELS.items()}

def blend(distance):
    t = max(0., min(1., (800. - abs(distance)) / 500.))
    return t * t * (3. - 2. * t)

def separation(base, station_delta, direction, platform, station='竜王'):
    """Travel-left offset. Opposite platform2 routes share one physical centre."""
    sign = 1 if direction == 'forward' else -1
    target = LAYOUTS[station]['tracks'][str(platform)] * sign
    weight = blend(station_delta)
    return base + (target - base) * weight

def metadata(stop, direction, route_id="azusa"):
    platform = stop['gamePlatformKey']
    layout = LAYOUTS[stop['name']]
    return {'id': stop['name'], 'platform': platform,
            'nativeTrackOffset': layout['tracks'][platform],
            'nativeDirection': 1 if direction == 'forward' else -1,
            'trackOffsets': layout['tracks'],
            'platforms': [{'numbers':numbers,'centre':centre,'width':4.4}
                          for numbers,centre in layout['platforms']],
            'flatHalfLength': 300, 'transitionHalfLength': 800,
            'dimensionsEstimated': True, 'topologySource': stop['platformSideSource'],
            'runningPlatforms': _MODELS[stop['name']]['runningPlatformsByRoute'][route_id]}
