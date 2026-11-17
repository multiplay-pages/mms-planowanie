"""Bundle the local address planner. No source workbook writes or network calls."""
import base64
import hashlib
import json
from pathlib import Path
import re
from prepare_assets import prepare_assets

ROOT = Path(__file__).resolve().parent


def token(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode('ascii') + "'"


def build():
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
    css = (ROOT / 'planner.css').read_text(encoding='utf-8')
    code = []
    for name in ['locations.mjs', 'routes.mjs', 'planner-model.mjs', 'map.mjs', 'planner-map.mjs', 'planner.mjs']:
        part = (ROOT / name).read_text(encoding='utf-8').replace('export function ', 'function ')
        code.append(re.sub(r'^import[^\n]*\n', '', part, flags=re.MULTILINE))
    script = '(function(){\n"use strict";\n' + '\n'.join(code) + '\n})();'
    script = re.sub(r'</script', r'<\\/script', script, flags=re.IGNORECASE)
    address_data = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    map_data = json.dumps(basemap, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    geocoding_data = json.dumps(geocoding, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    routing_data = json.dumps(routing, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    hashes = ' '.join(map(token, [script, address_data, map_data, geocoding_data, routing_data]))
    csp = f"default-src 'none'; connect-src 'none'; script-src {hashes}; style-src {token(css)}; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"
    html = (ROOT / 'planner.html').read_text(encoding='utf-8')
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', f'<meta http-equiv="Content-Security-Policy" content="{csp}">', html)
    html = html.replace('<link rel="stylesheet" href="./planner.css">', '<style>' + css + '</style>')
    favicon = base64.b64encode((ROOT / 'favicon.svg').read_bytes()).decode('ascii')
    html = html.replace('href="./favicon.svg"', f'href="data:image/svg+xml;base64,{favicon}"')
    html = html.replace('  <script type="module" src="./planner.mjs"></script>\n', '')
    html = html.replace('href="./planner.html"', 'href="./planner-offline.html"').replace('href="./index.html"', 'href="./offline.html"')
    html = html.replace('</body>', '<script id="address-data" type="application/json">' + address_data + '</script>\n<script id="basemap-data" type="application/json">' + map_data + '</script>\n<script id="geocoding-data" type="application/json">' + geocoding_data + '</script>\n<script id="routing-data" type="application/json">' + routing_data + '</script>\n<script>' + script + '</script>\n</body>')
    (ROOT / 'planner-offline.html').write_text(html, encoding='utf-8', newline='\n')
    print(f'Built map05/planner-offline.html ({len(html.encode("utf-8"))} bytes), {len(dataset["addresses"])} addresses; matches: {geocoding["summary"]["matched"]}, review: {geocoding["summary"]["review"]}; source SHA256: {dataset["source"]["sha256"]}')
    return html


if __name__ == '__main__':
    build()
