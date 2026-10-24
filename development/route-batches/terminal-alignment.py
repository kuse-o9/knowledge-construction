"""Source-based track identities with explicitly estimated transition dimensions."""
import math

RYUO_TRACKS = {'1': 7.56, '2': 0., '3': -7.56}
LAYOUTS = {
    '竜王': {'tracks': RYUO_TRACKS, 'platforms': [(['1'],11.34),(['2','3'],-3.78)]},
    '甲府': {'tracks': RYUO_TRACKS, 'platforms': [(['1'],11.34),(['2','3'],-3.78)]},
    '塩山': {'tracks': RYUO_TRACKS, 'platforms': [(['1'],11.34),(['2','3'],-3.78)]},
    '山梨市': {'tracks': {'1':-7.56,'2':0.,'3':7.56}, 'platforms': [(['1'],-11.34),(['2','3'],3.78)]},
}

def blend(distance):
    t = max(0., min(1., (800. - abs(distance)) / 500.))
    return t * t * (3. - 2. * t)

def separation(base, station_delta, direction, platform, station='竜王'):
    """Travel-left offset. Opposite platform2 routes share one physical centre."""
    sign = 1 if direction == 'forward' else -1
    target = LAYOUTS[station]['tracks'][str(platform)] * sign
    weight = blend(station_delta)
    return base + (target - base) * weight

def metadata(stop, direction):
    platform = stop['gamePlatformKey']
    layout = LAYOUTS[stop['name']]
    return {'id': stop['name'], 'platform': platform,
            'nativeTrackOffset': layout['tracks'][platform],
            'nativeDirection': 1 if direction == 'forward' else -1,
            'trackOffsets': layout['tracks'],
            'platforms': [{'numbers':numbers,'centre':centre,'width':4.4}
                          for numbers,centre in layout['platforms']],
            'flatHalfLength': 300, 'transitionHalfLength': 800,
            'dimensionsEstimated': True, 'topologySource': stop['platformSideSource']}
