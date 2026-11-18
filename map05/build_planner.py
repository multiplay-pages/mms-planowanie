"""Bundle the local address planner. No source workbook writes or network calls."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
from prepare_assets import prepare_assets

ROOT = Path(__file__).resolve().parent


def token(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode('ascii') + "'"


def maplibre_bundle():
    """Inline the vendored, hash-checked MapLibre build for the single-file planner."""
    manifest = json.loads((ROOT / 'vendor' / 'maplibre-gl' / 'MANIFEST.json').read_text(encoding='utf-8'))
    for name, meta in manifest['files'].items():
        if hashlib.sha256((ROOT / 'vendor' / 'maplibre-gl' / name).read_bytes()).hexdigest() != meta['sha256']:
            raise ValueError(f'Vendored MapLibre file changed: {name}')

    def read(name):
        text = (ROOT / 'vendor' / 'maplibre-gl' / name).read_text(encoding='utf-8')
        return re.sub(r'\n?(//# sourceMappingURL=[^\n]*|/\*# sourceMappingURL=[^*]*\*/)\s*$', '\n', text)

    module = read('maplibre-gl.mjs')
    match = re.search(r'export\{([^}]*)\};?\s*$', module)
    if not match:
        raise ValueError('Unexpected MapLibre module format.')
    pairs = []
    for item in match.group(1).split(','):
        local, _, exported = item.strip().partition(' as ')
        pairs.append(f'{json.dumps(exported or local)}:{local}')
    # The module exposes the same API object the served view imports, then signals readiness.
    module = module[:match.start()] + 'globalThis.maplibregl=Object.freeze({' + ','.join(pairs) + '});globalThis.dispatchEvent(new Event("maplibre-ready"));\n'
    worker = read('maplibre-gl-worker.mjs')
    for text in (module, worker):
        if re.search(r'</script', text, flags=re.IGNORECASE):
            raise ValueError('MapLibre source contains a closing script tag.')
    licenses = '\n'.join([(ROOT / 'vendor' / 'maplibre-gl' / 'LICENSE.txt').read_text(encoding='utf-8'), (ROOT / 'vendor' / 'maplibre-gl' / 'THIRD-PARTY-LICENSES.txt').read_text(encoding='utf-8')])
    if re.search(r'</script', licenses, flags=re.IGNORECASE):
        raise ValueError('License text contains a closing script tag.')
    return {'module': module, 'worker': worker, 'css': read('maplibre-gl.css'), 'licenses': licenses}


def strip_modules(names):
    """Concatenates ES modules into one classic script body: exports and imports removed."""
    code = []
    for name in names:
        part = (ROOT / name).read_text(encoding='utf-8')
        part = re.sub(r'^export (function|const|class|async function) ', r'\1 ', part, flags=re.MULTILINE)
        code.append(re.sub(r'^import[^\n]*\n', '', part, flags=re.MULTILINE))
    return '\n'.join(code)


def gzip_base64(text):
    """Deterministic gzip (mtime 0, level 9) of a JSON text, base64-encoded for an inline script block."""
    return base64.b64encode(gzip.compress(text.encode('utf-8'), compresslevel=9, mtime=0)).decode('ascii')


def build(rich=False):
    """Builds the offline artifact. rich=True also embeds basemap/map-pack.pmtiles (MAP-08, optional, much larger)."""
    prepare_assets()
    dataset = json.loads((ROOT / 'data' / 'addresses.json').read_text(encoding='utf-8'))
    if dataset.get('schemaVersion') != 1 or not dataset.get('addresses'):
        raise ValueError('Missing or invalid normalized address dataset.')
    source = ROOT.parent / dataset['source']['filename']
    if hashlib.sha256(source.read_bytes()).hexdigest() != dataset['source']['sha256']:
        raise ValueError('Workbook has changed. Review and rerun the local importer first.')
    geocoding = json.loads((ROOT / 'data' / 'uug-geocoding.json').read_text(encoding='utf-8'))
    if geocoding.get('datasetId') != dataset['source']['sha256']:
        raise ValueError('Coordinate layer belongs to a different address dataset.')
    coordinate_source = geocoding['source']
    if coordinate_source.get('provider') != 'GUGIK_UUG' or coordinate_source.get('srid') != 4326 or coordinate_source.get('method') != 'GetAddress' or coordinate_source.get('url') != 'https://services.gugik.gov.pl/uug/' or coordinate_source.get('filename') != 'uug-responses.json':
        raise ValueError('Unexpected coordinate provider or coordinate system.')
    if hashlib.sha256((ROOT / 'data' / coordinate_source['filename']).read_bytes()).hexdigest() != coordinate_source['sha256']:
        raise ValueError('GUGiK replies have changed. Review and rerun the local UUG importer first.')
    basemap = json.loads((ROOT / 'basemap' / 'planner-compact.json').read_text(encoding='utf-8'))
    routing = json.loads((ROOT / 'data' / 'local-routes.json').read_text(encoding='utf-8'))
    if routing.get('datasetId') != dataset['source']['sha256'] or routing['source']['provider'] != 'LOCAL_OSM':
        raise ValueError('Local routes belong to another dataset or provider.')
    with (ROOT / 'basemap' / 'regional-roads.json').open('rb') as stream:
        road_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    engine_sha = hashlib.sha256((ROOT / 'local_routing.py').read_bytes()).hexdigest()
    if routing['source']['roadsSha256'] != road_sha or routing['source']['engineSha256'] != engine_sha:
        raise ValueError('Road snapshot or engine changed. Rebuild local routes first.')
    vendor = maplibre_bundle()
    css = vendor['css'] + '\n' + (ROOT / 'planner.css').read_text(encoding='utf-8')
    body = strip_modules(['locations.mjs', 'routes.mjs', 'planner-model.mjs', 'optimizer.mjs', 'map.mjs', 'planner-map.mjs', 'operational-map.mjs', 'embedded-data.mjs', 'road-tiles.mjs', 'road-tile-client.mjs', 'pmtiles-reader.mjs', 'map-style.mjs', 'maplibre-view.mjs', 'planner.mjs'])
    # The road-tile Web Worker is a classic script started from a blob: URL (works from file://).
    tile_worker = '(function(){\n"use strict";\n' + strip_modules(['routes.mjs', 'embedded-data.mjs', 'road-tiles.mjs', 'road-tile-worker.mjs']) + '\n})();'
    script = '(function(){\n"use strict";\n' + body + '\n})();'
    script = re.sub(r'</script', r'<\\/script', script, flags=re.IGNORECASE)
    tile_worker = re.sub(r'</script', r'<\\/script', tile_worker, flags=re.IGNORECASE)
    address_data = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    map_data = gzip_base64(json.dumps(basemap, ensure_ascii=False, separators=(',', ':')))
    geocoding_data = json.dumps(geocoding, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    routing_data = gzip_base64(json.dumps(routing, ensure_ascii=False, separators=(',', ':')))
    pack_data = base64.b64encode((ROOT / 'basemap' / 'map-pack.pmtiles').read_bytes()).decode('ascii') if rich else None
    hashes = ' '.join(map(token, [script, address_data, map_data, geocoding_data, routing_data, tile_worker, vendor['module'], vendor['worker'], vendor['licenses']] + ([pack_data] if rich else [])))
    # MapLibre in an opaque (file://) origin reads its worker source back with fetch(blob:) and starts it
    # from a data: URL. Only in-memory blob:/data: are allowed; every network scheme stays blocked.
    csp = f"default-src 'none'; connect-src blob:; script-src {hashes}; worker-src blob: data:; style-src {token(css)}; img-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'"
    html = (ROOT / 'planner.html').read_text(encoding='utf-8')
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', f'<meta http-equiv="Content-Security-Policy" content="{csp}">', html)
    html = html.replace('  <link rel="stylesheet" href="./vendor/maplibre-gl/maplibre-gl.css">\n', '')
    html = html.replace('<link rel="stylesheet" href="./planner.css">', '<style>' + css + '</style>')
    favicon = base64.b64encode((ROOT / 'favicon.svg').read_bytes()).decode('ascii')
    html = html.replace('href="./favicon.svg"', f'href="data:image/svg+xml;base64,{favicon}"')
    html = html.replace('  <script type="module" src="./planner.mjs"></script>\n', '')
    html = html.replace('href="./planner.html"', 'href="./planner-offline.html"').replace('href="./index.html"', 'href="./offline.html"')
    html = html.replace('</body>', '<script id="address-data" type="application/json">' + address_data + '</script>\n<script id="basemap-data" type="text/plain" data-encoding="gzip-base64">' + map_data + '</script>\n<script id="geocoding-data" type="application/json">' + geocoding_data + '</script>\n<script id="routing-data" type="text/plain" data-encoding="gzip-base64">' + routing_data + '</script>\n<script id="road-tile-worker-source" type="text/plain">' + tile_worker + '</script>\n' + (('<script id="map-pack-data" type="text/plain" data-encoding="base64">' + pack_data + '</script>\n') if rich else '') + '<script id="maplibre-worker-source" type="text/plain">' + vendor['worker'] + '</script>\n<script id="third-party-licenses" type="text/plain">' + vendor['licenses'] + '</script>\n<script>' + script + '</script>\n<script id="maplibre-bundle" type="module">' + vendor['module'] + '</script>\n</body>')
    name = 'planner-offline-rich.html' if rich else 'planner-offline.html'
    (ROOT / name).write_text(html, encoding='utf-8', newline='\n')
    print(f'Built map05/{name} ({len(html.encode("utf-8"))} bytes), {len(dataset["addresses"])} addresses; matches: {geocoding["summary"]["matched"]}, review: {geocoding["summary"]["review"]}; source SHA256: {dataset["source"]["sha256"]}')
    return html


if __name__ == '__main__':
    import sys
    build(rich='--rich' in sys.argv)
