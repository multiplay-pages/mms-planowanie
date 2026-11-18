"""Exercise actual HTTP handler and offline artifact without network access."""
import base64
import gzip
import hashlib
from html.parser import HTMLParser
import importlib.util
import io
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('map05_serve', ROOT / 'serve.py')
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)


class LocalConnection:
    def __init__(self, request):
        self.input = io.BytesIO(request)
        self.output = io.BytesIO()

    def makefile(self, *args, **kwargs):
        return self.input

    def sendall(self, data):
        self.output.write(data)


class QuietHandler(serve.Handler):
    def log_message(self, *args):
        pass


def request(path, method='GET'):
    connection = LocalConnection(f'{method} {path} HTTP/1.0\r\nHost: localhost\r\n\r\n'.encode('ascii'))
    QuietHandler(connection, ('127.0.0.1', 1), object())
    headers, body = connection.output.getvalue().split(b'\r\n\r\n', 1)
    return headers.decode('ascii'), body


class ArtifactParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csp = ''
        self.active = None
        self.inline = []
        self.external_assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('http-equiv') == 'Content-Security-Policy':
            self.csp = attrs['content']
        if tag in ('script', 'style'):
            self.active = [tag, attrs, '']
        if tag == 'script' and attrs.get('src'):
            self.external_assets.append(attrs['src'])
        if tag == 'link' and not attrs.get('href', '').startswith('data:'):
            self.external_assets.append(attrs.get('href'))

    def handle_data(self, data):
        if self.active:
            self.active[2] += data

    def handle_endtag(self, tag):
        if self.active and self.active[0] == tag:
            self.inline.append(self.active)
            self.active = None


def csp_directives(csp):
    result = {}
    for part in csp.split(';'):
        tokens = part.split()
        if tokens:
            result[tokens[0]] = tokens[1:]
    return result


class DeliveryTests(unittest.TestCase):
    def tearDown(self):
        serve.TILE_ORIGINS[:] = []

    def test_tile_origins_are_opt_in_strict_and_applied_to_header_and_meta(self):
        headers, body = request('/')
        self.assertNotIn('mms-tile-origins', body.decode('utf-8'))
        self.assertEqual(csp_directives(headers.split('Content-Security-Policy: ')[1].split('\r\n')[0])['connect-src'], ["'self'"])
        for bad in ['http://example.com', 'https://example.com/path', 'https://user@example.com', 'https://example.com?x=1', 'ftp://example.com', '*', 'https://',
                    'https://tiles.example" data-review="1', 'https://tiles.example;report-uri', 'https://tiles.example:invalid', 'https://tiles.example:99999', 'https://u:p@tiles.example']:
            with self.assertRaises(Exception):
                serve.valid_origin(bad)
        origin = serve.valid_origin('https://mapy.geoportal.gov.pl')
        self.assertEqual(origin, 'https://mapy.geoportal.gov.pl')
        self.assertEqual(serve.valid_origin('http://127.0.0.1:8791'), 'http://127.0.0.1:8791')
        serve.TILE_ORIGINS[:] = [origin]
        headers, body = request('/')
        header_csp = csp_directives(headers.split('Content-Security-Policy: ')[1].split('\r\n')[0])
        self.assertEqual(header_csp['connect-src'], ["'self'", origin])
        html = body.decode('utf-8')
        meta_csp = csp_directives(html.split('http-equiv="Content-Security-Policy" content="')[1].split('"')[0])
        self.assertEqual(meta_csp['connect-src'], ["'self'", origin])
        self.assertIn(origin, meta_csp['img-src'])
        self.assertIn(f'<meta name="mms-tile-origins" content="{origin}">', html)
        self.assertEqual(request('/data/addresses.json')[1], (ROOT / 'data/addresses.json').read_bytes())

    def test_assets_and_exact_fixture_served_with_correct_types(self):
        for path, content_type in [('/', 'text/html'), ('/styles.css', 'text/css'), ('/app.mjs', 'text/javascript'), ('/model.mjs', 'text/javascript'), ('/map.mjs', 'text/javascript'), ('/basemap/data.json', 'application/json'), ('/favicon.svg', 'image/svg+xml'), ('/map04/fixtures.json', 'application/json'), ('/planner.html', 'text/html'), ('/planner.css', 'text/css'), ('/planner.mjs', 'text/javascript'), ('/planner-model.mjs', 'text/javascript'), ('/locations.mjs', 'text/javascript'), ('/routes.mjs', 'text/javascript'), ('/planner-map.mjs', 'text/javascript'), ('/data/addresses.json', 'application/json'), ('/data/geocoding.json', 'application/json'), ('/data/uug-geocoding.json', 'application/json'), ('/data/local-routes.json', 'application/json'), ('/basemap/planner-compact.json', 'application/json'), ('/operational-map.mjs', 'text/javascript'), ('/road-tiles.mjs', 'text/javascript'), ('/road-tile-worker.mjs', 'text/javascript'), ('/road-tile-client.mjs', 'text/javascript'), ('/embedded-data.mjs', 'text/javascript'), ('/maplibre-view.mjs', 'text/javascript'), ('/vendor/maplibre-gl/maplibre-gl.mjs', 'text/javascript'), ('/vendor/maplibre-gl/maplibre-gl-worker.mjs', 'text/javascript'), ('/vendor/maplibre-gl/maplibre-gl.css', 'text/css')]:
            headers, body = request(path)
            self.assertIn('200 OK', headers)
            self.assertIn(content_type, headers)
            self.assertTrue(body)
            self.assertIn("connect-src 'self'", headers)
        self.assertEqual(request('/map04/fixtures.json')[1], (ROOT.parent / 'map04/fixtures.json').read_bytes())
        self.assertEqual(request('/basemap/data.json')[1], (ROOT / 'basemap/data.json').read_bytes())
        self.assertEqual(request('/', 'HEAD')[1], b'')
        # The served HTML is byte-exact except for the server-provided, local
        # optional-pack availability indicator. No remote URLs or addresses leak.
        served_html = request('/')[1]
        pack_status = 'available' if (ROOT / 'basemap/map-pack.pmtiles').is_file() else 'unavailable'
        pack_meta = f'  <meta name="mms-map-pack-status" content="{pack_status}">\n'.encode('ascii')
        self.assertIn(pack_meta, served_html)
        self.assertEqual(served_html.replace(pack_meta, b''), (ROOT / 'planner.html').read_bytes())
        self.assertEqual(request('/data/addresses.json')[1], (ROOT / 'data/addresses.json').read_bytes())
        for name in ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']:
            self.assertEqual(request('/vendor/maplibre-gl/' + name)[1], (ROOT / 'vendor/maplibre-gl' / name).read_bytes())
        # The worker URL MapLibre derives carries a version query; the path lookup ignores it.
        self.assertIn('200 OK', request('/vendor/maplibre-gl/maplibre-gl-worker.mjs?v=6.19.0')[0])

    def test_vendored_maplibre_matches_manifest_and_keeps_license(self):
        manifest = json.loads((ROOT / 'vendor/maplibre-gl/MANIFEST.json').read_text(encoding='utf-8'))
        self.assertEqual((manifest['package'], manifest['version'], manifest['license']), ('maplibre-gl', '6.19.0', 'BSD-3-Clause'))
        self.assertEqual(set(manifest['files']), {'maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css', 'LICENSE.txt', 'THIRD-PARTY-LICENSES.txt'})
        for name, meta in manifest['files'].items():
            data = (ROOT / 'vendor/maplibre-gl' / name).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), meta['sha256'], name)
        self.assertIn('BSD', (ROOT / 'vendor/maplibre-gl/LICENSE.txt').read_text(encoding='utf-8'))
        licenses = (ROOT / 'vendor/maplibre-gl/THIRD-PARTY-LICENSES.txt').read_text(encoding='utf-8')
        notices = (ROOT / 'vendor/maplibre-gl/THIRD-PARTY-NOTICES.md').read_text(encoding='utf-8')
        listed = re.findall(r'^\| (\S+) \| [\d.]+ \|', notices, flags=re.M)
        self.assertEqual(len(listed), 19)
        # Every bundled package listed has its own heading in the full-license file.
        for name in listed:
            self.assertRegex(licenses, r'(?m)^' + re.escape(name) + r' [\d.]+ \(', name)
        self.assertIn('Mapbox, Inc.', licenses)

    def test_outside_paths_and_writes_are_rejected(self):
        for path in ['/../map04/rules.py', '/%2e%2e/map04/rules.py', '/serve.py', '/map04/rules.py', '/.env', '/data/geocoding-input.json', '/data/geocoding-correspondence.json', '/data/uug-input.json', '/data/uug-responses.json', '/basemap/regional-roads.json', '/basemap/public-pbf/sources.json', '/dane_adresowe-v2.xlsx', '/vendor/', '/vendor/maplibre-gl/', '/vendor/maplibre-gl/MANIFEST.json', '/vendor/maplibre-gl/../../serve.py', '/vendor/maplibre-gl/%2e%2e/%2e%2e/serve.py', '/node_modules/maplibre-gl/dist/maplibre-gl.mjs', '/vendor_maplibre.py']:
            self.assertIn('404', request(path)[0])
        self.assertIn('501', request('/map04/fixtures.json', 'POST')[0])

    def test_offline_has_exact_fixture_and_valid_script_style_hashes_without_external_assets(self):
        offline = ROOT / 'offline.html'
        self.assertTrue(offline.exists(), 'Build offline.html first')
        parser = ArtifactParser()
        parser.feed(offline.read_text(encoding='utf-8'))
        self.assertFalse(parser.external_assets)
        self.assertIn("connect-src 'none'", parser.csp)
        bundled = next(text for tag, attrs, text in parser.inline if attrs.get('id') == 'map04-data')
        self.assertEqual(json.loads(bundled), json.loads((ROOT.parent / 'map04/fixtures.json').read_text(encoding='utf-8')))
        map_data = next(text for tag, attrs, text in parser.inline if attrs.get('id') == 'basemap-data')
        self.assertEqual(json.loads(map_data), json.loads((ROOT / 'basemap/data.json').read_text(encoding='utf-8')))
        for tag, attrs, text in parser.inline:
            token = base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode('ascii')
            self.assertIn(f"'sha256-{token}'", parser.csp)

    def test_planner_offline_bundles_exact_source_data_with_valid_hashes(self):
        parser = ArtifactParser()
        parser.feed((ROOT / 'planner-offline.html').read_text(encoding='utf-8'))
        self.assertFalse(parser.external_assets)
        directives = csp_directives(parser.csp)
        # MapLibre's worker is read back from an in-memory blob in file://; no network scheme is allowed.
        self.assertEqual(directives['connect-src'], ['blob:'])
        self.assertEqual(sorted(directives['worker-src']), ['blob:', 'data:'])
        self.assertEqual(sorted(directives['img-src']), ['blob:', 'data:'])
        self.assertEqual(directives['default-src'], ["'none'"])
        for name, values in directives.items():
            for value in values:
                self.assertNotRegex(value, r'^(https?:|\*|'"'"'self'"'"'|'"'"'unsafe-)', f'{name} must not allow {value}')
        self.assertIn('id="maplibre-bundle" type="module"', (ROOT / 'planner-offline.html').read_text(encoding='utf-8'))
        # Road tiles are built in a classic-script Web Worker started from a blob: URL; it has no module syntax left.
        tile_worker = next(text for _, attrs, text in parser.inline if attrs.get('id') == 'road-tile-worker-source')
        self.assertIn('self.onmessage', tile_worker)
        self.assertIn('createRoadTileService', tile_worker)
        self.assertNotRegex(tile_worker, r'(?m)^\s*(import|export)\s')
        # Size budget: the offline artifact must stay far below the 71 MB of the uncompressed MAP-06 prototype.
        self.assertLess((ROOT / 'planner-offline.html').stat().st_size, 40 * 1024 * 1024)
        # The standalone file carries the MapLibre license and the bundled dependency notices.
        license_block = next(text for _, attrs, text in parser.inline if attrs.get('id') == 'third-party-licenses')
        self.assertIn('Copyright (c) 2023, MapLibre contributors', license_block)
        self.assertIn('Mapbox, Inc.', license_block)
        self.assertIn('Copyright (c) 2011 Gary Court', license_block)
        self.assertNotIn('No license file', license_block)
        for asset_id, source in [('address-data', 'data/addresses.json'), ('basemap-data', 'basemap/planner-compact.json'), ('geocoding-data', 'data/uug-geocoding.json'), ('routing-data', 'data/local-routes.json')]:
            attrs, bundled = next((attrs, text) for _, attrs, text in parser.inline if attrs.get('id') == asset_id)
            if asset_id in ('basemap-data', 'routing-data'):
                # Large blocks are stored as gzip + base64 and inflated locally by the browser.
                self.assertEqual(attrs.get('data-encoding'), 'gzip-base64', asset_id)
                bundled = gzip.decompress(base64.b64decode(bundled)).decode('utf-8')
            else:
                self.assertIsNone(attrs.get('data-encoding'), asset_id)
            self.assertTrue(json.loads(bundled) == json.loads((ROOT / source).read_text(encoding='utf-8')), f'Bundled {asset_id} differs from {source}')
        for _, _, text in parser.inline:
            token = base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode('ascii')
            self.assertIn(f"'sha256-{token}'", parser.csp)


if __name__ == '__main__':
    unittest.main()


class RangeTests(unittest.TestCase):
    """HTTP Range handling for the local map pack, with a small temporary file and no sockets."""

    def fetch(self, rng, file_bytes=bytes(range(100))):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'pack.bin'
            target.write_bytes(file_bytes)

            class RangeHandler(QuietHandler):
                def do_GET(self):
                    self.send_ranged(target, body=True)

            extra = f'Range: {rng}\r\n' if rng else ''
            connection = LocalConnection(f'GET /x HTTP/1.0\r\nHost: localhost\r\n{extra}\r\n'.encode('ascii'))
            RangeHandler(connection, ('127.0.0.1', 1), object())
            head, body = connection.output.getvalue().split(b'\r\n\r\n', 1)
            return head.decode('ascii'), body

    def test_partial_and_suffix_ranges(self):
        head, body = self.fetch('bytes=10-19')
        self.assertIn('206', head.splitlines()[0]);self.assertIn('Content-Range: bytes 10-19/100', head)
        self.assertEqual(body, bytes(range(10, 20)))
        head, body = self.fetch('bytes=-5')
        self.assertEqual(body, bytes(range(95, 100)));self.assertIn('bytes 95-99/100', head)
        head, body = self.fetch('bytes=90-')
        self.assertEqual(body, bytes(range(90, 100)))
        head, body = self.fetch('bytes=95-500')
        self.assertIn('bytes 95-99/100', head);self.assertEqual(len(body), 5)

    def test_head_ignores_range_and_reports_the_whole_resource(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'pack.bin'
            target.write_bytes(bytes(10))

            class HeadHandler(QuietHandler):
                def do_HEAD(self):
                    self.send_ranged(target, body=False)

            connection = LocalConnection(b'HEAD /x HTTP/1.0\r\nHost: localhost\r\nRange: bytes=2-3\r\n\r\n')
            HeadHandler(connection, ('127.0.0.1', 1), object())
            head, body = connection.output.getvalue().split(b'\r\n\r\n', 1)
        head = head.decode('ascii')
        self.assertIn('200', head.splitlines()[0]);self.assertIn('Content-Length: 10', head);self.assertNotIn('Content-Range', head);self.assertEqual(body, b'')

    def test_full_response_advertises_ranges(self):
        head, body = self.fetch(None)
        self.assertIn('200', head.splitlines()[0]);self.assertIn('Accept-Ranges: bytes', head);self.assertEqual(len(body), 100)

    def test_unsatisfiable_or_malformed_ranges_are_rejected(self):
        for value in ('bytes=100-120', 'bytes=50-40', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6', 'items=0-1', 'bytes=a-b'):
            head, body = self.fetch(value)
            self.assertIn('416', head.splitlines()[0], value)
            self.assertNotIn(b'\x00\x01', body)


class RichBuildTests(unittest.TestCase):
    def test_rich_artifact_embeds_the_pack_under_the_csp_hash(self):
        pack = ROOT / 'basemap' / 'map-pack.pmtiles'
        rich = ROOT / 'planner-offline-rich.html'
        if not pack.exists() or not rich.exists():
            self.skipTest('local pack or rich artifact not built')
        html = rich.read_text(encoding='utf-8')
        match = re.search(r'<script id="map-pack-data" type="text/plain" data-encoding="base64">([^<]+)</script>', html)
        self.assertIsNotNone(match)
        self.assertEqual(base64.b64decode(match.group(1)), pack.read_bytes())
        digest = base64.b64encode(hashlib.sha256(match.group(1).encode('utf-8')).digest()).decode('ascii')
        self.assertIn(f"'sha256-{digest}'", html)
