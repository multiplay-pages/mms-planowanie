"""Build the MAP-08 rich local map pack (PMTiles v3, MVT) from data already on disk.

Inputs (no network, no geocoding, no routing change):
  * basemap/planner-compact.json     OSM roads with names and classes (already published)
  * basemap/public-pbf/*.osm.pbf     cached Geofabrik regional extracts (ODbL), only if present
  * data/uug-geocoding.json          coordinates of the planner's addresses -> where building detail is drawn

Output: basemap/map-pack.pmtiles + map-pack.manifest.json. The pack is a *presentation* layer only;
distances and routes still come from data/local-routes.json.

Layers: roads (class/name/rank), places (name/class), building, landuse (forest/park/residential/industrial/cemetery),
water (lakes, rivers), rail. Buildings are limited to a radius around the planner's addresses to keep the
pack small; everything else covers the full planner rectangle. Multipolygon relations are not assembled
(closed ways only) - see docs/MAP08-MAPA-OPERACYJNA.md.
"""
import argparse
import array
import hashlib
import json
import math
import sys
import time
from pathlib import Path

try:
    from .osm_pbf import iter_elements
    from .pmtiles_io import write_pmtiles
    from .vector_tiles import BUFFER, EXTENT, Layer, clip_line, clip_polygon, encode_tile, ring_area, world_xy
except ImportError:  # direct execution
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from osm_pbf import iter_elements
    from pmtiles_io import write_pmtiles
    from vector_tiles import BUFFER, EXTENT, Layer, clip_line, clip_polygon, encode_tile, ring_area, world_xy

ROOT = Path(__file__).resolve().parent
PBF_DIR = ROOT / 'public-pbf'
REGIONS = ('opolskie', 'slaskie', 'dolnoslaskie', 'wielkopolskie')
ATTRIBUTION = '© OpenStreetMap contributors (ODbL 1.0)'
ROAD_RANK = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3,
             'tertiary': 4, 'tertiary_link': 4, 'residential': 5, 'unclassified': 5, 'living_street': 6, 'service': 6, 'pedestrian': 6, 'track': 7}
PLACE_MINZOOM = {'city': 5, 'town': 8, 'village': 11, 'suburb': 11, 'quarter': 13, 'hamlet': 13, 'neighbourhood': 14}
LANDUSE = {('landuse', 'forest'): 'forest', ('natural', 'wood'): 'forest', ('leisure', 'park'): 'park', ('leisure', 'garden'): 'park',
           ('landuse', 'recreation_ground'): 'park', ('landuse', 'village_green'): 'park', ('landuse', 'residential'): 'residential',
           ('landuse', 'industrial'): 'industrial', ('landuse', 'commercial'): 'industrial', ('landuse', 'retail'): 'industrial',
           ('landuse', 'cemetery'): 'cemetery', ('amenity', 'grave_yard'): 'cemetery'}
LANDUSE_MINZOOM = {'forest': 9, 'park': 12, 'residential': 11, 'industrial': 11, 'cemetery': 13}
WATER = {('natural', 'water'), ('landuse', 'reservoir'), ('landuse', 'basin'), ('waterway', 'riverbank')}


def road_max_rank(z):
    return 2 if z <= 8 else 3 if z <= 10 else 4 if z <= 11 else 5 if z <= 13 else 7


def decode_polyline5(text):
    lat = lon = index = 0
    points = []
    while index < len(text):
        for axis in (0, 1):
            result = shift = 0
            while True:
                byte = ord(text[index]) - 63
                index += 1
                result |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if axis == 0:
                lat += delta
            else:
                lon += delta
        points.append((lon / 1e5, lat / 1e5))
    return points


class Tiler:
    def __init__(self):
        self.tiles = {}  # (z, x, y) -> {layer: Layer}
        self.counts = {}

    def _layer(self, z, x, y, name):
        layers = self.tiles.setdefault((z, x, y), {})
        layer = layers.get(name)
        if layer is None:
            layer = layers[name] = Layer(name)
        return layer

    @staticmethod
    def _range(points, z, margin=BUFFER / EXTENT):
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        n = 1 << z
        return (max(0, math.floor(min(xs) - margin)), min(n - 1, math.floor(max(xs) + margin)),
                max(0, math.floor(min(ys) - margin)), min(n - 1, math.floor(max(ys) + margin)))

    def line(self, z, layer, points, props, identifier=None):
        world = [world_xy(lon, lat, z) for lon, lat in points]
        x0, x1, y0, y1 = self._range(world, z)
        added = 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                local = [((px - x) * EXTENT, (py - y) * EXTENT) for px, py in world]
                parts = clip_line(local)
                if parts and self._layer(z, x, y, layer).add(identifier, 2, parts, props):
                    added += 1
        if added:
            self.counts[(layer, z)] = self.counts.get((layer, z), 0) + 1

    def polygon(self, z, layer, ring, props, identifier=None, min_units=0):
        world = [world_xy(lon, lat, z) for lon, lat in ring]
        xs = [p[0] for p in world]
        ys = [p[1] for p in world]
        if max(max(xs) - min(xs), max(ys) - min(ys)) * EXTENT < min_units:
            return
        x0, x1, y0, y1 = self._range(world, z)
        added = 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                clipped = clip_polygon([((px - x) * EXTENT, (py - y) * EXTENT) for px, py in world])
                if not clipped:
                    continue
                area = ring_area(clipped)
                if abs(area) < 1:
                    continue
                if area < 0:  # MVT: exterior rings have positive shoelace area in tile coordinates
                    clipped.reverse()
                if self._layer(z, x, y, layer).add(identifier, 3, [clipped], props):
                    added += 1
        if added:
            self.counts[(layer, z)] = self.counts.get((layer, z), 0) + 1

    def point(self, z, layer, lon, lat, props):
        px, py = world_xy(lon, lat, z)
        x, y = math.floor(px), math.floor(py)
        if self._layer(z, x, y, layer).add(None, 1, [[(round((px - x) * EXTENT), round((py - y) * EXTENT))]], props):
            self.counts[(layer, z)] = self.counts.get((layer, z), 0) + 1


def load_roads(path):
    full = json.loads(Path(path).read_text(encoding='utf-8'))
    document = full['regions']['PLANNER']
    if document.get('encoding') != 'polyline5-indexed':
        raise ValueError('Unsupported compact road format')
    region = document.get('bounds')
    roads = []
    for identifier, category, name, encoded, bounds in document['features']:
        cat = document['categories'][category]
        roads.append((int(identifier) if str(identifier).isdigit() else 0, ROAD_RANK.get(cat, 7), cat, document['names'][name] or '', encoded, bounds))
    return region, roads


def load_coverage(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    points = []
    for record in data.get('records', []):
        coordinates = record.get('coordinates')
        if coordinates and len(coordinates) == 2:
            points.append((coordinates[0], coordinates[1]))
    return points


class Coverage:
    """Radius test around public planner points; stores no more than a hashed grid of them."""

    def __init__(self, points, radius_km):
        self.radius = radius_km
        self.cell = 0.05
        self.grid = {}
        for lon, lat in points:
            self.grid.setdefault((math.floor(lon / self.cell), math.floor(lat / self.cell)), []).append((lon, lat))
        self.size = len(points)

    def near(self, lon, lat):
        kx = math.cos(math.radians(lat)) * 111.32
        # A degree of longitude is shorter than a degree of latitude, so the search spans more columns than rows.
        reach_y = math.ceil(self.radius / (110.57 * self.cell)) + 1
        reach_x = math.ceil(self.radius / (math.cos(math.radians(min(89.0, abs(lat) + self.radius / 110.0))) * 111.32 * self.cell)) + 1
        cx, cy = math.floor(lon / self.cell), math.floor(lat / self.cell)
        for gx in range(cx - reach_x, cx + reach_x + 1):
            for gy in range(cy - reach_y, cy + reach_y + 1):
                for plon, plat in self.grid.get((gx, gy), ()):
                    if math.hypot((lon - plon) * kx, (lat - plat) * 110.57) <= self.radius:
                        return True
        return False


def read_pbf_features(path, bounds, coverage, log):
    """Two sequential passes over one regional file: ways of interest, then only the nodes they need."""
    west, south, east, north = bounds
    ways, needed = {}, set()
    for element in iter_elements(path, types=('way',)):
        tags = element['tags']
        kind = None
        if tags.get('building') not in (None, 'no'):
            kind = ('building', None)
        elif ('natural', tags.get('natural')) in WATER or ('landuse', tags.get('landuse')) in WATER or tags.get('waterway') == 'riverbank':
            kind = ('water', 'lake')
        elif tags.get('waterway') in ('river', 'canal'):
            kind = ('waterline', tags['waterway'])
        elif tags.get('railway') == 'rail' and tags.get('service') is None:
            kind = ('rail', 'rail')
        else:
            for key in ('landuse', 'natural', 'leisure', 'amenity'):
                value = LANDUSE.get((key, tags.get(key)))
                if value:
                    kind = ('landuse', value)
                    break
        if not kind or len(element['nodes']) < 2:
            continue
        ways[element['id']] = (kind, element['nodes'])
        if kind[0] != 'building':
            needed.update(element['nodes'])
        else:
            needed.update(element['nodes'])
    nodes, places = {}, []
    needed = frozenset(needed)
    for element in iter_elements(path, types=('node',), node_ids=needed):
        nodes[element['id']] = (element['lon'], element['lat'])
    for element in iter_elements(path, types=('node',)):
        place = element['tags'].get('place')
        name = element['tags'].get('name')
        if place in PLACE_MINZOOM and name and west <= element['lon'] <= east and south <= element['lat'] <= north:
            places.append((element['id'], name, place, element['lon'], element['lat']))
    log(f'  {path.name}: {len(ways)} ways, {len(nodes)} nodes, {len(places)} places')
    return ways, nodes, places


def build(args, log=print):
    started = time.time()
    compact = ROOT / 'planner-compact.json'
    region_bounds, roads = load_roads(compact)
    bounds = args.bounds or region_bounds
    west, south, east, north = bounds
    coverage = Coverage(load_coverage(ROOT.parent / 'data' / 'uug-geocoding.json'), args.detail_radius_km)
    tiler = Tiler()
    log(f'roads: {len(roads)}; coverage points: {coverage.size}, detail radius {args.detail_radius_km} km; zooms {args.min_zoom}-{args.max_zoom}')
    for z in range(args.min_zoom, args.max_zoom + 1):
        limit = road_max_rank(z)
        for identifier, rank, category, name, encoded, rbounds in roads:
            if rank > limit or rbounds[2] < west or rbounds[0] > east or rbounds[3] < south or rbounds[1] > north:
                continue
            tiler.line(z, 'roads', decode_polyline5(encoded), {'class': category, 'rank': rank, 'name': name}, identifier)
        log(f'  roads z{z} done ({time.time() - started:.0f}s)')
    seen_ways, seen_places = set(), set()
    pbfs = [PBF_DIR / f'{name}-latest.osm.pbf' for name in args.regions]
    pbfs = [path for path in pbfs if path.exists()]
    if not pbfs:
        log('No cached PBF files: pack contains roads only.')
    for path in pbfs:
        ways, nodes, places = read_pbf_features(path, bounds, coverage, log)
        for identifier, name, place, lon, lat in places:
            if identifier in seen_places:
                continue
            seen_places.add(identifier)
            for z in range(max(args.min_zoom, PLACE_MINZOOM[place]), args.max_zoom + 1):
                tiler.point(z, 'places', lon, lat, {'name': name, 'class': place})
        for identifier, (kind, nodelist) in sorted(ways.items()):
            if identifier in seen_ways:
                continue
            ring = []
            for ref in nodelist:
                point = nodes.get(ref)
                if point is None:
                    ring = None
                    break
                ring.append(point)
            if not ring:
                continue
            lons, lats = [p[0] for p in ring], [p[1] for p in ring]
            clon, clat = (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2
            if not (west <= clon <= east and south <= clat <= north):
                continue
            layer, value = kind
            closed = ring[0] == ring[-1]
            if layer == 'building':
                if not closed or len(ring) < 4 or not coverage.near(clon, clat):
                    continue
                seen_ways.add(identifier)
                for z in range(max(args.min_zoom, 14), args.max_zoom + 1):
                    tiler.polygon(z, 'building', ring[:-1], {}, None)
            elif layer in ('landuse', 'water'):
                if not closed or len(ring) < 4:
                    continue
                seen_ways.add(identifier)
                minzoom = LANDUSE_MINZOOM.get(value, 8) if layer == 'landuse' else 8
                for z in range(max(args.min_zoom, minzoom), args.max_zoom + 1):
                    units = 0 if z >= 14 else 6 if z >= 12 else 14
                    tiler.polygon(z, layer, ring[:-1], {'class': value} if layer == 'landuse' else {}, None, min_units=units)
            else:  # waterline / rail
                seen_ways.add(identifier)
                minzoom = 9 if (layer == 'rail' or value == 'river') else 12
                for z in range(max(args.min_zoom, minzoom), args.max_zoom + 1):
                    tiler.line(z, 'waterway' if layer == 'waterline' else 'rail', ring, {'class': value})
        log(f'  after {path.name}: {len(tiler.tiles)} tiles ({time.time() - started:.0f}s)')
        del ways, nodes
    encoded = {}
    for key, layers in tiler.tiles.items():
        data = encode_tile(layers.values())
        if data:
            encoded[key] = data
    metadata = {'name': 'MMS Planowanie map pack', 'format': 'pbf', 'type': 'baselayer', 'attribution': ATTRIBUTION, 'license': 'ODbL-1.0',
                'copyright_url': 'https://www.openstreetmap.org/copyright', 'schema': 'mms-map-pack-1',
                'vector_layers': [{'id': name, 'minzoom': args.min_zoom, 'maxzoom': args.max_zoom} for name in ('roads', 'places', 'building', 'landuse', 'water', 'waterway', 'rail')],
                'minzoom': args.min_zoom, 'maxzoom': args.max_zoom, 'bounds': list(bounds)}
    center = ((west + east) / 2, (south + north) / 2, min(max(args.min_zoom + 3, 8), args.max_zoom))
    summary = write_pmtiles(args.out, encoded, min_zoom=args.min_zoom, max_zoom=args.max_zoom, bounds=bounds, center=center, metadata=metadata)
    digest = hashlib.sha256(Path(args.out).read_bytes()).hexdigest()
    features = {}
    for (layer, z), count in sorted(tiler.counts.items()):
        features.setdefault(layer, {})[str(z)] = count
    manifest = {'schema': 'mms-map-pack-1', 'file': Path(args.out).name, 'bytes': summary['bytes'], 'sha256': digest, 'tiles': summary['tiles'], 'uniqueTiles': summary['uniqueTiles'],
                'minZoom': args.min_zoom, 'maxZoom': args.max_zoom, 'bounds': list(bounds), 'detailRadiusKm': args.detail_radius_km, 'coveragePoints': coverage.size,
                'sources': {'roads': 'basemap/planner-compact.json', 'regions': [p.name for p in pbfs]}, 'attribution': ATTRIBUTION, 'license': 'ODbL-1.0',
                'features': features, 'buildSeconds': round(time.time() - started, 1)}
    Path(args.out).with_suffix('.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    log(f'wrote {args.out}: {summary["bytes"] / 1e6:.1f} MB, {summary["tiles"]} tiles, sha256 {digest[:12]}')
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--out', default=str(ROOT / 'map-pack.pmtiles'))
    parser.add_argument('--min-zoom', type=int, default=5)
    parser.add_argument('--max-zoom', type=int, default=14)
    parser.add_argument('--detail-radius-km', type=float, default=3.0)
    parser.add_argument('--regions', nargs='*', default=list(REGIONS))
    parser.add_argument('--bounds', type=float, nargs=4, metavar=('W', 'S', 'E', 'N'))
    build(parser.parse_args(argv), log=lambda text: print(text, flush=True))


if __name__ == '__main__':
    main()
