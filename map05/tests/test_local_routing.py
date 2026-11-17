import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def roads(tags=None, barriers=None, restrictions=None):
    return {'nodes': {'1': [18, 50.1], '2': [18.001, 50.1], '3': [18.002, 50.1], '4': [18.001, 50.101], '5': [18.002, 50.101]},
            'ways': [{'id': 10, 'nodes': [1, 2, 3], 'tags': {'highway': 'residential', **(tags or {})}}],
            'barriers': barriers or {}, 'restrictions': restrictions or []}


def restriction(kind, via_type='node', extra=None):
    return {'id': 100, 'tags': {'type': 'restriction', 'restriction': kind, **(extra or {})},
            'members': [{'type': 'way', 'role': 'from', 'ref': 10}, {'type': via_type, 'role': 'via', 'ref': 2 if via_type == 'node' else 20}, {'type': 'way', 'role': 'to', 'ref': 20 if kind != 'no_u_turn' else 10}]}


class LocalRoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('local_routing', ROOT / 'local_routing.py')
        cls.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.api)

    def test_oneway_direction_and_explicit_roundabout_override(self):
        for tags, forward, backward in [({'oneway': 'yes'}, True, False), ({'oneway': '-1'}, False, True), ({'junction': 'roundabout'}, True, False), ({'junction': 'roundabout', 'oneway': 'no'}, True, True), ({'oneway': 'yes', 'oneway:motorcar': 'no'}, True, True)]:
            graph = self.api.RoadGraph(roads(tags))
            self.assertEqual(graph.route_nodes(1, 3)['status'] == 'OK', forward)
            self.assertEqual(graph.route_nodes(3, 1)['status'] == 'OK', backward)

    def test_access_specificity_and_conditional_exclusion(self):
        for tags, allowed in [({'access': 'no', 'motorcar': 'yes'}, True), ({'access': 'yes', 'motorcar': 'no'}, False), ({'access': 'destination'}, False), ({'motorcar:conditional': 'no @ (08:00-17:00)'}, False), ({'oneway': 'reversible'}, False)]:
            graph = self.api.RoadGraph(roads(tags))
            self.assertEqual(graph.route_nodes(1, 3)['status'] == 'OK', allowed)
        graph = self.api.RoadGraph(roads({'motorcar:forward': 'no', 'motorcar:backward': 'yes'}))
        self.assertEqual(graph.route_nodes(1, 3)['status'], 'NO_PATH')
        self.assertEqual(graph.route_nodes(3, 1)['status'], 'OK')

    def test_barrier_inside_a_way_survives_graph_compression(self):
        graph = self.api.RoadGraph(roads(barriers={'2': {'barrier': 'bollard'}}))
        result = graph.route_nodes(1, 3)
        self.assertEqual(result['status'], 'NO_PATH')
        self.assertIsNone(result['distanceM'])
        unlocked = self.api.RoadGraph(roads(barriers={'2': {'barrier': 'gate', 'motorcar': 'yes'}}))
        self.assertEqual(unlocked.route_nodes(1, 3)['status'], 'OK')

    def test_geometric_crossing_without_shared_osm_id_is_not_a_junction(self):
        data = roads()
        data['nodes'].update({'6': [18.001, 50.1], '7': [18.001, 50.099]})
        data['ways'].append({'id': 20, 'nodes': [7, 6, 4], 'tags': {'highway': 'residential'}})
        self.assertEqual(self.api.RoadGraph(data).route_nodes(1, 4)['status'], 'NO_PATH')

    def test_no_turn_uses_incoming_way_and_except_motorcar(self):
        data = roads(restrictions=[restriction('no_right_turn')])
        data['ways'].append({'id': 20, 'nodes': [2, 4], 'tags': {'highway': 'residential'}})
        graph = self.api.RoadGraph(data)
        self.assertEqual(graph.route_nodes(1, 4)['status'], 'NO_PATH')
        self.assertEqual(graph.route_nodes(4, 1)['status'], 'OK')
        data['restrictions'][0]['tags']['except'] = 'bicycle;motorcar'
        self.assertEqual(self.api.RoadGraph(data).route_nodes(1, 4)['status'], 'OK')

    def test_only_turn_does_not_block_other_incoming_approaches(self):
        data = roads(restrictions=[restriction('only_right_turn')])
        data['ways'].append({'id': 20, 'nodes': [2, 4], 'tags': {'highway': 'residential'}})
        graph = self.api.RoadGraph(data)
        detour = graph.route_nodes(1, 3)
        self.assertEqual(detour['status'], 'OK')
        self.assertIn([18.001, 50.101], detour['geometry'], 'only-turn requires the detour through node 4')
        self.assertGreater(detour['distanceM'], 360)
        self.assertLess(detour['distanceM'], 370)
        self.assertEqual(graph.route_nodes(1, 4)['status'], 'OK')
        self.assertEqual(graph.route_nodes(4, 3)['status'], 'OK')

    def test_no_u_turn_does_not_block_straight_traversal_of_the_same_way(self):
        data = roads(restrictions=[restriction('no_u_turn')])
        self.assertEqual(self.api.RoadGraph(data).route_nodes(1, 3)['status'], 'OK')

    def test_unsupported_via_way_and_conditional_turns_are_conservative(self):
        for relation in [restriction('only_right_turn', 'way'), restriction('no_right_turn', extra={'restriction:conditional': 'no_right_turn @ (Mo-Fr)'})]:
            data = roads(restrictions=[relation])
            data['ways'].append({'id': 20, 'nodes': [2, 4], 'tags': {'highway': 'residential'}})
            graph = self.api.RoadGraph(data)
            self.assertEqual(graph.route_nodes(1, 4)['status'], 'NO_PATH')
            self.assertGreater(graph.summary['unsupportedRestrictions'], 0)

    def test_points_snap_to_segment_instead_of_distant_vertices(self):
        graph = self.api.RoadGraph(roads(), {'A': [18.00025, 50.1], 'B': [18.00075, 50.1]})
        result = graph.route(['A', 'B'])
        self.assertEqual(result['status'], 'OK')
        self.assertGreater(result['distanceM'], 35)
        self.assertLess(result['distanceM'], 36)
        self.assertEqual(result['geometry'][0], [18.00025, 50.1])
        self.assertEqual(result['geometry'][-1], [18.00075, 50.1])
        self.assertGreater(result['estimatedDurationS'], 0)

    def test_unknown_distant_and_motorway_only_points_never_become_zero_routes(self):
        for data, points in [(roads(), {'A': [18, 50.3], 'B': [18, 50.1]}), (roads({'highway': 'motorway'}), {'A': [18, 50.1], 'B': [18.002, 50.1]})]:
            graph = self.api.RoadGraph(data, points)
            result = graph.route(['A', 'B'])
            self.assertNotEqual(result['status'], 'OK')
            self.assertIsNone(result['distanceM'])
        graph = self.api.RoadGraph(roads())
        self.assertEqual(graph.route(['unknown', 'missing'])['status'], 'LOCATION_UNKNOWN')

    def test_precomputed_routes_can_reuse_oriented_road_segments_without_copying_geometry(self):
        graph = self.api.RoadGraph(roads(), {'A': [18, 50.1], 'B': [18.002, 50.1]})
        forward = graph.routes_from('A', include_geometry=False)['B']
        backward = graph.routes_from('B', include_geometry=False)['A']
        self.assertIsNone(forward['geometry'])
        self.assertTrue(all(value > 0 for value in forward['path']))
        self.assertTrue(all(value < 0 for value in backward['path']))
        self.assertAlmostEqual(forward['distanceM'], backward['distanceM'])


if __name__ == '__main__':
    unittest.main()
