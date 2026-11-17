"""Bounded, streaming, standard-library reader for current OSM PBF snapshots.

Only raw and zlib blobs are supported. Metadata about contributors is ignored.
All OSM tags are returned transiently; callers must whitelist what they persist.
HistoricalInformation is rejected because this reader does not merge versions.

Format references (independently implemented, no generated protobuf runtime):
https://wiki.openstreetmap.org/wiki/PBF_Format
https://github.com/openstreetmap/OSM-binary/blob/master/osmpbf/fileformat.proto
https://github.com/openstreetmap/OSM-binary/blob/master/osmpbf/osmformat.proto
"""

from collections.abc import Set
from itertools import chain, zip_longest
import struct
import zlib


MAX_HEADER_SIZE = 64 * 1024  # The specification requires strictly less.
MAX_RAW_SIZE = 32 * 1024 * 1024
MAX_BLOB_SIZE = MAX_RAW_SIZE + MAX_HEADER_SIZE  # Also bound compressed input.
_TYPES = ('node', 'way', 'relation')
_FEATURES = frozenset(('OsmSchema-V0.6', 'DenseNodes', 'Sort.Type_then_ID'))
_MISSING = object()


class PBFError(ValueError):
    """Unsupported or malformed PBF input; never a partial successful import."""


def _varint(data, position):
    value = 0
    for shift in range(0, 70, 7):
        if position >= len(data):
            raise PBFError('Truncated protobuf varint')
        byte = data[position]
        position += 1
        if shift == 63 and byte > 1:
            raise PBFError('Protobuf varint exceeds 64 bits')
        value |= (byte & 127) << shift
        if byte < 128:
            return value, position
    raise PBFError('Invalid protobuf varint')


def _fields(data):
    data = memoryview(data)
    position = 0
    while position < len(data):
        key, position = _varint(data, position)
        number, wire = key >> 3, key & 7
        if not 0 < number < (1 << 29):
            raise PBFError('Invalid protobuf field number')
        if wire == 0:
            value, position = _varint(data, position)
        elif wire in (1, 2, 5):
            if wire == 2:
                size, position = _varint(data, position)
            else:
                size = 8 if wire == 1 else 4
            end = position + size
            if end > len(data):
                raise PBFError('Truncated protobuf field')
            value = data[position:end]
            position = end
        else:
            raise PBFError('Unsupported protobuf wire type')
        yield number, wire, value


def _integer(wire, value):
    if wire != 0:
        raise PBFError('Expected protobuf integer')
    return value


def _bytes(wire, value):
    if wire != 2:
        raise PBFError('Expected protobuf bytes')
    return value


def _text(value):
    try:
        return bytes(value).decode('utf-8')
    except UnicodeDecodeError as exc:
        raise PBFError('Invalid UTF-8 in PBF string') from exc


def _signed(value):
    return value - (1 << 64) if value >= (1 << 63) else value


def _zigzag(value):
    return (value >> 1) ^ -(value & 1)


def _numbers(records, signed=False):
    """Iterate packed/unpacked chunks without materializing dense columns."""
    for wire, data in records:
        if wire == 0:
            yield _zigzag(data) if signed else data
        elif wire == 2:
            position = 0
            while position < len(data):
                value, position = _varint(data, position)
                yield _zigzag(value) if signed else value
        else:
            raise PBFError('Invalid wire type for repeated integer')


def _sum_delta(previous, delta):
    value = previous + delta
    if not -(1 << 63) <= value < (1 << 63):
        raise PBFError('Delta-coded value exceeds signed 64-bit range')
    return value


def _string(strings, index):
    if not 0 <= index < len(strings):
        raise PBFError('PBF string index is out of range')
    return strings[index]


def _tags(keys, values, strings):
    result = {}
    for key, value in zip_longest(_numbers(keys), _numbers(values), fillvalue=_MISSING):
        if key is _MISSING or value is _MISSING:
            raise PBFError('Tag key/value arrays differ in length')
        result[_string(strings, key)] = _string(strings, value)
    return result


def _coordinates(lat, lon, granularity, lat_offset, lon_offset):
    latitude = (lat_offset + granularity * lat) / 1_000_000_000
    longitude = (lon_offset + granularity * lon) / 1_000_000_000
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise PBFError('PBF coordinates are outside longitude/latitude bounds')
    return latitude, longitude


def _blob(data):
    payload, compression, raw_size = None, None, None
    for number, wire, value in _fields(data):
        if number == 2:
            raw_size = _signed(_integer(wire, value))
        elif number in (1, 3, 4, 5, 6, 7):
            if compression is not None:
                raise PBFError('Multiple compression payloads in PBF Blob')
            compression, payload = number, _bytes(wire, value)
    if compression not in (1, 3):
        raise PBFError('Unsupported or missing PBF compression')
    if compression == 1:
        if len(payload) >= MAX_RAW_SIZE or (raw_size is not None and raw_size != len(payload)):
            raise PBFError('Invalid raw PBF Blob size')
        return payload
    if raw_size is None or not 0 < raw_size < MAX_RAW_SIZE:
        raise PBFError('Invalid or excessive uncompressed PBF Blob size')
    try:
        decoder = zlib.decompressobj()
        result = decoder.decompress(payload, raw_size + 1)
    except zlib.error as exc:
        raise PBFError('Invalid zlib PBF Blob') from exc
    if len(result) != raw_size or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise PBFError('PBF zlib stream size or framing mismatch')
    return result


def _read_exact(stream, size):
    data = stream.read(size)
    if len(data) != size:
        raise PBFError('Truncated PBF file block')
    return data


def _blocks(path):
    with open(path, 'rb') as stream:
        while True:
            prefix = stream.read(4)
            if not prefix:
                return
            if len(prefix) != 4:
                raise PBFError('Truncated PBF block length')
            size = struct.unpack('>I', prefix)[0]
            if not 0 < size < MAX_HEADER_SIZE:
                raise PBFError('PBF BlobHeader size is invalid or excessive')
            kind, data_size = None, None
            for number, wire, value in _fields(_read_exact(stream, size)):
                if number == 1:
                    kind = _text(_bytes(wire, value))
                elif number == 3:
                    data_size = _integer(wire, value)
            if kind is None or data_size is None or not 0 < data_size <= MAX_BLOB_SIZE:
                raise PBFError('Missing or invalid PBF BlobHeader fields')
            data = _read_exact(stream, data_size)
            # Future fileblock types are explicitly ignorable in the format.
            if kind in ('OSMHeader', 'OSMData'):
                yield kind, _blob(data)


def _check_header(data):
    for number, wire, value in _fields(data):
        if number in (4, 5):
            feature = _text(_bytes(wire, value))
            if number == 4 and feature not in _FEATURES:
                raise PBFError('Unsupported mandatory PBF feature: ' + feature)


def _primitive(data, kind, strings, granularity, lat_offset, lon_offset, node_ids):
    identity, lat, lon = None, None, None
    repeated = {2: [], 3: [], 8: [], 9: [], 10: []}
    for number, wire, value in _fields(data):
        if number == 1:
            raw_id = _integer(wire, value)
            identity = _zigzag(raw_id) if kind == 'node' else _signed(raw_id)
        elif kind == 'node' and number in (8, 9):
            if number == 8:
                lat = _zigzag(_integer(wire, value))
            else:
                lon = _zigzag(_integer(wire, value))
        elif number in repeated:
            repeated[number].append((wire, value))
    if identity is None:
        raise PBFError('Missing PBF primitive ID')
    if kind == 'node' and node_ids is not None and identity not in node_ids:
        return None
    result = {'type': kind, 'id': identity, 'tags': _tags(repeated[2], repeated[3], strings)}
    if kind == 'node':
        if lat is None or lon is None:
            raise PBFError('Missing node coordinates')
        result['lat'], result['lon'] = _coordinates(lat, lon, granularity, lat_offset, lon_offset)
    elif kind == 'way':
        refs, previous = [], 0
        for delta in _numbers(repeated[8], signed=True):
            previous = _sum_delta(previous, delta)
            refs.append(previous)
        result['nodes'] = refs
    else:
        members, previous = [], 0
        columns = (_numbers(repeated[8]), _numbers(repeated[9], signed=True), _numbers(repeated[10]))
        for role, delta, member_type in zip_longest(*columns, fillvalue=_MISSING):
            if role is _MISSING or delta is _MISSING or member_type is _MISSING:
                raise PBFError('Relation member arrays differ in length')
            if member_type not in (0, 1, 2):
                raise PBFError('Unknown relation member type')
            previous = _sum_delta(previous, delta)
            members.append({'type': _TYPES[member_type], 'ref': previous, 'role': _string(strings, role)})
        result['members'] = members
    return result


def _dense(data, strings, granularity, lat_offset, lon_offset, node_ids):
    repeated = {1: [], 8: [], 9: [], 10: []}
    for number, wire, value in _fields(data):
        if number in repeated:
            repeated[number].append((wire, value))
    tag_values = iter(_numbers(repeated[10]))
    first_tag = next(tag_values, _MISSING)
    has_tags = first_tag is not _MISSING
    if has_tags:
        tag_values = chain((first_tag,), tag_values)
    previous_id = previous_lat = previous_lon = 0
    columns = tuple(_numbers(repeated[n], signed=True) for n in (1, 8, 9))
    for delta_id, delta_lat, delta_lon in zip_longest(*columns, fillvalue=_MISSING):
        if delta_id is _MISSING or delta_lat is _MISSING or delta_lon is _MISSING:
            raise PBFError('Dense node columns differ in length')
        previous_id = _sum_delta(previous_id, delta_id)
        previous_lat = _sum_delta(previous_lat, delta_lat)
        previous_lon = _sum_delta(previous_lon, delta_lon)
        wanted = node_ids is None or previous_id in node_ids
        tags = {} if wanted else None
        if has_tags:
            while True:
                key = next(tag_values, _MISSING)
                if key is _MISSING:
                    raise PBFError('Missing dense node tag delimiter')
                if key == 0:
                    break
                value = next(tag_values, _MISSING)
                if value is _MISSING:
                    raise PBFError('Missing dense node tag value')
                # Consume delimiters for every node, but build tags only for
                # requested IDs. No tag dictionaries/lookups for skipped nodes.
                if wanted:
                    tags[_string(strings, key)] = _string(strings, value)
        if wanted:
            latitude, longitude = _coordinates(previous_lat, previous_lon, granularity, lat_offset, lon_offset)
            yield {'type': 'node', 'id': previous_id, 'lat': latitude, 'lon': longitude, 'tags': tags}
    if next(tag_values, _MISSING) is not _MISSING:
        raise PBFError('Excess dense node tag values')


def _primitive_block(data, types, node_ids):
    strings, groups = None, []
    granularity, lat_offset, lon_offset = 100, 0, 0
    for number, wire, value in _fields(data):
        if number == 1:
            strings = [_text(_bytes(w, v)) for n, w, v in _fields(_bytes(wire, value)) if n == 1]
        elif number == 2:
            groups.append(_bytes(wire, value))
        elif number == 17:
            granularity = _integer(wire, value)
        elif number == 19:
            lat_offset = _signed(_integer(wire, value))
        elif number == 20:
            lon_offset = _signed(_integer(wire, value))
    if not strings or strings[0] != '':
        raise PBFError('Missing or invalid PBF StringTable')
    if not 0 < granularity < (1 << 31):
        raise PBFError('Invalid PBF coordinate granularity')
    nodes_wanted = 'node' in types and (node_ids is None or bool(node_ids))
    for group in groups:
        for number, wire, value in _fields(group):
            if number == 2:
                if nodes_wanted:
                    yield from _dense(_bytes(wire, value), strings, granularity, lat_offset, lon_offset, node_ids)
            elif number in (1, 3, 4):
                kind = {1: 'node', 3: 'way', 4: 'relation'}[number]
                if kind in types and (kind != 'node' or nodes_wanted):
                    element = _primitive(_bytes(wire, value), kind, strings, granularity, lat_offset, lon_offset, node_ids)
                    if element is not None:
                        yield element


def iter_elements(path, types=('node', 'way', 'relation'), node_ids=None):
    """Yield Overpass-like element dictionaries, holding only one PBF block.

    ``types`` selects decoded entities. Omit ``node`` on the first road/relation
    pass to skip costly DenseNodes decoding. On a second pass, a set/frozenset
    ``node_ids`` builds node objects and tags only for referenced IDs, while
    preserving all coordinate/ID deltas. Contributor metadata is never returned.
    Unknown required features, history files and unsupported compression fail.

    Fully consume the iterator before publishing output: a later malformed block
    raises PBFError after any already yielded elements. This reader does no I/O
    other than reading ``path`` and never stores data or contacts a service.
    """
    types = frozenset(types)
    if not types <= frozenset(_TYPES):
        raise ValueError('Unsupported OSM element type')
    if node_ids is not None and not isinstance(node_ids, Set):
        raise ValueError('node_ids must be a set or frozenset')
    seen_header = False
    for kind, data in _blocks(path):
        if kind == 'OSMHeader':
            _check_header(data)
            seen_header = True
        elif not seen_header:
            raise PBFError('OSMData appears before OSMHeader')
        else:
            yield from _primitive_block(data, types, node_ids)
    if not seen_header:
        raise PBFError('Missing OSMHeader')
