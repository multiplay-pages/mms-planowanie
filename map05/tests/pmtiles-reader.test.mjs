import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {before, test} from 'node:test';
import {httpSource, memorySource, openPack, parseDirectory, parseHeader, tileId} from '../pmtiles-reader.mjs';

const metadata = {name: 'Łódź', format: 'pbf', vector_layers: [{id: 'places'}]};
const packUrl = 'https://example.invalid/map.pmtiles';
let archive;
let expectedTiles;
let compressedTileLengths;

before(() => {
  const output = execFileSync('python', ['-B', '-X', 'utf8', '-c', `
import base64
import gzip
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from map05.basemap.pmtiles_io import write_pmtiles
from map05.basemap.vector_tiles import Layer, encode_tile

def place_tile(name, point):
    places = Layer('places')
    places.add(None, 1, [[point]], {'name': name, 'class': 'city'})
    return encode_tile([places])

tiles = {
    (0, 0, 0): place_tile('Łódź', (80, 30)),
    (1, 1, 1): place_tile('Żory', (420, 120)),
}
with TemporaryDirectory() as directory:
    path = Path(directory) / 'map.pmtiles'
    write_pmtiles(
        path, tiles, min_zoom=0, max_zoom=1, bounds=(-126.453, -3.5, 22.1234567, 51.25),
        center=(18, 50, 1), metadata=json.loads(sys.argv[1]),
    )
    print(json.dumps({
        'pack': base64.b64encode(path.read_bytes()).decode('ascii'),
        'tiles': [base64.b64encode(gzip.decompress(tile)).decode('ascii') for tile in tiles.values()],
        'compressedTileLengths': [len(tile) for tile in tiles.values()],
    }))
`, JSON.stringify(metadata)], {cwd: new URL('../../', import.meta.url), encoding: 'utf8'});
  const fixture = JSON.parse(output);
  archive = Uint8Array.from(Buffer.from(fixture.pack, 'base64'));
  expectedTiles = fixture.tiles.map(tile => Uint8Array.from(Buffer.from(tile, 'base64')));
  compressedTileLengths = fixture.compressedTileLengths;
});

test('tileId matches the Python writer Hilbert IDs for zooms zero and one', () => {
  const coordinates = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]];
  for (const [expected, zxy] of coordinates.entries()) {
    assert.equal(tileId(...zxy), expected, zxy.join('/'));
  }
});

test('parseHeader reads the Python header from a view with a nonzero byte offset', () => {
  const padded = new Uint8Array(127 + 8);
  padded.set(archive.subarray(0, 127), 4);
  const header = parseHeader(padded.subarray(4, 131));
  assert.equal(header.rootOffset, 127);
  assert.equal(header.rootOffset + header.rootLength, header.metadataOffset);
  assert.equal(header.metadataOffset + header.metadataLength, header.leafOffset);
  assert.equal(header.leafLength, 0);
  assert.equal(header.leafOffset + header.leafLength, header.dataOffset);
  assert.equal(header.dataOffset + header.dataLength, archive.length);
  assert.deepEqual([header.internalCompression, header.tileCompression, header.tileType], [2, 2, 1]);
  assert.deepEqual([header.minZoom, header.maxZoom], [0, 1]);
  assert.deepEqual(header.bounds, [-126.453, -3.5, 22.1234567, 51.25]);
});

test('parseHeader rejects incorrect magic, unsupported version, and non-vector tile type', () => {
  const invalidHeaders = [
    [0, 0, /PMTiles v3/],
    [7, 2, /PMTiles v3/],
    [99, 2, /nie zawiera kafli wektorowych/],
  ];
  for (const [offset, value, message] of invalidHeaders) {
    const bytes = archive.slice(0, 127);
    bytes[offset] = value;
    assert.throws(() => parseHeader(bytes), {name: 'Error', message}, `header byte ${offset}`);
  }
  assert.throws(() => parseHeader(archive.subarray(0, 126)), /PMTiles v3/);
});

test('parseDirectory decodes varints, runs, contiguous offsets and shared offsets', () => {
  const directory = Uint8Array.of(
    3,                          // entry count
    2, 0x96, 1, 3,              // tile ID deltas: 2, 150, 3
    3, 0, 2,                    // runs, including a leaf pointer
    0x86, 1, 17, 0x86, 1,       // lengths: 134, 17, 134
    0x81, 1, 0, 0x81, 1,        // first offset + 1, contiguous, reused first offset + 1
  );
  assert.deepEqual(parseDirectory(directory), [
    {tileId: 2, offset: 128, length: 134, run: 3},
    {tileId: 152, offset: 262, length: 17, run: 0},
    {tileId: 155, offset: 128, length: 134, run: 2},
  ]);
  assert.deepEqual(parseDirectory(Uint8Array.of(0)), []);
});

test('a truncated varint in the directory raises Error', () => {
  const truncatedDirectory = Uint8Array.of(1, 0x80);
  assert.throws(
    () => parseDirectory(truncatedDirectory),
    {name: 'Error', message: /Uszkodzony katalog pakietu mapy/},
  );
});

test('openPack surfaces a corrupt directory through memorySource', async () => {
  const corrupt = archive.slice(0, 129);
  new DataView(corrupt.buffer).setBigUint64(16, 2n, true); // Root directory length.
  corrupt[97] = 1; // Use an uncompressed root to reach the directory parser.
  corrupt.set([1, 0x80], 127);
  await assert.rejects(
    openPack(memorySource(corrupt)),
    {name: 'Error', message: /Uszkodzony katalog pakietu mapy/},
  );
});

test('openPack reads Python metadata and gunzips MVT bytes through memorySource', async () => {
  const source = memorySource(archive);
  const pack = await openPack(source);
  assert.equal(pack.source, source);
  assert.deepEqual(await pack.metadata(), metadata);
  assert.deepEqual(await pack.tile(0, 0, 0), expectedTiles[0]);
  assert.deepEqual(await pack.tile(1, 1, 1), expectedTiles[1]);
  assert.equal(await pack.tile(1, 0, 1), null);
  assert.equal(await pack.tile(2, 0, 0), null);
});

test('httpSource uses byte ranges with HTTP 206 and forwards the tile abort signal', async () => {
  const calls = [];
  const source = httpSource(packUrl, async (url, {headers, signal}) => {
    assert.equal(url, packUrl);
    const range = /^bytes=(\d+)-(\d+)$/.exec(headers.Range);
    assert.ok(range, 'expected an inclusive HTTP byte range');
    calls.push({range: headers.Range, signal});
    return new Response(archive.subarray(Number(range[1]), Number(range[2]) + 1), {status: 206});
  });
  const pack = await openPack(source);
  const signal = new AbortController().signal;
  assert.deepEqual(await pack.metadata(), metadata);
  assert.deepEqual(await pack.tile(0, 0, 0, signal), expectedTiles[0]);
  assert.deepEqual(await pack.tile(1, 1, 1, signal), expectedTiles[1]);
  const start = pack.header.dataOffset;
  const [firstLength, secondLength] = compressedTileLengths;
  const secondStart = start + firstLength;
  const end = secondStart + secondLength - 1;
  assert.deepEqual(calls, [
    {range: 'bytes=0-16383', signal: undefined},
    {range: `bytes=${end}-${end}`, signal: undefined}, // open-time probe: the data section is really there
    {range: `bytes=${start}-${secondStart - 1}`, signal},
    {range: `bytes=${secondStart}-${end}`, signal},
  ]);
});

test('httpSource slices and caches the full response when HTTP 200 ignores Range', async () => {
  const ranges = [];
  const source = httpSource(packUrl, async (url, {headers}) => {
    assert.equal(url, packUrl);
    ranges.push(headers.Range);
    return new Response(archive, {status: 200});
  });

  assert.deepEqual(await source.getBytes(3, 5), archive.subarray(3, 8));
  const pack = await openPack(source);
  assert.deepEqual(await pack.metadata(), metadata);
  assert.deepEqual(await pack.tile(1, 1, 1), expectedTiles[1]);
  assert.deepEqual(await pack.tile(0, 0, 0), expectedTiles[0]);
  assert.deepEqual(ranges, ['bytes=3-7']);
});

test('a directory whose first entry has a zero offset code is rejected',()=>{
  assert.throws(()=>parseDirectory(Uint8Array.of(1,0,1,1,0)),/katalog/i);
});

test('a pack cut off inside the data section is rejected when it is opened, not at the first tile', async () => {
  const header = parseHeader(archive);
  const cut = archive.subarray(0, header.dataOffset + 3);
  await assert.rejects(openPack(memorySource(cut)), /ucięty/);
});

test('openPack lists the layers the pack really contains', async () => {
  const pack = await openPack(memorySource(archive));
  assert.ok(pack.layers instanceof Set);
  assert.deepEqual([...pack.layers].sort(), (metadata.vector_layers ?? []).map((layer) => layer.id).sort());
});
