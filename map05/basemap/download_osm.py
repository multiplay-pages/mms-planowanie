"""Fetch eight bounded public OSM map extracts, then retain only map geometry.

One-time developer operation; neither the application nor its tests calls this.
No routing, geocoding, API keys, or MMS data.
"""
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
BOUNDS = {'OPO': (17.897, 50.651, 17.953, 50.688), 'KNU': (18.373, 50.207, 18.426, 50.237)}
ENDPOINT = 'https://api.openstreetmap.org/api/0.6/map?bbox='


def quadrants(bounds):
    west, south, east, north = bounds
    mid_x, mid_y = (west + east) / 2, (south + north) / 2
    return [(west, south, mid_x, mid_y), (mid_x, south, east, mid_y), (west, mid_y, mid_x, north), (mid_x, mid_y, east, north)]


def convert(documents):
    nodes, ways = {}, {}
    for root in documents:
        for node in root.findall('node'):
            nodes[node.attrib['id']] = [float(node.attrib['lon']), float(node.attrib['lat'])]
        for way in root.findall('way'):
            ways[way.attrib['id']] = way
    features = []
    for way_id, way in ways.items():
        tags = {tag.attrib['k']: tag.attrib['v'] for tag in way.findall('tag')}
        node_ids = [node.attrib['ref'] for node in way.findall('nd')]
        if len(node_ids) < 2 or any(node not in nodes for node in node_ids):
            continue
        closed = node_ids[0] == node_ids[-1] and len(node_ids) > 3
        road = tags.get('highway')
        if road in {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'pedestrian', 'service', 'track', 'path', 'footway', 'cycleway', 'steps'}:
            kind, category = 'road', road
        elif closed and (tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank'):
            kind, category = 'water', 'area'
        elif tags.get('waterway') in {'river', 'canal', 'stream'}:
            kind, category = 'water', 'line'
        elif closed and (tags.get('landuse') in {'forest', 'grass', 'meadow', 'recreation_ground'} or tags.get('leisure') == 'park' or tags.get('natural') == 'wood'):
            kind, category = 'green', 'area'
        elif tags.get('railway') == 'rail':
            kind, category = 'rail', 'line'
        else:
            continue
        features.append({'id': way_id, 'kind': kind, 'category': category, 'name': tags.get('name', ''), 'points': [nodes[node] for node in node_ids]})
    return features


def download():
    result = {'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0', 'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/', 'copyright_url': 'https://www.openstreetmap.org/copyright', 'retrieved_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'regions': {}}
    for region, bounds in BOUNDS.items():
        checkpoint = ROOT / f'{region}.json'
        if checkpoint.exists():
            result['regions'][region] = json.loads(checkpoint.read_text(encoding='utf-8'))
            print(f'{region}: reusing completed local extract', flush=True)
            continue
        documents, sources = [], []
        for index, box in enumerate(quadrants(bounds)):
            url = ENDPOINT + ','.join(str(round(number, 7)) for number in box)
            request = Request(url, headers={'User-Agent': 'MAP05-local-prototype/1.0 (bounded public geometry extract)'})
            with urlopen(request, timeout=25) as response:
                payload = response.read(20_000_000)
            root = ET.fromstring(payload)
            if root.tag != 'osm':
                raise ValueError('OSM map response expected')
            documents.append(root)
            sources.append(url)
            print(f'{region} part {index + 1}/4: {len(payload)} bytes', flush=True)
            time.sleep(1)
        features = convert(documents)
        if not any(feature['kind'] == 'road' for feature in features):
            raise ValueError('Real road geometry is required')
        result['regions'][region] = {'bounds': bounds, 'sources': sources, 'features': features}
        # Checkpoint lets a second invocation reuse a completed region.
        (ROOT / f'{region}.json').write_text(json.dumps(result['regions'][region], ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (ROOT / 'data.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Saved basemap/data.json', flush=True)


if __name__ == '__main__':
    download()
