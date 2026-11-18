"""Minimal, dependency-free PMTiles v3 writer/reader (standard library only).

Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
Only what MAP-08 needs: clustered archives of gzip-compressed MVT tiles, gzip directories,
optional leaf directories. The reader exists for tests and verification.
"""
import gzip
import json
import struct

HEADER_BYTES = 127
ROOT_LIMIT = 16384 - HEADER_BYTES
COMPRESSION_NONE, COMPRESSION_GZIP = 1, 2
TILE_TYPE_MVT = 1


def tile_id(z, x, y):
    """Hilbert-curve tile ID used by PMTiles v3."""
    if not 0 <= z <= 26 or not (0 <= x < 1 << z and 0 <= y < 1 << z):
        raise ValueError('Tile outside the pyramid')
    n = 1 << z
    d, s = 0, n >> 1
    acc = ((1 << (2 * z)) - 1) // 3
    while s > 0:
        rx, ry = 1 if x & s else 0, 1 if y & s else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x, y = n - 1 - x, n - 1 - y
            x, y = y, x
        s >>= 1
    return acc + d


def zxy_from_tile_id(value):
    z = 0
    while True:
        count = 1 << (2 * z)
        if value < count:
            break
        value -= count
        z += 1
    n, x, y, t, s = 1 << z, 0, 0, value, 1
    while s < n:
        rx = 1 & (t // 2)
        ry = 1 & (t ^ rx)
        if ry == 0:
            if rx == 1:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        x += s * rx
        y += s * ry
        t //= 4
        s *= 2
    return z, x, y


def _varint(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def _read_varint(data, position):
    value = shift = 0
    while True:
        byte = data[position]
        position += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, position
        shift += 7


def serialize_directory(entries):
    """entries: list of (tile_id, offset, length, run_length) sorted by tile_id."""
    out = bytearray(_varint(len(entries)))
    previous = 0
    for entry in entries:
        out += _varint(entry[0] - previous)
        previous = entry[0]
    for entry in entries:
        out += _varint(entry[3])
    for entry in entries:
        out += _varint(entry[2])
    for index, entry in enumerate(entries):
        if index and entry[1] == entries[index - 1][1] + entries[index - 1][2]:
            out += _varint(0)
        else:
            out += _varint(entry[1] + 1)
    return bytes(out)


def deserialize_directory(data):
    position = 0
    count, position = _read_varint(data, position)
    ids, runs, lengths, offsets = [], [], [], []
    previous = 0
    for _ in range(count):
        delta, position = _read_varint(data, position)
        previous += delta
        ids.append(previous)
    for _ in range(count):
        value, position = _read_varint(data, position)
        runs.append(value)
    for _ in range(count):
        value, position = _read_varint(data, position)
        lengths.append(value)
    for index in range(count):
        value, position = _read_varint(data, position)
        if value == 0 and not index:
            raise ValueError('The first directory entry needs an explicit offset.')
        offsets.append(offsets[index - 1] + lengths[index - 1] if value == 0 else value - 1)
    return list(zip(ids, offsets, lengths, runs))


def _build_directories(entries):
    """Returns (root_bytes, leaf_bytes) both gzip-compressed, following the reference splitting."""
    root = gzip.compress(serialize_directory(entries), 9, mtime=0)
    if len(root) <= ROOT_LIMIT:
        return root, b''
    size = 4096
    while True:
        leaves, root_entries, offset = bytearray(), [], 0
        for start in range(0, len(entries), size):
            chunk = gzip.compress(serialize_directory(entries[start:start + size]), 9, mtime=0)
            root_entries.append((entries[start][0], offset, len(chunk), 0))
            leaves += chunk
            offset += len(chunk)
        root = gzip.compress(serialize_directory(root_entries), 9, mtime=0)
        if len(root) <= ROOT_LIMIT:
            return root, bytes(leaves)
        size *= 2


def write_pmtiles(path, tiles, *, min_zoom, max_zoom, bounds, center, metadata):
    """tiles: dict {(z,x,y): gzip-compressed MVT bytes}. Atomic write; returns summary."""
    order = sorted((tile_id(*key), key) for key in tiles)
    body, entries, offset = bytearray(), [], 0
    cache = {}
    for identifier, key in order:
        data = tiles[key]
        # Identical tile bodies (e.g. empty water tiles) are stored once.
        if data in cache:
            entries.append((identifier, cache[data], len(data), 1))
            continue
        cache[data] = offset
        entries.append((identifier, offset, len(data), 1))
        body += data
        offset += len(data)
    root, leaves = _build_directories(entries)
    meta = gzip.compress(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9, mtime=0)
    root_offset = HEADER_BYTES
    meta_offset = root_offset + len(root)
    leaf_offset = meta_offset + len(meta)
    data_offset = leaf_offset + len(leaves)
    e7 = lambda value: int(round(value * 1e7))
    header = b'PMTiles' + bytes([3]) + struct.pack(
        '<QQQQQQQQQQQ', root_offset, len(root), meta_offset, len(meta), leaf_offset, len(leaves),
        data_offset, len(body), len(entries), len(entries), len(cache))
    header += bytes([1, COMPRESSION_GZIP, COMPRESSION_GZIP, TILE_TYPE_MVT, min_zoom, max_zoom])
    header += struct.pack('<iiii', e7(bounds[0]), e7(bounds[1]), e7(bounds[2]), e7(bounds[3]))
    header += bytes([center[2]]) + struct.pack('<ii', e7(center[0]), e7(center[1]))
    assert len(header) == HEADER_BYTES, len(header)
    tmp = str(path) + '.tmp'
    with open(tmp, 'wb') as stream:
        stream.write(header + root + meta + leaves + bytes(body))
    import os
    os.replace(tmp, path)
    return {'tiles': len(entries), 'uniqueTiles': len(cache), 'bytes': len(header) + len(root) + len(meta) + len(leaves) + len(body),
            'rootBytes': len(root), 'leafBytes': len(leaves), 'dataBytes': len(body)}


def read_header(data):
    if data[:7] != b'PMTiles' or data[7] != 3:
        raise ValueError('Not a PMTiles v3 archive')
    q = struct.unpack('<QQQQQQQQQQQ', data[8:96])
    keys = ('rootOffset', 'rootBytes', 'metaOffset', 'metaBytes', 'leafOffset', 'leafBytes', 'dataOffset', 'dataBytes', 'addressed', 'entries', 'contents')
    header = dict(zip(keys, q))
    header.update(clustered=data[96], internalCompression=data[97], tileCompression=data[98], tileType=data[99], minZoom=data[100], maxZoom=data[101])
    lon0, lat0, lon1, lat1 = struct.unpack('<iiii', data[102:118])
    header['bounds'] = [lon0 / 1e7, lat0 / 1e7, lon1 / 1e7, lat1 / 1e7]
    return header


def read_tile(data, z, x, y):
    """Returns the stored (still compressed) tile bytes or None."""
    header = read_header(data)
    target = tile_id(z, x, y)
    directory = deserialize_directory(gzip.decompress(data[header['rootOffset']:header['rootOffset'] + header['rootBytes']]))
    for _ in range(4):
        found = None
        for entry in directory:
            if entry[0] <= target:
                found = entry
            else:
                break
        if not found:
            return None
        if found[3] > 0:
            if target < found[0] + found[3]:
                start = header['dataOffset'] + found[1]
                return data[start:start + found[2]]
            return None
        start = header['leafOffset'] + found[1]
        directory = deserialize_directory(gzip.decompress(data[start:start + found[2]]))
    return None


def read_metadata(data):
    header = read_header(data)
    return json.loads(gzip.decompress(data[header['metaOffset']:header['metaOffset'] + header['metaBytes']]))
