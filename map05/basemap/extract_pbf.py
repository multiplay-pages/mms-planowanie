"""Extract a fixed public road rectangle from already downloaded regional PBFs.

No networking, address data, customer locations or geocoding is used. Each PBF
is read twice: road/restriction refs first, then just referenced nodes. Only
complete ways inside BOUNDS survive; a missing point never becomes a shortcut.
"""

import argparse
from itertools import chain
import hashlib
import json
import math
import os
from pathlib import Path
import re

try:
    from .download_regional import BOUNDS, ROAD_TYPES, safe_tags
    from .osm_pbf import iter_elements
except ImportError:  # Direct execution from the project root.
    from download_regional import BOUNDS, ROAD_TYPES, safe_tags
    from osm_pbf import iter_elements


ROOT = Path(__file__).resolve().parent
REGIONS = ('opolskie', 'slaskie', 'dolnoslaskie', 'wielkopolskie')
BASE_URL = 'https://download.geofabrik.de/europe/poland/'
_CONTROL_KEYS = ('barrier', 'locked', 'access', 'vehicle', 'motor_vehicle', 'motorcar')


def _same_or_add(mapping, identity, value):
    if identity in mapping and mapping[identity] != value:
        raise ValueError(f'Conflicting public OSM snapshots for {identity}; refusing inconsistent topology.')
    mapping[identity] = value


def _point(element):
    point = [element.get('lon'), element.get('lat')]
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point):
        raise ValueError('Invalid public OSM node coordinates.')
    if not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
        raise ValueError('Public OSM node outside longitude/latitude bounds.')
    return point


def _inside(point, bounds):
    west, south, east, north = bounds
    return west <= point[0] <= east and south <= point[1] <= north


def _is_control(tags):
    return any(key == base or key.startswith(base + ':') for key in tags for base in _CONTROL_KEYS)


def _road(element):
    return {'id': element['id'], 'nodes': list(element.get('nodes', [])), 'tags': safe_tags(element.get('tags', {}))}


def _restriction(element):
    return {'id': element['id'], 'tags': safe_tags(element.get('tags', {})), 'members': [
        {key: member[key] for key in ('type', 'ref', 'role')}
        for member in element.get('members', []) if member.get('role') in ('from', 'to', 'via')
    ]}


def road_features(roads):
    return [{'id': str(way['id']), 'kind': 'road', 'category': way['tags']['highway'], 'name': way['tags'].get('name', ''), 'points': [roads['nodes'][str(ref)] for ref in way['nodes']]} for way in roads['ways']]


def assemble(elements, bounds=BOUNDS, *, include_features=True):
    """Pure conversion of controlled Overpass-like elements to complete roads.

    Returns ``(roads, features, stats)``. ``omittedBoundaryWays`` counts ways
    touching the rectangle but missing at least one in-bounds referenced node;
    this deliberately also includes incomplete source geometry. Ways with no
    retained point are counted separately as ``outsideWays``.
    """
    nodes, ways, restrictions = {}, {}, {}
    for element in elements:
        kind, identity, tags = element.get('type'), element.get('id'), element.get('tags', {})
        if kind == 'node':
            _same_or_add(nodes, identity, (_point(element), safe_tags(tags)))
        elif kind == 'way' and tags.get('highway') in ROAD_TYPES:
            _same_or_add(ways, identity, _road(element))
        elif kind == 'relation' and tags.get('type') == 'restriction':
            _same_or_add(restrictions, identity, _restriction(element))
    inside = {identity: value for identity, value in nodes.items() if _inside(value[0], bounds)}
    kept, needed = [], set()
    stats = {'candidateWays': len(ways), 'candidateRestrictions': len(restrictions), 'omittedBoundaryWays': 0, 'outsideWays': 0, 'invalidWays': 0}
    for identity in sorted(ways):
        way = ways[identity]
        refs = way['nodes']
        if len(refs) < 2:
            stats['invalidWays'] += 1
        elif all(ref in inside for ref in refs):
            kept.append(way)
            needed.update(refs)
        elif any(ref in inside for ref in refs):
            stats['omittedBoundaryWays'] += 1
        else:
            stats['outsideWays'] += 1
    way_ids = {way['id'] for way in kept}
    result = {
        'nodes': {str(identity): inside[identity][0] for identity in sorted(needed)},
        'ways': kept,
        'barriers': {str(identity): inside[identity][1] for identity in sorted(needed) if _is_control(inside[identity][1])},
        'restrictions': [restrictions[identity] for identity in sorted(restrictions) if any(
            (member['type'] == 'way' and member['ref'] in way_ids) or (member['type'] == 'node' and member['ref'] in needed)
            for member in restrictions[identity]['members']
        )],
    }
    stats.update({'keptWays': len(kept), 'keptNodes': len(result['nodes']), 'keptControlNodes': len(result['barriers']), 'keptRestrictions': len(result['restrictions'])})
    return result, road_features(result) if include_features else [], stats


def merge_roads(parts):
    """Merge equal OSM IDs across regional extracts; reject conflicts."""
    nodes, ways, barriers, restrictions = {}, {}, {}, {}
    for part in parts:
        for identity, point in part['nodes'].items():
            if identity in nodes and barriers.get(identity, {}) != part['barriers'].get(identity, {}):
                raise ValueError('Conflicting public OSM control-node tags for ' + identity)
            _same_or_add(nodes, identity, point)
        for identity, tags in part['barriers'].items():
            _same_or_add(barriers, identity, tags)
        for way in part['ways']:
            _same_or_add(ways, way['id'], way)
        for relation in part['restrictions']:
            _same_or_add(restrictions, relation['id'], relation)
    return {
        'nodes': {identity: nodes[identity] for identity in sorted(nodes, key=int)},
        'ways': [ways[identity] for identity in sorted(ways)],
        'barriers': {identity: barriers[identity] for identity in sorted(barriers, key=int)},
        'restrictions': [restrictions[identity] for identity in sorted(restrictions)],
    }


def verify_sources(source_dir, manifest):
    """Verify the four fixed public files against recorded local SHA256 values."""
    if not isinstance(manifest, dict) or set(manifest) != set(REGIONS):
        raise ValueError('The source manifest must name exactly the four approved public regions.')
    verified = []
    for region in REGIONS:
        record = manifest[region]
        filename = region + '-latest.osm.pbf'
        if not isinstance(record, dict) or record.get('filename') != filename or record.get('url') != BASE_URL + filename:
            raise ValueError('Source manifest filename or public URL differs from the approved region.')
        expected = record.get('sha256')
        size = record.get('bytes')
        if not isinstance(expected, str) or not re.fullmatch('[0-9a-f]{64}', expected) or isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            raise ValueError('Missing or invalid public source hash/size.')
        path = Path(source_dir) / filename
        if path.stat().st_size != size:
            raise ValueError('Public PBF size differs from the recorded source: ' + filename)
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError('Public PBF SHA256 mismatch: ' + filename)
        verified.append({key: record[key] for key in ('filename', 'url', 'bytes', 'sha256', 'md5', 'lastModified', 'retrievedAt') if key in record})
    return verified


def _write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        stream.write('\n')
    os.replace(temporary, path)


def extract(source_dir=ROOT / 'public-pbf', manifest_path=None, output_dir=ROOT, *, progress=print):
    """Perform offline verified two-pass extraction and write both JSON outputs."""
    source_dir, output_dir = Path(source_dir), Path(output_dir)
    manifest_path = Path(manifest_path) if manifest_path else source_dir / 'sources.json'
    files = verify_sources(source_dir, json.loads(manifest_path.read_text(encoding='utf-8-sig')))
    progress('Verified all four public PBF SHA256 values locally.', flush=True)
    merged = {'nodes': {}, 'ways': [], 'barriers': {}, 'restrictions': []}
    source_stats = []
    for record in files:
        path = source_dir / record['filename']
        progress('Reading public ways/turn restrictions: ' + path.name, flush=True)
        ways, restrictions, needed = {}, {}, set()
        for element in iter_elements(path, types=('way', 'relation')):
            tags = element['tags']
            if element['type'] == 'way' and tags.get('highway') in ROAD_TYPES:
                clean = _road(element)
                _same_or_add(ways, clean['id'], clean)
                needed.update(clean['nodes'])
            elif element['type'] == 'relation' and tags.get('type') == 'restriction':
                clean = _restriction(element)
                _same_or_add(restrictions, clean['id'], clean)
        progress(f'Reading {len(needed)} referenced public nodes for {path.name}; {len(ways)} candidate roads.', flush=True)
        nodes = {}
        for element in iter_elements(path, types=('node',), node_ids=needed):
            point = _point(element)
            if _inside(point, BOUNDS):
                clean = {'type': 'node', 'id': element['id'], 'lon': point[0], 'lat': point[1], 'tags': safe_tags(element['tags'])}
                _same_or_add(nodes, clean['id'], clean)
        # Drop full-province references before constructing the clipped graph.
        del needed
        elements = chain(nodes.values(), ({'type': 'way', **way} for way in ways.values()), ({'type': 'relation', **relation} for relation in restrictions.values()))
        part, _, stats = assemble(elements, include_features=False)
        del nodes, ways, restrictions, elements
        merged = merge_roads((merged, part))
        del part
        source_stats.append({'filename': path.name, **stats})
        progress(f"Kept {stats['keptWays']} complete roads / {stats['keptNodes']} nodes from {path.name}; omitted {stats['omittedBoundaryWays']} boundary/incomplete ways.", flush=True)
    if not merged['ways']:
        raise ValueError('No complete public roads inside the fixed rectangle; existing output was not replaced.')
    fingerprint = json.dumps([(entry['filename'], entry['sha256']) for entry in files], ensure_ascii=True, separators=(',', ':')).encode('ascii')
    source = {'provider': 'OSM_GEOFABRIK', 'method': 'local_pbf_fixed_bbox', 'fixedBBoxOnly': True, 'files': files, 'sourceSha256': hashlib.sha256(fingerprint).hexdigest(), 'hashScope': 'ordered_source_filenames_and_sha256'}
    counts = {'ways': len(merged['ways']), 'nodes': len(merged['nodes']), 'controlNodes': len(merged['barriers']), 'restrictions': len(merged['restrictions'])}
    metadata = {'schemaVersion': 1, 'bounds': list(BOUNDS), 'source': source, 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0', 'copyright_url': 'https://www.openstreetmap.org/copyright', 'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/', 'extractionStats': {'counts': counts, 'perSource': source_stats, 'omissionPolicy': 'whole ways only; boundary omission count includes missing referenced nodes'}}
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_json(output_dir / 'regional-roads.json', {**metadata, **merged})
    features = road_features(merged)
    _write_json(output_dir / 'planner-data.json', {**metadata, 'regions': {'PLANNER': {'bounds': list(BOUNDS), 'features': features}}})
    progress('Saved public road graph and planner map locally: ' + json.dumps(counts, sort_keys=True), flush=True)
    return {**counts, 'sourceSha256': source['sourceSha256'], 'perSource': source_stats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=ROOT / 'public-pbf')
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    args = parser.parse_args()
    extract(args.source_dir, output_dir=args.output_dir)


if __name__ == '__main__':
    main()
