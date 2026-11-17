"""Controlled public-geometry fixtures for the offline PBF extraction path."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from map05.basemap import extract_pbf as extraction
from map05.tests.test_osm_pbf import block, frame, header, integer, message, packed, zigzag


def node(identity, lon, lat=50.2, tags=None):
    return {'type': 'node', 'id': identity, 'lon': lon, 'lat': lat, 'tags': tags or {}}


def way(identity, refs, tags=None):
    return {'type': 'way', 'id': identity, 'nodes': refs, 'tags': tags or {'highway': 'residential'}}


def restriction(identity, refs):
    return {'type': 'relation', 'id': identity, 'tags': {'type': 'restriction', 'restriction': 'no_left_turn', 'contact:email': 'discard'}, 'members': [{'type': 'way', 'ref': refs[0], 'role': 'from'}, {'type': 'node', 'ref': 2, 'role': 'via'}, {'type': 'way', 'ref': refs[1], 'role': 'to'}]}


class PBFExtractTests(unittest.TestCase):
    def test_complete_ways_preserve_topology_and_strip_contacts_from_every_element(self):
        elements = [node(1, 18.0, tags={'barrier': 'gate', 'motorcar': 'yes', 'contact:phone': 'discard'}), node(2, 18.01, tags={'motor_vehicle:conditional': 'no @ wet', 'contact:email': 'discard'}), node(3, 18.02), way(10, [1, 2, 3], {'highway': 'residential', 'name': 'Droga', 'oneway': '-1', 'motorcar:forward': 'no', 'contact:phone': 'discard'}), restriction(100, [10, 11])]
        roads, features, stats = extraction.assemble(elements)
        self.assertEqual(roads['nodes'], {'1': [18.0, 50.2], '2': [18.01, 50.2], '3': [18.02, 50.2]})
        self.assertEqual(roads['ways'], [{'id': 10, 'nodes': [1, 2, 3], 'tags': {'highway': 'residential', 'name': 'Droga', 'oneway': '-1', 'motorcar:forward': 'no'}}])
        self.assertEqual(roads['barriers'], {'1': {'barrier': 'gate', 'motorcar': 'yes'}, '2': {'motor_vehicle:conditional': 'no @ wet'}})
        self.assertEqual(roads['restrictions'][0]['members'], restriction(100, [10, 11])['members'])
        self.assertNotIn('contact:email', roads['restrictions'][0]['tags'])
        self.assertEqual(features, [{'id': '10', 'kind': 'road', 'category': 'residential', 'name': 'Droga', 'points': [[18.0, 50.2], [18.01, 50.2], [18.02, 50.2]]}])
        self.assertEqual(stats['keptWays'], 1)

    def test_outside_or_missing_nodes_omit_whole_way_without_joining_gap(self):
        elements = [node(1, 18.0), node(2, 18.01), node(3, 19.01), node(4, 20.0), node(5, 20.1), way(10, [1, 2]), way(11, [1, 3, 2]), way(12, [1, 999, 2]), way(13, [4, 5])]
        roads, features, stats = extraction.assemble(elements)
        self.assertEqual([w['id'] for w in roads['ways']], [10])
        self.assertEqual(set(roads['nodes']), {'1', '2'})
        self.assertEqual(len(features), 1)
        self.assertEqual(stats['omittedBoundaryWays'], 2)
        self.assertEqual(stats['outsideWays'], 1)

    def test_bbox_is_fixed_and_inclusive_without_reclassifying_other_highways(self):
        elements = [node(1, 17.2, 49.9), node(2, 19.0, 51.5), node(3, 18.0), way(5, [1, 2], {'highway': 'primary'}), way(6, [1, 3], {'highway': 'footway'})]
        roads, _, _ = extraction.assemble(elements)
        self.assertEqual([w['id'] for w in roads['ways']], [5])
        self.assertEqual(len(roads['nodes']), 2)

    def test_unrelated_restrictions_and_unused_control_nodes_are_not_retained(self):
        elements = [node(1, 18.0), node(2, 18.01), node(9, 18.05, tags={'barrier': 'bollard'}), way(10, [1, 2]), restriction(20, [30, 40])]
        # The unrelated restriction's via member must also lie outside kept nodes.
        elements[-1]['members'][1]['ref'] = 99
        roads, _, _ = extraction.assemble(elements)
        self.assertEqual(roads['restrictions'], [])
        self.assertEqual(roads['barriers'], {})
        self.assertNotIn('9', roads['nodes'])

    def test_identical_duplicates_collapse_and_conflicting_duplicates_fail(self):
        elements = [node(1, 18.0), node(2, 18.01), way(10, [1, 2])]
        roads, features, _ = extraction.assemble(elements + elements)
        self.assertEqual(len(roads['ways']), 1)
        self.assertEqual(len(features), 1)
        with self.assertRaises(ValueError):
            extraction.assemble(elements + [node(1, 18.1)])
        with self.assertRaises(ValueError):
            extraction.assemble(elements + [way(10, [2, 1])])

    def test_merging_provinces_deduplicates_ids_and_rejects_conflicting_snapshots(self):
        first, _, _ = extraction.assemble([node(1, 18.0), node(2, 18.01), way(10, [1, 2])])
        second, _, _ = extraction.assemble([node(1, 18.0), node(2, 18.01), node(3, 18.02), way(10, [1, 2]), way(11, [2, 3])])
        merged = extraction.merge_roads([first, second])
        self.assertEqual([w['id'] for w in merged['ways']], [10, 11])
        self.assertEqual(len(merged['nodes']), 3)
        broken = dict(second, nodes={**second['nodes'], '1': [18.5, 50.2]})
        with self.assertRaises(ValueError):
            extraction.merge_roads([first, broken])

    def test_manifest_sha256_and_size_are_verified_before_source_is_returned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = {}
            for region in ('opolskie', 'slaskie', 'dolnoslaskie', 'wielkopolskie'):
                payload = ('public-' + region).encode()
                filename = region + '-latest.osm.pbf'
                (root / filename).write_bytes(payload)
                manifest[region] = {'filename': filename, 'url': 'https://download.geofabrik.de/europe/poland/' + filename, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(), 'md5': hashlib.md5(payload).hexdigest(), 'lastModified': '2026-11-17', 'retrievedAt': '2026-11-17T00:00:00Z'}
            verified = extraction.verify_sources(root, manifest)
            self.assertEqual(len(verified), 4)
            self.assertEqual(verified[0]['sha256'], manifest['opolskie']['sha256'])
            (root / manifest['opolskie']['filename']).write_bytes(b'corruption')
            with self.assertRaises(ValueError):
                extraction.verify_sources(root, manifest)
            original_length = manifest['opolskie']['bytes']
            (root / manifest['opolskie']['filename']).write_bytes(b'X' * original_length)
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                extraction.verify_sources(root, manifest)

    def test_duplicate_control_node_cannot_lose_access_restriction_during_merge(self):
        common = [node(1, 18.0), node(2, 18.01), way(10, [1, 2])]
        plain, _, _ = extraction.assemble(common)
        restricted, _, _ = extraction.assemble([dict(common[0], tags={'motorcar': 'no'}), *common[1:]])
        with self.assertRaises(ValueError):
            extraction.merge_roads([plain, restricted])

    def test_two_pass_extraction_writes_matching_public_only_outputs(self):
        plain_nodes = b''.join(message(1, integer(1, zigzag(identity)) + integer(8, zigzag(502_000_000)) + integer(9, zigzag(longitude))) for identity, longitude in [(1, 180_000_000), (2, 180_100_000)])
        road = integer(1, 10) + packed(2, [1, 3]) + packed(3, [2, 4]) + packed(8, [1, 1], True)
        payload = header() + frame('OSMData', block(['', 'highway', 'residential', 'contact:phone', 'discard'], [plain_nodes, message(3, road)]), compressed=True)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = {}
            for region in ('opolskie', 'slaskie', 'dolnoslaskie', 'wielkopolskie'):
                filename = region + '-latest.osm.pbf'
                (root / filename).write_bytes(payload)
                manifest[region] = {'filename': filename, 'url': 'https://download.geofabrik.de/europe/poland/' + filename, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
            (root / 'sources.json').write_text(json.dumps(manifest), encoding='utf-8')
            result = extraction.extract(root, output_dir=root / 'out', progress=lambda *args, **kwargs: None)
            graph = json.loads((root / 'out' / 'regional-roads.json').read_text(encoding='utf-8'))
            background = json.loads((root / 'out' / 'planner-data.json').read_text(encoding='utf-8'))
            self.assertEqual(result['ways'], 1)
            self.assertEqual(result['nodes'], 2)
            self.assertEqual(graph['source'], background['source'])
            self.assertEqual(graph['source']['provider'], 'OSM_GEOFABRIK')
            self.assertEqual(graph['bounds'], [17.2, 49.9, 19.0, 51.5])
            self.assertEqual(background['regions']['PLANNER']['features'][0]['points'], [[18.0, 50.2], [18.01, 50.2]])
            self.assertNotIn('contact:phone', json.dumps(graph))

    def test_manifest_does_not_allow_foreign_urls_or_path_traversal(self):
        for record in ({'filename': '../private.pbf'}, {'filename': 'opolskie-latest.osm.pbf', 'url': 'https://example.com/foreign.pbf'}):
            with self.subTest(record=record), self.assertRaises(ValueError):
                extraction.verify_sources(Path('.'), {'opolskie': record})


if __name__ == '__main__':
    unittest.main()
