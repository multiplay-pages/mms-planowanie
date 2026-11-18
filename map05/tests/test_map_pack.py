"""Unit tests for the MAP-08 tile pipeline using only synthetic data."""

import gzip
import json
from pathlib import Path
import random
import tempfile
import unittest

from map05.basemap import pmtiles_io as pmtiles
from map05.basemap.build_map_pack import Coverage, Tiler, decode_polyline5, meets_bounds, present_layers, road_max_rank
from map05.basemap.vector_tiles import Layer, clip_line, clip_polygon, decode_tile, encode_tile, ring_area


class PMTilesTests(unittest.TestCase):
    def test_known_hilbert_ids_in_both_directions(self):
        coordinates = [(0, 0, 0), (1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)]
        for expected_id, zxy in enumerate(coordinates):
            with self.subTest(zxy=zxy):
                self.assertEqual(pmtiles.tile_id(*zxy), expected_id)
                self.assertEqual(pmtiles.zxy_from_tile_id(expected_id), zxy)

    def test_tile_ids_round_trip_at_higher_zooms(self):
        for z in (2, 5, 14, 26):
            side = 1 << z
            for x, y in ((0, 0), (side - 1, 0), (0, side - 1),
                         (side - 1, side - 1), (side // 4, side // 2)):
                with self.subTest(z=z, x=x, y=y):
                    self.assertEqual(pmtiles.zxy_from_tile_id(pmtiles.tile_id(z, x, y)), (z, x, y))

    def test_directory_round_trip_with_delta_ids_contiguous_offsets_and_reuse(self):
        entries = [(2, 128, 134, 3), (152, 262, 17, 0), (155, 128, 134, 2)]
        self.assertEqual(pmtiles.deserialize_directory(pmtiles.serialize_directory(entries)), entries)
        self.assertEqual(pmtiles.serialize_directory([]), b'\x00')
        self.assertEqual(pmtiles.deserialize_directory(b'\x00'), [])

    def test_pack_round_trip_headers_gzip_metadata_and_deduplication(self):
        tile_a = gzip.compress(b'first tile', mtime=0)
        tile_b = gzip.compress(b'different tile', mtime=0)
        tiles = {(1, 1, 0): tile_a, (0, 0, 0): tile_a, (1, 0, 0): tile_b}
        bounds = (-126.453, -3.5, 22.1234567, 51.25)
        metadata = {'name': 'Łódź', 'format': 'pbf', 'zoom': [0, 1]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'map.pmtiles'
            summary = pmtiles.write_pmtiles(
                path, tiles, min_zoom=0, max_zoom=1, bounds=bounds,
                center=(18, 50, 1), metadata=metadata,
            )
            archive = path.read_bytes()

        self.assertEqual(archive[:8], b'PMTiles\x03')
        header = pmtiles.read_header(archive[:127])
        self.assertEqual(header['rootOffset'], 127)
        self.assertEqual(header['clustered'], 1)
        self.assertEqual(header['tileType'], 1)
        self.assertEqual(header['internalCompression'], 2)
        self.assertEqual(header['tileCompression'], 2)
        self.assertEqual((header['minZoom'], header['maxZoom']), (0, 1))
        self.assertEqual(header['bounds'], list(bounds))
        self.assertEqual((header['addressed'], header['entries'], header['contents']), (3, 3, 2))
        self.assertEqual(header['leafBytes'], 0)
        self.assertEqual(summary['tiles'], 3)
        self.assertEqual(summary['uniqueTiles'], 2)
        self.assertEqual(summary['bytes'], len(archive))
        self.assertEqual(archive[header['dataOffset']:], tile_a + tile_b)
        for zxy, expected in tiles.items():
            with self.subTest(zxy=zxy):
                self.assertEqual(pmtiles.read_tile(archive, *zxy), expected)
        self.assertIsNone(pmtiles.read_tile(archive, 1, 0, 1))

        metadata_start = header['metaOffset']
        metadata_bytes = archive[metadata_start:metadata_start + header['metaBytes']]
        self.assertEqual(metadata_bytes[:2], b'\x1f\x8b')
        self.assertEqual(json.loads(gzip.decompress(metadata_bytes)), metadata)
        self.assertEqual(pmtiles.read_metadata(archive), metadata)

    def test_pack_reads_every_tile_across_leaf_directories(self):
        # Vary both Hilbert ID deltas and tile lengths so the root cannot gzip below 16 KiB.
        rng = random.Random(208)
        zoom = 16
        first_id = (4**zoom - 1) // 3
        tile_ids = rng.sample(range(4**zoom), 6000)
        tiles = {}
        for index, delta in enumerate(tile_ids):
            payload = index.to_bytes(4, 'little') + rng.randbytes(rng.randrange(32, 320))
            tiles[pmtiles.zxy_from_tile_id(first_id + delta)] = gzip.compress(payload, mtime=0)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'large.pmtiles'
            pmtiles.write_pmtiles(
                path, tiles, min_zoom=zoom, max_zoom=zoom,
                bounds=(-180, -85, 180, 85), center=(0, 0, zoom), metadata={},
            )
            archive = path.read_bytes()

        header = pmtiles.read_header(archive)
        self.assertGreater(header['leafBytes'], 0)
        root_end = header['rootOffset'] + header['rootBytes']
        self.assertLessEqual(root_end, 16384)
        root = pmtiles.deserialize_directory(gzip.decompress(archive[header['rootOffset']:root_end]))
        self.assertGreaterEqual(len(root), 2)
        self.assertTrue(all(run == 0 for _, _, _, run in root))
        for zxy, expected in tiles.items():
            with self.subTest(zxy=zxy):
                self.assertEqual(pmtiles.read_tile(archive, *zxy), expected)


class VectorTileTests(unittest.TestCase):
    def test_clip_line(self):
        cases = (
            ('inside', [(2, 3), (5, 6), (8, 7)], [[(2, 3), (5, 6), (8, 7)]]),
            ('outside', [(-3, 2), (-1, 8)], []),
            ('crosses both edges', [(-2, 4), (12, 4)], [[(0, 4), (10, 4)]]),
            ('leaves and reenters', [(2, 2), (12, 2), (12, 8), (2, 8)],
             [[(2, 2), (10, 2)], [(10, 8), (2, 8)]]),
        )
        for name, points, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(clip_line(points, low=0, high=10), expected)

    def test_clip_polygon(self):
        inside = [(2, 2), (4, 2), (4, 8), (2, 8)]
        cases = (
            ('inside', inside, inside),
            ('outside', [(-6, 2), (-3, 2), (-3, 8), (-6, 8)], []),
            ('crosses the left edge', [(-2, 2), (4, 2), (4, 8), (-2, 8)],
             [(0, 2), (4, 2), (4, 8), (0, 8)]),
            ('collapses to a line on the border', [(-3, 2), (0, 2), (0, 7), (-3, 7)], []),
            ('collapses after rounding', [(2, 2), (2.1, 2), (2, 2.1)], []),
        )
        for name, ring, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(clip_polygon(ring, low=0, high=10), expected)

    def test_ring_area_changes_sign_with_winding(self):
        ring = [(1, 1), (5, 1), (5, 4), (1, 4)]
        self.assertEqual(ring_area(ring), 12)
        self.assertEqual(ring_area(ring[::-1]), -12)
        self.assertEqual(ring_area([(0, 0), (2, 2), (4, 4)]), 0)

    def test_encode_and_decode_layers_with_geometry_and_unicode_properties(self):
        lines = [[(-10, 5), (30, 5)], [(60, 7), (45, 20)]]
        ring = [(4, 6), (12, 6), (12, 10), (4, 10)]
        points = [[(14, 20)]]
        road = {'class': 'primary', 'rank': 2, 'name': 'Łąkowa'}
        place = {'class': 'city', 'name': 'Łódź'}
        roads, building, places, empty = (Layer(name) for name in ('roads', 'building', 'places', 'water'))
        roads.add(42, 2, lines, road)
        building.add(None, 3, [ring], {})
        places.add(None, 1, points, place)

        encoded = encode_tile([roads, building, places, empty])
        self.assertEqual(encoded[:2], b'\x1f\x8b')
        self.assertEqual(decode_tile(encoded), {
            'roads': [{'type': 2, 'geometry': lines, 'properties': road}],
            'building': [{'type': 3, 'geometry': [ring], 'properties': {}}],
            'places': [{'type': 1, 'geometry': points, 'properties': place}],
        })
        self.assertEqual(encode_tile([empty]), b'')
        self.assertEqual(encode_tile([]), b'')


class MapPackBuilderTests(unittest.TestCase):
    def test_decode_polyline5_matches_routes_decoder_fixtures(self):
        # These expected coordinates were also checked with routes.mjs:decodeRoadPolyline.
        cases = (
            ('????', [(0, 0), (0, 0)]),
            ('??@GEF', [(0, 0), (0.00004, -0.00001), (0, 0.00002)]),
            ('_p~iF~ps|U_ulLnnqC_mqNvxq`@', [(-120.2, 38.5), (-120.95, 40.7), (-126.453, 43.252)]),
        )
        for encoded, expected in cases:
            with self.subTest(encoded=encoded):
                self.assertEqual(decode_polyline5(encoded), expected)

    def test_road_rank_at_zoom_transitions(self):
        expected_ranks = {5: 2, 8: 2, 9: 3, 10: 3, 11: 4, 12: 5, 13: 5, 14: 7}
        for zoom, limit in expected_ranks.items():
            with self.subTest(zoom=zoom):
                self.assertEqual(road_max_rank(zoom), limit)

    def test_coverage_includes_radius_boundary_and_searches_adjacent_cell(self):
        coverage = Coverage([(0, 0)], radius_km=3)
        boundary_lat = 3 / 110.57
        self.assertTrue(coverage.near(0, 0))
        self.assertTrue(coverage.near(0, boundary_lat - 0.000001))
        self.assertTrue(coverage.near(0, boundary_lat))
        self.assertFalse(coverage.near(0, boundary_lat + 0.000001))
        self.assertTrue(Coverage([(0.05, 0)], radius_km=3).near(0.049, 0))
        self.assertFalse(Coverage([], radius_km=3).near(0, 0))

    def test_tiler_places_features_in_xyz_tiles_and_counts_each_input_once(self):
        tiler = Tiler()
        road = {'name': 'Łąkowa', 'rank': 2}
        place = {'name': 'Łódź'}
        tiler.line(2, 'roads', [(-10, 20), (10, 20)], road, identifier=42)
        tiler.polygon(2, 'building', [(10, 10), (20, 10), (20, 20), (10, 20)], {})
        tiler.polygon(2, 'water', [(10, 10), (10.001, 10), (10, 10.001)], {}, min_units=6)
        tiler.point(2, 'places', 22.5, 0, place)

        self.assertEqual(tiler.counts, {('roads', 2): 1, ('building', 2): 1, ('places', 2): 1})
        tiles = {zxy: decode_tile(encode_tile(layers.values())) for zxy, layers in tiler.tiles.items()}
        self.assertEqual({zxy: set(layers) for zxy, layers in tiles.items()}, {
            (2, 1, 1): {'roads'}, (2, 2, 1): {'roads', 'building'}, (2, 2, 2): {'places'},
        })
        self.assertEqual(tiles[(2, 1, 1)]['roads'], [
            {'type': 2, 'geometry': [[(3641, 3167), (4160, 3167)]], 'properties': road},
        ])
        self.assertEqual(tiles[(2, 2, 1)]['roads'], [
            {'type': 2, 'geometry': [[(-64, 3167), (455, 3167)]], 'properties': road},
        ])
        self.assertEqual(tiles[(2, 2, 2)]['places'], [
            {'type': 1, 'geometry': [[(1024, 0)]], 'properties': place},
        ])

    def test_tiler_orients_exterior_rings_after_projection_for_either_input_winding(self):
        ring = [(10, 10), (20, 10), (20, 20), (10, 20)]
        for points in (ring, ring[::-1]):
            with self.subTest(points=points):
                tiler = Tiler()
                tiler.polygon(2, 'building', points, {})
                layers = tiler.tiles[(2, 2, 1)]
                building, = decode_tile(encode_tile(layers.values()))['building']
                exterior, = building['geometry']
                self.assertEqual(building['type'], 3)
                self.assertEqual(len(exterior), 4)
                self.assertGreater(ring_area(exterior), 0)


class Map08RegressionTests(unittest.TestCase):
    def test_features_crossing_the_area_edge_are_kept(self):
        bounds = (0, 0, 10, 10)
        self.assertTrue(meets_bounds([5, -20], [3, 3], bounds))
        self.assertTrue(meets_bounds([4, 5], [4, 4], bounds))
        self.assertFalse(meets_bounds([-20, -5], [3, 3], bounds))
        self.assertFalse(meets_bounds([4, 5], [11, 12], bounds))

    def test_only_layers_with_features_are_announced(self):
        self.assertEqual(present_layers({('roads', 5): 3, ('building', 14): 0, ('places', 5): 1}), ['roads', 'places'])
        self.assertEqual(present_layers({}), [])

    def test_coverage_reaches_points_across_longitude_at_high_latitude(self):
        self.assertTrue(Coverage([(-0.001, 50)], 15).near(0.204, 50))
        self.assertFalse(Coverage([(-0.001, 50)], 15).near(0.30, 50))

    def test_directory_first_entry_requires_explicit_offset(self):
        with self.assertRaises(ValueError):
            pmtiles.deserialize_directory(bytes([1, 0, 1, 1, 0]))


if __name__ == '__main__':
    unittest.main()
