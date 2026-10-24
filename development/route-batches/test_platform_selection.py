"""Regression for opposite-direction platforms and unknown service assignments."""
from pathlib import Path
import gzip, importlib.util, json, unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('platform_selection', HERE / 'platform-selection.py')
selection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selection)

class DirectionPlatforms(unittest.TestCase):
    def test_map_candidates_separate_the_running_directions(self):
        reviews = json.loads((HERE / 'batch-001/sources/priority-platform-review.json').read_text())
        self.assertEqual(reviews['directionReviewCount'], 62)
        for review in reviews['stations']:
            self.assertEqual(set(review['directionPlatforms']), {'forward', 'reverse'})
            for direction, candidates in review['directionPlatforms'].items():
                chosen, kind = selection.select(review, direction)
                self.assertIn(chosen, candidates)
                self.assertEqual(kind, 'operator-direction-game-choice')
        by_name = {r['name']: r for r in reviews['stations']}
        # First-key fallback previously selected the same face both ways.
        for name, pair in {'日野': ('1', '2'), '村井': ('2', '1'), '東小金井': ('3', '1'),
                           '茅野': ('1', '3'), '上諏訪': ('2', '1'), '岡谷': ('2', '1'),
                           '塩尻': ('2', '1'), '穴山': ('down', 'up')}.items():
            self.assertEqual(tuple(selection.select(by_name[name], d)[0] for d in ('forward', 'reverse')), pair)

    def test_timetable_overrides_game_choice_and_rejects_unknown_face(self):
        review = {'sideTowardMatsumoto': {'1': 1, '2': -1, '3': 1},
                  'directionPlatforms': {'forward': ['1'], 'reverse': ['3']}}
        self.assertEqual(selection.select(review, 'reverse', '2'), ('2', 'service-timetable'))
        with self.assertRaises(ValueError):
            selection.select(review, 'reverse', '99')
        with self.assertRaises(ValueError):
            selection.select(review, 'other')

    def test_packets_do_not_turn_direction_choices_into_train_assignments(self):
        for key in ('azusa', 'kaiji'):
            data = json.loads(gzip.decompress((HERE / f'batch-001/games/{key}.json.gz').read_bytes()))['data']
            for direction, route in data['routes'].items():
                for stop in route['physicalStops']:
                    if stop['name'] not in ('大久保', '東中野'):
                        self.assertTrue(stop['directionalPlatformChoiceReviewed'], (key, direction, stop['name']))
                    if stop['gamePlatformKey'] in ('up', 'down'):
                        self.assertIsNone(stop['gamePlatformNumber'])
                for stop in route['stops']:
                    if stop.get('reportedPlatform') is None:
                        self.assertFalse(stop['platformSideVerified'])
                        self.assertEqual(stop['platformChoiceKind'], 'operator-direction-game-choice')
                    else:
                        self.assertEqual(stop['gamePlatformKey'], str(stop['reportedPlatform']))

if __name__ == '__main__':
    unittest.main()
