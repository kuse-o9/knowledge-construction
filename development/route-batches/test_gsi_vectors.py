import gzip
import hashlib
import importlib.util
import json
import struct
import unittest
from pathlib import Path
import gsi_vector as V

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('gsi_acquire', HERE/'acquire-gsi-structures.py')
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)


def vint(n):
    out = bytearray()
    while n > 127:
        out.append((n & 127) | 128)
        n >>= 7
    return bytes(out + bytes([n]))


def field(n, value):
    return vint(n*8+2)+vint(len(value))+value


class GSIVectors(unittest.TestCase):
    def test_external_wire_contract_properties_and_multiple_paths(self):
        # Move(10,20), line(15,17), move(-3,6), line(-2,8).
        # Absolute coordinates across paths share the same delta cursor.
        commands = bytes([9, 20, 40, 10, 10, 5, 9, 35, 21, 10, 2, 4])
        feature = field(2, bytes([0, 0])) + bytes([24, 2]) + field(4, commands)
        layer = field(1, b'railway')+field(2, feature)+field(3, b'railState')+field(4, bytes([40, 1]))+bytes([40])+vint(4096)+bytes([120, 2])
        decoded = V.decode(field(3, layer))['railway']
        self.assertEqual(decoded['extent'], 4096)
        f = decoded['features'][0]
        self.assertEqual(f['properties'], {'railState': 1})
        self.assertEqual(f['paths'], [[[10, 20], [15, 17]], [[-3, 6], [-2, 8]]])

    def test_signed_numbers_floats_and_polygon_closure(self):
        self.assertEqual(V.property_value(bytes([32])+vint((1 << 64)-3)), -3)
        self.assertEqual(V.property_value(bytes([48, 5])), -3)
        self.assertEqual(V.property_value(bytes([25])+struct.pack('<d', 2.125)), 2.125)
        self.assertEqual(V.geometry([9, 0, 0, 18, 20, 0, 0, 20, 15], 3), [[[0, 0], [10, 0], [10, 10], [0, 0]]])

    def test_truncation_rejected_instead_of_inventing_coordinates(self):
        for data in [b'\x80', b'\x1a\x10\x00', b'\x00', b'\x0b']:
            with self.assertRaises(ValueError):
                list(V.fields(data))
        with self.assertRaises(ValueError):
            V.geometry([9, 1], 2)
        with self.assertRaises(ValueError):
            V.geometry([15], 2)

    def test_zoom_sensitive_classification_and_geographic_coordinates(self):
        self.assertEqual(V.rail_state(1, 14), 'bridge-or-viaduct')
        self.assertEqual(V.rail_state(100, 13), 'tunnel')
        self.assertEqual(V.rail_state(1, 13), 'unknown')
        self.assertEqual(V.rail_state(100, 14), 'unknown')
        self.assertEqual(V.tile(139.70, 35.69, 14), (14549, 6451))
        self.assertAlmostEqual(V.lonlat([0, 0], 0, 0, 0, 4096)[1], 85.05112878)

    def test_match_rejects_crossing_lines_and_uses_engine_distance(self):
        points = [[139, 36], [139.005, 36], [139.01, 36]]
        def feat(code, path):
            return {'properties': {'rtCode': code, 'railState': 1}, 'sourceTile': [14, 0, 0], 'sourceFeatureIndex': 0, 'paths': [path]}
        parallel = feat('40201000000', [[139.002, 36], [139.004, 36]])
        crossing = feat('40201000000', [[139.003, 35.9998], [139.003, 36.0002]])
        private = feat('40202000000', parallel['paths'][0])
        report = A.match(points, [parallel, crossing, private])
        self.assertEqual(len(report['ranges']), 1)
        self.assertAlmostEqual(report['ranges'][0]['start'], A.metres(points[0], parallel['paths'][0][0]), places=2)
        self.assertAlmostEqual(report['length'], sum(A.metres(a, b) for a, b in zip(points, points[1:])))
        self.assertEqual(len(report['uncertainNearbyFeatures']), 1)

    def test_acquired_data_hashes_geometry_and_unfinished_status(self):
        source = HERE/'batch-001/sources/chuo-gsi-railways.json.gz'
        data = json.loads(gzip.decompress(source.read_bytes()))
        self.assertEqual(data['failures'], [])
        self.assertEqual(data['requestedTiles'], len(data['tiles']))
        self.assertEqual(len({tuple(t['tile']) for t in data['tiles']}), len(data['tiles']))
        self.assertTrue(all(len(t['sha256']) == 64 and t['bytes'] > 0 for t in data['tiles']))
        self.assertTrue(all(-180 < p[0] < 180 and -90 < p[1] < 90 for f in data['features'] for path in f['paths'] for p in path))
        for key in ['azusa', 'kaiji']:
            report = json.loads((HERE/'batch-001/reference-paths'/f'{key}-gsi-structures-audit.json').read_text())
            self.assertTrue(report['completeTileAcquisition'])
            self.assertFalse(report['releaseReady'])
            self.assertEqual(report['sourceSha256'], hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertTrue(any(x['kind'] == 'bridge-or-viaduct' for x in report['ranges']))
            self.assertTrue(any(x['kind'] == 'tunnel' for x in report['ranges']))
            self.assertTrue(all(x['review']=='pending' and x['railHeight']=='unresolved' and 0 <= x['start'] < x['end'] <= report['length']+.001 for x in report['ranges']))


if __name__ == '__main__':
    unittest.main()
