import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class RouteSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('build_local_routes', ROOT / 'build_local_routes.py')
        cls.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.api)

    def test_polyline_codec_matches_the_published_reference_points(self):
        self.assertEqual(self.api.encode_polyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]), '_p~iF~ps|U_ulLnnqC_mqNvxq`@')

    def test_snapshot_cell_keeps_unknown_road_unknown_and_rounds_up_meter_boundaries(self):
        self.assertEqual(self.api.snapshot_cell({'status': 'NO_PATH'}), {'status': 'NO_PATH', 'distanceM': None, 'estimatedDurationS': None, 'path': None})
        cell = self.api.snapshot_cell({'status': 'OK', 'distanceM': 30000.00001, 'estimatedDurationS': 5.001, 'path': [1, -2]})
        self.assertGreater(cell['distanceM'], 30000)
        self.assertGreaterEqual(cell['estimatedDurationS'], 5.001)
        self.assertEqual(cell['path'], [1, -2])


if __name__ == '__main__':
    unittest.main()
