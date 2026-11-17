"""Controlled road geometry tests for the compact browser basemap artifact."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from map05.basemap import compact_map as compacting


def document(features, bounds=None):
    bounds = bounds or [17.2, 49.9, 19.0, 51.5]
    return {'schemaVersion': 1, 'bounds': bounds, 'source': {'provider': 'OSM_GEOFABRIK', 'sourceSha256': 'a' * 64}, 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0', 'regions': {'PLANNER': {'bounds': bounds, 'features': features}}}


def road(identity, points, name='Wspólna', category='residential'):
    return {'id': identity, 'kind': 'road', 'category': category, 'name': name, 'points': points}


class CompactMapTests(unittest.TestCase):
    def test_shared_names_and_categories_are_indexed_and_codec_matches_reference(self):
        source = document([road('10', [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]), road('11', [[-120.2, 38.5], [-120.95, 40.7]])], [-127, 38, -120, 44])
        original = deepcopy(source)
        result = compacting.compact(source, 'b' * 64)
        region = result['regions']['PLANNER']
        self.assertEqual(region['encoding'], 'polyline5-indexed')
        self.assertEqual(region['categories'], ['residential'])
        self.assertEqual(region['names'], ['Wspólna'])
        self.assertEqual([f[:4] for f in region['features']], [['10', 0, 0, '_p~iF~ps|U_ulLnnqC_mqNvxq`@'], ['11', 0, 0, '_p~iF~ps|U_ulLnnqC']])
        self.assertEqual(result['source'], source['source'])
        self.assertEqual(result['derivedFromSha256'], 'b' * 64)
        self.assertEqual(result['attribution'], source['attribution'])
        self.assertEqual(source, original, 'compaction must not mutate raw map geometry or metadata')

    def test_bounds_round_outward_to_contain_original_submeter_geometry(self):
        source = document([road('1', [[18.000009, 50.000001], [18.000011, 50.000019]])])
        feature = compacting.compact(source, 'c' * 64)['regions']['PLANNER']['features'][0]
        self.assertEqual(feature[4], [18.0, 50.0, 18.00002, 50.00002])
        self.assertTrue(all(feature[4][0] <= p[0] <= feature[4][2] and feature[4][1] <= p[1] <= feature[4][3] for p in source['regions']['PLANNER']['features'][0]['points']))

    def test_distinct_values_and_empty_names_keep_correct_dictionary_indices(self):
        points = [[18, 50], [18.001, 50.001]]
        source = document([road('1', points, name='', category='service'), road('2', points, name='Nowa', category='primary'), road('3', points, name='', category='service')])
        result = compacting.compact(source, 'd' * 64)['regions']['PLANNER']
        self.assertEqual(result['names'], ['', 'Nowa'])
        self.assertEqual(result['categories'], ['service', 'primary'])
        self.assertEqual([(r[0], r[1], r[2]) for r in result['features']], [('1', 0, 0), ('2', 1, 1), ('3', 0, 0)])

    def test_duplicate_ids_invalid_geometry_and_nonroad_features_fail(self):
        good = road('1', [[18, 50], [18.001, 50.001]])
        cases = [[good, good], [dict(good, points=[[18, 50]])], [dict(good, points=[[18, float('nan')], [18, 50]])], [dict(good, points=[[18, 52], [18, 50]])], [dict(good, kind='building')], [dict(good, id=1)]]
        for features in cases:
            with self.subTest(features=features), self.assertRaises(ValueError):
                compacting.compact(document(features), 'e' * 64)

    def test_build_fingerprints_exact_raw_bytes_and_writes_compact_json(self):
        source = document([road('10', [[18, 50], [18.001, 50.001]])])
        raw = (json.dumps(source, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'raw.json'
            path.write_bytes(raw)
            output = root / 'compact.json'
            stats = compacting.build(path, output)
            result = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(result['derivedFromSha256'], hashlib.sha256(raw).hexdigest())
            self.assertEqual(stats['featureCount'], 1)
            self.assertEqual(stats['outputBytes'], output.stat().st_size)
            self.assertEqual(path.read_bytes(), raw)


if __name__ == '__main__':
    unittest.main()
