"""Choose game platforms without confusing a schematic with a train assignment."""

def select(review, direction, reported=None):
    if direction not in ('forward', 'reverse'):
        raise ValueError('Unknown travel direction')
    if review is None:
        return None, 'unreviewed'
    sides = review['sideTowardMatsumoto']
    if reported is not None:
        chosen = str(reported)
        if chosen not in sides:
            raise ValueError('Timetable platform absent from reviewed map: ' + chosen)
        return chosen, 'service-timetable'
    candidates = review.get('directionPlatforms', {}).get(direction, [])
    if candidates:
        if not all(candidate in sides for candidate in candidates):
            raise ValueError('Direction candidate absent from reviewed map')
        return candidates[0], 'operator-direction-game-choice'
    # This remains a modelling estimate, visibly distinguished in packet data.
    # Never use it to announce a train-specific number or door side.
    return next(iter(sides), None), 'unverified-game-choice'
