"""Precompute local road paths between approved local points, without network.

102 single-source shortest-path searches, not thousands of external requests.
Shared road shapes are encoded once; paths refer to oriented shape IDs. Atomic
row checkpoints survive interruption. Full artifact is published only at 100%.
"""
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
from local_routing import RoadGraph, SPEEDS

ROOT = Path(__file__).resolve().parent


def encode_polyline(points):
    result, previous = [], [0, 0]
    for point in points:
        for axis, value in enumerate([point[1], point[0]]):
            current = math.floor(value * 1e5 + .5)
            delta = current - previous[axis]
            previous[axis] = current
            encoded = ~(delta << 1) if delta < 0 else delta << 1
            while encoded >= 32:
                result.append(chr((32 | (encoded & 31)) + 63))
                encoded >>= 5
            result.append(chr(encoded + 63))
    return ''.join(result)


def snapshot_cell(result):
    if result.get('status') != 'OK':
        return {'status': result.get('status', 'NO_PATH'), 'distanceM': None, 'estimatedDurationS': None, 'path': None}
    return {'status': 'OK', 'distanceM': math.ceil(result['distanceM'] * 1000) / 1000,
            'estimatedDurationS': math.ceil(result['estimatedDurationS'] * 1000) / 1000, 'path': result['path']}


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def file_sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build():
    roads_path = ROOT / 'basemap/regional-roads.json'
    roads = json.loads(roads_path.read_text(encoding='utf-8'))
    dataset = json.loads((ROOT / 'data/addresses.json').read_text(encoding='utf-8'))
    geocoding = json.loads((ROOT / 'data/uug-geocoding.json').read_text(encoding='utf-8'))
    if geocoding['datasetId'] != dataset['source']['sha256']:
        raise ValueError('Geocoding belongs to another address dataset.')
    points = {r['addressId']: r['coordinates'] for r in geocoding['records'] if r['status'] in {'MATCHED_BUILDING', 'MATCHED_BUILDING_POSTCODE_NOTE'} and r['coordinates'] is not None}
    if not points:
        raise ValueError('No known local points; no invented route anchors.')
    print(f'Preparing local road graph for {len(points)} points; no network.', flush=True)
    graph = RoadGraph(roads, points)
    print(json.dumps(graph.summary), flush=True)
    roads_sha, engine_sha, builder_sha = file_sha(roads_path), file_sha(ROOT / 'local_routing.py'), file_sha(Path(__file__))
    signature = hashlib.sha256(json.dumps([roads_sha, engine_sha, builder_sha, points], sort_keys=True).encode()).hexdigest()
    cache = ROOT / 'data/local-route-cache'
    cache.mkdir(exist_ok=True)
    routes = {}
    for index, address_id in enumerate(points):
        row_path = cache / (address_id + '.json')
        row = json.loads(row_path.read_text(encoding='utf-8')) if row_path.exists() else None
        if not row or row.get('signature') != signature:
            calculated = graph.routes_from(address_id, include_geometry=False)
            cells = {}
            for target in points:
                if address_id not in graph.address_nodes or target not in graph.address_nodes:
                    result = {'status': 'SNAP_UNCERTAIN'}
                else:
                    result = calculated[target]
                cells[target] = snapshot_cell(result)
            row = {'signature': signature, 'routes': cells}
            write_json(row_path, row)
        routes[address_id] = row['routes']
        if index == 0 or (index + 1) % 10 == 0 or index + 1 == len(points):
            print(f'Local road rows complete: {index+1}/{len(points)}', flush=True)
    result = {'schemaVersion': 1, 'datasetId': dataset['source']['sha256'],
              'source': {'provider': 'LOCAL_OSM', 'profile': 'shortest-distance', 'roadsSha256': roads_sha,
                         'engineSha256': engine_sha, 'builderSha256': builder_sha, 'publicSource': roads['source'],
                         'builtAt': datetime.now(timezone.utc).isoformat()},
              'assumptions': {'traffic': False, 'estimatedSpeedsKmh': SPEEDS, 'postedSpeedFactor': .7,
                              'snapLimitM': 150, 'geometryPrecision': 5, 'roadDistances': 'full-node-chain-spherical-meters',
                              'unsupportedRestrictions': 'conservative-road-exclusion', 'destinationAccess': 'excluded',
                              'visitManeuvers': 'not-verified', 'crewCommute': 'not-known'},
              'points': [{'addressId': key, 'coordinates': value, 'snap': graph.snaps[key]} for key, value in points.items()],
              'segments': [encode_polyline(shape) for shape in graph.shapes], 'routes': routes,
              'summary': {**graph.summary, 'totalLocatedPoints': len(points),
                          'availableDirectedPairs': sum(cell['status'] == 'OK' for source, row in routes.items() for target, cell in row.items() if source != target),
                          'totalDirectedPairs': len(points) * (len(points) - 1)}}
    write_json(ROOT / 'data/local-routes.json', result)
    labels = {address['id']: address for address in dataset['addresses']}
    lines = ['# Lokalny graf dróg i wyniki planistyczne', '',
             'Użytkownik wybrał obliczenia lokalne, bez wysyłania współrzędnych. Użytkownik polecił pozostawić 7 nieustalonych punktów bez pozycji; nie prowadzono dalszego odczytu QGIS.', '',
             'Źródło: publiczne regionalne pliki OSM/Geofabrik. Ich nazwy i kontrolne hashe są zapisane w warstwie. Dystans jest długością najkrótszej dopuszczonej drogi lokalnego grafu. Czasy są oszacowaniem na jawnych prędkościach, bez ruchu drogowego. Końcowy dojazd do posesji, manewry przy wizytach i start/powrót ekipy nie są potwierdzone. Nie jest to narzędzie nawigacyjne ani dowód wykonania rzeczywistego zlecenia.', '',
             f"Graf: {graph.summary['directedEdges']} skierowanych odcinków, {graph.summary['blockedNodes']} blokad węzłów; {graph.summary['unsupportedRestrictions']} nieobsługiwanych relacji skutkuje konserwatywnym wyłączeniem {graph.summary['conservativelyExcludedWays']} dróg, bez ignorowania zakazów.", '',
             f"Punkty przyciągnięte do dopuszczalnej drogi: {graph.summary['snappedPoints']}/{len(points)}. Dostępne skierowane pary: {result['summary']['availableDirectedPairs']}/{result['summary']['totalDirectedPairs']}. Braki pozostają jawne, nigdy jako 0 km.", '',
             f'Warstwa dróg SHA256: `{roads_sha}`; silnik SHA256: `{engine_sha}`.', '',
             '| Wiersz XLSX | Adres źródłowy | Punkt dostępu do drogi | Odległość od budynku |', '| --- | --- | --- | --- |']
    for address_id, snap in graph.snaps.items():
        address = labels[address_id]
        distance = f"{snap['distanceM']:.1f} m" if snap['distanceM'] is not None else 'nieustalona'
        lines.append(f"| {', '.join(map(str,address['sourceRows']))} | {address['label'].replace('|', '/')} | {snap['status']} | {distance} |")
    (ROOT / 'data/LOCAL-ROUTING-REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(result['summary']), flush=True)
    return result


if __name__ == '__main__':
    build()
