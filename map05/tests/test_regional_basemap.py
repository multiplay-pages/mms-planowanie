import importlib.util
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RegionalMapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('download_regional', ROOT / 'basemap/download_regional.py')
        cls.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.api)

    def test_public_extract_preserves_topology_and_car_tags_without_contacts(self):
        elements = [
            {'type': 'way', 'id': 10, 'nodes': [1, 2, 3], 'geometry': [{'lon': 18, 'lat': 50.1}, {'lon': 18.001, 'lat': 50.1}, {'lon': 18.002, 'lat': 50.1}], 'tags': {'highway': 'residential', 'name': 'Test Street', 'oneway': 'yes', 'maxspeed': '40', 'phone': 'PRIVATE', 'addr:street': 'PRIVATE'}},
            {'type': 'node', 'id': 2, 'lon': 18.001, 'lat': 50.1, 'tags': {'barrier': 'gate', 'access': 'private', 'contact:phone': 'PRIVATE'}},
            {'type': 'way', 'id': 20, 'nodes': [2, 4], 'geometry': [{'lon': 18.001, 'lat': 50.1}, {'lon': 18.001, 'lat': 50.101}], 'tags': {'highway': 'service'}},
            {'type': 'relation', 'id': 30, 'tags': {'type': 'restriction', 'restriction': 'no_right_turn', 'note': 'PRIVATE'}, 'members': [{'type': 'way', 'role': 'from', 'ref': 10}, {'type': 'node', 'role': 'via', 'ref': 2}, {'type': 'way', 'role': 'to', 'ref': 20}]},
            {'type': 'way', 'id': 40, 'nodes': [1, 2], 'geometry': [{'lon': 18, 'lat': 50.1}, {'lon': 18.001, 'lat': 50.1}], 'tags': {'building': 'yes', 'name': 'PRIVATE'}},
        ]
        roads, features = self.api.convert(elements)
        self.assertEqual(len(roads['ways']), 2)
        self.assertEqual(roads['ways'][0]['nodes'], [1, 2, 3])
        self.assertEqual(roads['nodes']['2'], [18.001, 50.1])
        self.assertEqual(roads['barriers']['2'], {'barrier': 'gate', 'access': 'private'})
        self.assertEqual(roads['restrictions'][0]['tags']['restriction'], 'no_right_turn')
        self.assertEqual(len(features), 2)
        self.assertEqual(features[0]['name'], 'Test Street')
        self.assertNotIn('PRIVATE', str((roads, features)))

    def test_missing_node_geometry_is_rejected_instead_of_joining_a_gap(self):
        for geometry in [[{'lon': 18, 'lat': 50}, None], [{'lon': float('nan'), 'lat': 50}, {'lon': 18, 'lat': 50}]]:
            with self.assertRaises(ValueError):
                self.api.convert([{'type': 'way', 'id': 1, 'nodes': [1, 2], 'geometry': geometry, 'tags': {'highway': 'residential'}}])

    def test_delivered_compact_map_keeps_every_road_name_class_and_full_geometry_bounds(self):
        source = ROOT / 'basemap/planner-data.json'
        original = json.loads(source.read_text(encoding='utf-8'))
        compact = json.loads((ROOT / 'basemap/planner-compact.json').read_text(encoding='utf-8'))
        self.assertEqual(compact['derivedFromSha256'], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(compact['source'], original['source'])
        roads, data = original['regions']['PLANNER']['features'], compact['regions']['PLANNER']
        self.assertEqual(len(roads), len(data['features']))
        self.assertEqual(len({row[0] for row in data['features']}), len(roads))
        for road, row in zip(roads, data['features']):
            self.assertEqual(row[0], road['id'])
            self.assertEqual(data['categories'][row[1]], road['category'])
            self.assertEqual(data['names'][row[2]], road['name'])
            west, south, east, north = row[4]
            self.assertTrue(all(west <= point[0] <= east and south <= point[1] <= north for point in road['points']))


if __name__ == '__main__':
    unittest.main()
