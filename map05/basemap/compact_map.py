"""Create a compact display-only road map; never change the routing graph.

Names and categories share dictionaries. The existing polyline5 codec rounds
display geometry to 1e-5 degrees; the full raw OSM graph remains authoritative
for every route calculation. This module reads only the public basemap file.
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent
PARENT = ROOT.parent
if str(PARENT) not in sys.path:
    sys.path.insert(0, str(PARENT))
from build_local_routes import encode_polyline


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _bounds(value):
    if not isinstance(value, (list, tuple)) or len(value) != 4 or not all(_finite_number(v) for v in value):
        raise ValueError('Invalid public map bounds.')
    west, south, east, north = value
    if not -180 <= west <= east <= 180 or not -90 <= south <= north <= 90:
        raise ValueError('Public map bounds exceed longitude/latitude limits.')
    return west, south, east, north


def _shape_bounds(points, region_bounds):
    if not isinstance(points, list) or len(points) < 2:
        raise ValueError('A compact road must have at least two points.')
    west, south, east, north = region_bounds
    minimum_lon = minimum_lat = math.inf
    maximum_lon = maximum_lat = -math.inf
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2 or not all(_finite_number(v) for v in point):
            raise ValueError('Invalid public road point.')
        lon, lat = point
        if not west <= lon <= east or not south <= lat <= north:
            raise ValueError('Road geometry falls outside recorded public map bounds.')
        minimum_lon, minimum_lat = min(minimum_lon, lon), min(minimum_lat, lat)
        maximum_lon, maximum_lat = max(maximum_lon, lon), max(maximum_lat, lat)
    return [math.floor(minimum_lon * 1e5) / 1e5, math.floor(minimum_lat * 1e5) / 1e5,
            math.ceil(maximum_lon * 1e5) / 1e5, math.ceil(maximum_lat * 1e5) / 1e5]


def compact(document, derived_from_sha256):
    """Return indexed polyline5 map tuples, preserving IDs, names and metadata."""
    if not isinstance(derived_from_sha256, str) or not re.fullmatch('[0-9a-f]{64}', derived_from_sha256):
        raise ValueError('A valid raw public map SHA256 is required.')
    if not isinstance(document, dict) or document.get('schemaVersion') != 1:
        raise ValueError('Unsupported public map schema.')
    regions = document.get('regions')
    if not isinstance(regions, dict) or set(regions) != {'PLANNER'}:
        raise ValueError('Only the recorded public PLANNER map is supported.')
    region = regions['PLANNER']
    bounds = _bounds(region.get('bounds'))
    if document.get('bounds') != region.get('bounds'):
        raise ValueError('Public map and region bounds disagree.')
    source_features = region.get('features')
    if not isinstance(source_features, list):
        raise ValueError('Missing public road features.')
    categories, names, features = [], [], []
    category_indices, name_indices, identities = {}, {}, set()
    for feature in source_features:
        if not isinstance(feature, dict) or feature.get('kind') != 'road':
            raise ValueError('Compact map accepts road features only.')
        identity = feature.get('id')
        category, name = feature.get('category'), feature.get('name')
        if not isinstance(identity, str) or not identity or identity in identities:
            raise ValueError('Missing, invalid or duplicate road ID.')
        if not isinstance(category, str) or not category or not isinstance(name, str):
            raise ValueError('Invalid road category or name.')
        identities.add(identity)
        points = feature.get('points')
        shape_bounds = _shape_bounds(points, bounds)
        if category not in category_indices:
            category_indices[category] = len(categories)
            categories.append(category)
        if name not in name_indices:
            name_indices[name] = len(names)
            names.append(name)
        features.append([identity, category_indices[category], name_indices[name], encode_polyline(points), shape_bounds])
    return {**{key: value for key, value in document.items() if key != 'regions'},
            'derivedFromSha256': derived_from_sha256,
            'regions': {'PLANNER': {'bounds': list(bounds), 'encoding': 'polyline5-indexed',
                                    'categories': categories, 'names': names, 'features': features}}}


def build(source_path=ROOT / 'planner-data.json', output_path=ROOT / 'planner-compact.json'):
    """Read public geometry, checksum exact input bytes, atomically save a map."""
    source_path, output_path = Path(source_path), Path(output_path)
    if source_path.resolve() == output_path.resolve():
        raise ValueError('Compact map output must be separate from full raw geometry.')
    with source_path.open('rb') as stream:
        fingerprint = hashlib.file_digest(stream, 'sha256').hexdigest()
        stream.seek(0)
        document = json.load(stream)
    result = compact(document, fingerprint)
    temporary = output_path.with_suffix(output_path.suffix + '.tmp')
    with temporary.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(result, stream, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        stream.write('\n')
    os.replace(temporary, output_path)
    region = result['regions']['PLANNER']
    return {'featureCount': len(region['features']), 'categoryCount': len(region['categories']),
            'nameCount': len(region['names']), 'inputBytes': source_path.stat().st_size,
            'outputBytes': output_path.stat().st_size, 'derivedFromSha256': fingerprint}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'planner-data.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'planner-compact.json')
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output), sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
