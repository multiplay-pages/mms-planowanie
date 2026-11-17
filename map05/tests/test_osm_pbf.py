"""Tiny independently encoded PBF fixtures; no network or regional data files."""

from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from map05.basemap import osm_pbf as pbf


def varint(value):
    value &= (1 << 64) - 1
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def zigzag(value):
    return (value << 1) ^ (value >> 63)


def integer(number, value):
    return varint(number << 3) + varint(value)


def message(number, value):
    return varint((number << 3) | 2) + varint(len(value)) + value


def packed(number, values, signed=False):
    return message(number, b''.join(varint(zigzag(v) if signed else v) for v in values))


def frame(kind, payload, compressed=False, blob=None):
    if blob is None:
        blob = (integer(2, len(payload)) + message(3, zlib.compress(payload))) if compressed else message(1, payload)
    header = message(1, kind.encode()) + integer(3, len(blob))
    return struct.pack('>I', len(header)) + header + blob


def header(features=('OsmSchema-V0.6', 'DenseNodes'), optional=()):
    return frame('OSMHeader', b''.join(message(4, v.encode()) for v in features) + b''.join(message(5, v.encode()) for v in optional))


def block(strings, groups, extra=b''):
    table = b''.join(message(1, s.encode()) for s in strings)
    return message(1, table) + b''.join(message(2, g) for g in groups) + extra


class PBFDecoderTests(unittest.TestCase):
    def decode(self, data, **kwargs):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'tiny.osm.pbf'
            path.write_bytes(data)
            return list(pbf.iter_elements(path, **kwargs))

    def test_raw_plain_node_retains_tags_without_contributor_metadata(self):
        node = integer(1, zigzag(10)) + packed(2, [1, 3]) + packed(3, [2, 4]) + message(4, integer(4, 999)) + integer(8, zigzag(500_000_000)) + integer(9, zigzag(180_000_000))
        result = self.decode(header() + frame('OSMData', block(['', 'barrier', 'gate', 'name', 'Brama Łąkowa'], [message(1, node)])))
        self.assertEqual(result, [{'type': 'node', 'id': 10, 'lat': 50.0, 'lon': 18.0, 'tags': {'barrier': 'gate', 'name': 'Brama Łąkowa'}}])

    def test_zlib_dense_nodes_reconstruct_negative_deltas_and_tag_boundaries(self):
        dense = packed(1, [100, -2, 7], True) + packed(8, [500_000_000, -100, 200], True) + packed(9, [180_000_000, 200, -300], True) + packed(10, [1, 2, 0, 0, 3, 4, 0])
        data = header() + frame('OSMData', block(['', 'barrier', 'bollard', 'name', 'Koniec'], [message(2, dense)]), compressed=True)
        result = self.decode(data)
        self.assertEqual([n['id'] for n in result], [100, 98, 105])
        self.assertEqual([n['tags'] for n in result], [{'barrier': 'bollard'}, {}, {'name': 'Koniec'}])
        self.assertAlmostEqual(result[1]['lat'], 49.99999)
        self.assertAlmostEqual(result[2]['lon'], 17.99999)

    def test_granularity_and_signed_offsets_apply_to_plain_and_dense_nodes(self):
        node = integer(1, zigzag(-5)) + integer(8, zigzag(3)) + integer(9, zigzag(-4))
        dense = packed(1, [9], True) + packed(8, [-2], True) + packed(9, [6], True)
        extra = integer(17, 1000) + integer(19, -2000) + integer(20, 4000)
        result = self.decode(header() + frame('OSMData', block([''], [message(1, node), message(2, dense)], extra)))
        self.assertAlmostEqual(result[0]['lat'], 0.000001)
        self.assertAlmostEqual(result[0]['lon'], 0.0)
        self.assertAlmostEqual(result[1]['lat'], -0.000004)
        self.assertAlmostEqual(result[1]['lon'], 0.00001)

    def test_way_refs_use_zigzag_deltas_and_int64_way_ids(self):
        way = integer(1, 5_000_000_000) + packed(2, [1, 3]) + packed(3, [2, 4]) + packed(8, [100, -3, 9], True)
        result = self.decode(header() + frame('OSMData', block(['', 'highway', 'residential', 'oneway', '-1'], [message(3, way)])))
        self.assertEqual(result, [{'type': 'way', 'id': 5_000_000_000, 'nodes': [100, 97, 106], 'tags': {'highway': 'residential', 'oneway': '-1'}}])

    def test_relation_member_ids_share_delta_stream_across_member_types(self):
        relation = integer(1, 700) + packed(2, [1, 3]) + packed(3, [2, 4]) + packed(8, [5, 6, 7, 0]) + packed(9, [100, -90, 95, 595], True) + packed(10, [1, 0, 1, 2])
        result = self.decode(header() + frame('OSMData', block(['', 'type', 'restriction', 'restriction', 'only_right_turn', 'from', 'via', 'to'], [message(4, relation)])))
        self.assertEqual(result, [{'type': 'relation', 'id': 700, 'tags': {'type': 'restriction', 'restriction': 'only_right_turn'}, 'members': [{'type': 'way', 'ref': 100, 'role': 'from'}, {'type': 'node', 'ref': 10, 'role': 'via'}, {'type': 'way', 'ref': 105, 'role': 'to'}, {'type': 'relation', 'ref': 700, 'role': ''}]}])

    def test_unpacked_repeated_fields_and_split_packed_chunks_are_supported(self):
        way = integer(1, 22) + integer(2, 1) + integer(3, 2) + integer(8, zigzag(9)) + packed(8, [-2, 4], True)
        self.assertEqual(self.decode(header() + frame('OSMData', block(['', 'highway', 'service'], [message(3, way)])))[0]['nodes'], [9, 7, 11])

    def test_node_filter_skips_unwanted_tags_but_keeps_all_delta_accumulators(self):
        dense = packed(1, [10, 2, -1], True) + packed(8, [500_000_000, 100, -200], True) + packed(9, [180_000_000, -100, 200], True) + packed(10, [1, 2, 0, 3, 4, 0, 1, 4, 0])
        plain = integer(1, zigzag(40)) + integer(8, 0) + integer(9, 0)
        result = self.decode(header() + frame('OSMData', block(['', 'name', 'Pierwszy', 'barrier', 'gate'], [message(2, dense), message(1, plain)])), types=('node',), node_ids={11})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['id'], 11)
        self.assertEqual(result[0]['tags'], {'name': 'gate'})
        self.assertAlmostEqual(result[0]['lat'], 49.99999)
        self.assertAlmostEqual(result[0]['lon'], 18.00001)

    def test_node_type_can_be_skipped_without_decoding_dense_columns(self):
        malformed_dense = message(1, b'\x80')
        way = integer(1, 3) + packed(8, [10, 1], True)
        result = self.decode(header() + frame('OSMData', block([''], [message(2, malformed_dense), message(3, way)])), types=('way', 'relation'))
        self.assertEqual(result, [{'type': 'way', 'id': 3, 'tags': {}, 'nodes': [10, 11]}])

    def test_multiple_blocks_have_independent_tables_and_delta_bases(self):
        one = packed(1, [1], True) + packed(8, [0], True) + packed(9, [0], True)
        two = packed(1, [2], True) + packed(8, [10], True) + packed(9, [-10], True)
        data = header(optional=('UnrecognizedOptionalFeature',)) + frame('OSMData', block([''], [message(2, one)])) + frame('FutureBlock', b'ignored') + frame('OSMData', block([''], [message(2, two)]), compressed=True)
        result = self.decode(data)
        self.assertEqual([n['id'] for n in result], [1, 2])
        self.assertAlmostEqual(result[1]['lat'], 0.000001)

    def test_generator_yields_first_block_before_reading_truncated_next_block(self):
        node = integer(1, zigzag(1)) + integer(8, 0) + integer(9, 0)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'stream.pbf'
            path.write_bytes(header() + frame('OSMData', block([''], [message(1, node)])) + b'\x00\x00')
            iterator = pbf.iter_elements(path)
            self.assertEqual(next(iterator)['id'], 1)
            with self.assertRaises(pbf.PBFError):
                next(iterator)

    def test_unknown_mandatory_features_and_historical_data_fail_explicitly(self):
        for feature in ('FutureRequiredFeature', 'HistoricalInformation'):
            with self.subTest(feature=feature), self.assertRaisesRegex(pbf.PBFError, feature):
                self.decode(header(features=('OsmSchema-V0.6', feature)))

    def test_unsupported_compression_fails(self):
        for number in (4, 5, 6, 7):
            with self.subTest(number=number), self.assertRaises(pbf.PBFError):
                self.decode(frame('OSMHeader', b'', blob=integer(2, 1) + message(number, b'x')))

    def test_raw_and_zlib_size_mismatches_or_invalid_streams_fail(self):
        for blob in (integer(2, 9) + message(1, b'x'), integer(2, 9) + message(3, zlib.compress(b'x')), integer(2, 1) + message(3, b'invalid'), integer(2, 1) + message(3, zlib.compress(b'x') + b'trailing'), integer(2, 1) + message(3, zlib.compress(b'longer'))):
            with self.subTest(blob=blob), self.assertRaises(pbf.PBFError):
                self.decode(frame('OSMHeader', b'', blob=blob))

    def test_header_and_declared_blob_sizes_are_bounded_before_reading_payload(self):
        bad_headers = [struct.pack('>I', 65536), struct.pack('>I', 0)]
        huge_blob_header = message(1, b'OSMHeader') + integer(3, 1_000_000_000)
        bad_headers.append(struct.pack('>I', len(huge_blob_header)) + huge_blob_header)
        for data in bad_headers:
            with self.subTest(data=data), self.assertRaises(pbf.PBFError):
                self.decode(data)

    def test_compressed_raw_size_is_bounded_even_when_compressed_input_is_small(self):
        for size in (0, 32 * 1024 * 1024, -1):
            with self.subTest(size=size), self.assertRaises(pbf.PBFError):
                self.decode(frame('OSMHeader', b'', blob=integer(2, size) + message(3, zlib.compress(b'x'))))

    def test_truncated_frame_or_protobuf_fields_fail(self):
        good = header()
        for data in (b'', b'\x00', good[:-1], struct.pack('>I', 4) + b'x', frame('OSMHeader', b'\x22\x04x'), frame('OSMHeader', b'\x80' * 11), frame('OSMHeader', b'\x00')):
            with self.subTest(data=data), self.assertRaises(pbf.PBFError):
                self.decode(data)

    def test_data_before_header_and_missing_required_fields_fail(self):
        invalid = [frame('OSMData', block([''], [])), header() + frame('OSMData', message(2, b'')), header() + frame('OSMData', block([''], [message(1, integer(1, zigzag(1)))])), header() + frame('OSMData', block([''], [message(3, packed(8, [1], True))]))]
        for data in invalid:
            with self.subTest(data=data), self.assertRaises(pbf.PBFError):
                self.decode(data)

    def test_invalid_string_indices_and_mismatched_tag_arrays_fail(self):
        for keys, vals in (([1], []), ([9], [2])):
            way = integer(1, 1) + packed(2, keys) + packed(3, vals)
            with self.subTest(keys=keys), self.assertRaises(pbf.PBFError):
                self.decode(header() + frame('OSMData', block(['', 'name', 'test'], [message(3, way)])))

    def test_dense_column_mismatches_and_malformed_tag_delimiters_fail(self):
        ids = packed(1, [10, 1], True)
        valid = ids + packed(8, [0, 1], True) + packed(9, [0, 1], True)
        malformed = [ids + packed(8, [0], True) + packed(9, [0, 1], True), valid + packed(10, [1, 2]), valid + packed(10, [1, 2, 0, 1]), valid + packed(10, [0, 0, 0])]
        for dense in malformed:
            with self.subTest(dense=dense), self.assertRaises(pbf.PBFError):
                self.decode(header() + frame('OSMData', block(['', 'barrier', 'gate'], [message(2, dense)])))

    def test_relation_parallel_arrays_and_member_types_are_validated(self):
        for roles, refs, kinds in (([1], [10, 1], [1]), ([1], [10], [3])):
            relation = integer(1, 20) + packed(8, roles) + packed(9, refs, True) + packed(10, kinds)
            with self.subTest(kinds=kinds), self.assertRaises(pbf.PBFError):
                self.decode(header() + frame('OSMData', block(['', 'via'], [message(4, relation)])))

    def test_unknown_wire_fields_are_skipped_without_losing_known_values(self):
        unknown = varint((50 << 3) | 1) + b'12345678' + varint((51 << 3) | 5) + b'1234' + message(52, b'opaque')
        way = unknown + integer(1, 2) + packed(8, [5], True)
        result = self.decode(header() + frame('OSMData', block([''], [message(3, way)])))
        self.assertEqual(result[0]['nodes'], [5])

    def test_invalid_utf8_granularity_coordinates_and_type_selection_fail(self):
        node = integer(1, zigzag(1)) + integer(8, zigzag(1_000_000_000)) + integer(9, 0)
        for payload in (message(1, message(1, b'\xff')), block([''], [], integer(17, 0)), block([''], [message(1, node)])):
            with self.subTest(payload=payload), self.assertRaises(pbf.PBFError):
                self.decode(header() + frame('OSMData', payload))
        with self.assertRaises(ValueError):
            self.decode(header(), types=('invalid',))


if __name__ == '__main__':
    unittest.main()
