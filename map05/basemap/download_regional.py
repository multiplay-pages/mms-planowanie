"""One-time public regional OSM extract, never a query about order locations.

The fixed, uniform bbox is independent of address IDs and coordinates. Runtime
and tests never invoke the downloader. --execute is required for network use.
"""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
BOUNDS = [17.2, 49.9, 19.0, 51.5]
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
ROAD_TYPES = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian', 'track'}
TAGS = {'highway', 'name', 'ref', 'junction', 'oneway', 'oneway:motorcar', 'oneway:motor_vehicle', 'access', 'vehicle', 'motor_vehicle', 'motorcar', 'maxspeed', 'maxspeed:forward', 'maxspeed:backward', 'service', 'area', 'surface', 'ford', 'barrier', 'locked', 'restriction', 'restriction:motorcar', 'restriction:motor_vehicle', 'except', 'type'}


def public_query(bounds=None):
    west, south, east, north = bounds or BOUNDS
    types = '|'.join(sorted(ROAD_TYPES))
    return f'[out:json][timeout:45];way["highway"~"^({types})$"]({south},{west},{north},{east})->.roads;(.roads;node(w.roads)[~"^(barrier|access|vehicle|motor_vehicle|motorcar)$"~"."];rel(bw.roads)["type"="restriction"];);out body geom;'


def safe_tags(tags):
    return {key: str(value) for key, value in tags.items() if key in TAGS or re.fullmatch(r'(access|vehicle|motor_vehicle|motorcar|maxspeed|oneway)(:(forward|backward))?(:conditional)?', key) or (key.endswith(':conditional') and key.startswith('restriction'))}


def convert(elements):
    nodes, ways, barriers, restrictions, features = {}, [], {}, [], []
    for element in elements:
        tags = element.get('tags', {})
        if element.get('type') != 'way' or tags.get('highway') not in ROAD_TYPES:
            continue
        ids, geometry = element.get('nodes', []), element.get('geometry', [])
        if len(ids) < 2 or len(ids) != len(geometry):
            raise ValueError('Incomplete road geometry; refusing to join missing nodes.')
        points = []
        for node_id, position in zip(ids, geometry):
            if not isinstance(position, dict):
                raise ValueError('Missing road geometry.')
            point = [position.get('lon'), position.get('lat')]
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in point) or not (14 <= point[0] <= 25 and 48 <= point[1] <= 56):
                raise ValueError('Invalid geographic road coordinates.')
            previous = nodes.get(str(node_id))
            if previous is not None and previous != point:
                raise ValueError('Contradictory coordinates for a shared OSM node.')
            nodes[str(node_id)] = point
            points.append(point)
        ways.append({'id': element['id'], 'nodes': ids, 'tags': safe_tags(tags)})
        features.append({'id': str(element['id']), 'kind': 'road', 'category': tags['highway'], 'name': tags.get('name', ''), 'points': points})
    for element in elements:
        tags = element.get('tags', {})
        if element.get('type') == 'node' and any(key in tags for key in ['barrier', 'access', 'vehicle', 'motor_vehicle', 'motorcar']) and str(element['id']) in nodes:
            barriers[str(element['id'])] = safe_tags(tags)
        if element.get('type') == 'relation' and tags.get('type') == 'restriction':
            restrictions.append({'id': element['id'], 'tags': safe_tags(tags), 'members': [{key: member[key] for key in ['type', 'ref', 'role']} for member in element.get('members', []) if member.get('role') in {'from', 'to', 'via'}]})
    return {'nodes': nodes, 'ways': ways, 'barriers': barriers, 'restrictions': restrictions}, features


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--endpoint', choices=ENDPOINTS, default=ENDPOINTS[0])
    args = parser.parse_args()
    checkpoint = ROOT / 'regional-osm.json.gz'
    query = public_query()
    if not checkpoint.exists():
        if not args.execute:
            print('DRY RUN: fixed public region only; 0 requests. Use --execute for public OSM data.')
            return
        documents = []
        west, south, east, north = BOUNDS
        boxes = [[round(west + (east-west)*column/4, 4), round(south + (north-south)*row/4, 4), round(west + (east-west)*(column+1)/4, 4), round(south + (north-south)*(row+1)/4, 4)] for row in range(4) for column in range(4)]
        for index, box in enumerate(boxes):
            part_query = public_query(box)
            part_file = ROOT / f'regional-part-{index:02}.json.gz'
            if part_file.exists():
                with gzip.open(part_file, 'rt', encoding='utf-8') as stream:
                    part = json.load(stream)
                if part.get('_source', {}).get('query') != part_query:
                    raise ValueError('Regional part checkpoint differs from fixed public query.')
            else:
                url = args.endpoint + '?' + urllib.parse.urlencode({'data': part_query})
                request = urllib.request.Request(url, headers={'User-Agent': 'MMS-Local-Map/1.0 (bounded public map)', 'Accept': 'application/json', 'Accept-Encoding': 'gzip'})
                print(f'Downloading uniform public map part {index+1}/{len(boxes)}; no order data.', flush=True)
                with urllib.request.urlopen(request, timeout=60) as response:
                    content = response.read(30_000_001)
                    encoding = response.headers.get('Content-Encoding', '')
                if len(content) > 30_000_000:
                    raise ValueError('Public part exceeds bounded size limit.')
                if encoding == 'gzip':
                    content = gzip.decompress(content)
                part = json.loads(content)
                if part.get('remark') or not isinstance(part.get('elements'), list) or not part['elements']:
                    raise ValueError('Partial or empty map part; no complete checkpoint saved.')
                part['_source'] = {'endpoint': args.endpoint, 'query': part_query, 'retrievedAt': datetime.now(timezone.utc).isoformat()}
                with gzip.open(part_file.with_suffix('.gz.tmp'), 'wt', encoding='utf-8') as stream:
                    json.dump(part, stream, ensure_ascii=False, separators=(',', ':'))
                os.replace(part_file.with_suffix('.gz.tmp'), part_file)
            documents.append(part)
        elements = {(element['type'], element['id']): element for part in documents for element in part['elements']}
        document = {'elements': list(elements.values()), 'osm3s': documents[0].get('osm3s', {}), '_source': {'endpoint': args.endpoint, 'query': query, 'parts': [part['_source'] for part in documents], 'retrievedAt': datetime.now(timezone.utc).isoformat()}}
        temporary = checkpoint.with_suffix('.gz.tmp')
        with gzip.open(temporary, 'wt', encoding='utf-8') as stream:
            json.dump(document, stream, ensure_ascii=False, separators=(',', ':'))
        os.replace(temporary, checkpoint)
    with gzip.open(checkpoint, 'rt', encoding='utf-8') as stream:
        document = json.load(stream)
    if document.get('remark') or document['_source']['query'] != query:
        raise ValueError('Checkpoint query/coverage differs; it will not be replaced silently.')
    roads, features = convert(document['elements'])
    if not features:
        raise ValueError('No actual roads in public extract.')
    provenance = {**document['_source'], 'osmBase': document.get('osm3s', {}).get('timestamp_osm_base'), 'rawSha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest()}
    metadata = {'schemaVersion': 1, 'bounds': BOUNDS, 'source': provenance, 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0', 'copyright_url': 'https://www.openstreetmap.org/copyright', 'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/'}
    atomic_json(ROOT / 'regional-roads.json', {**metadata, **roads})
    atomic_json(ROOT / 'planner-data.json', {**metadata, 'regions': {'PLANNER': {'bounds': BOUNDS, 'features': features}}})
    print(f"Saved {len(ways := roads['ways'])} roads, {len(roads['nodes'])} nodes, {len(roads['barriers'])} barriers and {len(roads['restrictions'])} restrictions locally.", flush=True)


if __name__ == '__main__':
    main()
