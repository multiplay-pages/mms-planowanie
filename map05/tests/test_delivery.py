"""Exercise actual HTTP handler and offline artifact without network access."""
import base64
import hashlib
from html.parser import HTMLParser
import importlib.util
import io
import json
from pathlib import Path
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


class DeliveryTests(unittest.TestCase):
    def test_assets_and_exact_fixture_served_with_correct_types(self):
        for path, content_type in [('/', 'text/html'), ('/styles.css', 'text/css'), ('/app.mjs', 'text/javascript'), ('/model.mjs', 'text/javascript'), ('/map.mjs', 'text/javascript'), ('/basemap/data.json', 'application/json'), ('/favicon.svg', 'image/svg+xml'), ('/map04/fixtures.json', 'application/json'), ('/planner.html', 'text/html'), ('/planner.css', 'text/css'), ('/planner.mjs', 'text/javascript'), ('/planner-model.mjs', 'text/javascript'), ('/locations.mjs', 'text/javascript'), ('/routes.mjs', 'text/javascript'), ('/planner-map.mjs', 'text/javascript'), ('/data/addresses.json', 'application/json'), ('/data/geocoding.json', 'application/json'), ('/data/uug-geocoding.json', 'application/json'), ('/data/local-routes.json', 'application/json'), ('/basemap/planner-compact.json', 'application/json')]:
            headers, body = request(path)
            self.assertIn('200 OK', headers)
            self.assertIn(content_type, headers)
            self.assertTrue(body)
            self.assertIn("connect-src 'self'", headers)
        self.assertEqual(request('/map04/fixtures.json')[1], (ROOT.parent / 'map04/fixtures.json').read_bytes())
        self.assertEqual(request('/basemap/data.json')[1], (ROOT / 'basemap/data.json').read_bytes())
        self.assertEqual(request('/', 'HEAD')[1], b'')
        self.assertEqual(request('/')[1], (ROOT / 'planner.html').read_bytes())
        self.assertEqual(request('/data/addresses.json')[1], (ROOT / 'data/addresses.json').read_bytes())

    def test_outside_paths_and_writes_are_rejected(self):
        for path in ['/../map04/rules.py', '/%2e%2e/map04/rules.py', '/serve.py', '/map04/rules.py', '/.env', '/data/geocoding-input.json', '/data/geocoding-correspondence.json', '/data/uug-input.json', '/data/uug-responses.json', '/basemap/regional-roads.json', '/basemap/public-pbf/sources.json', '/dane_adresowe-v2.xlsx']:
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
        self.assertIn("connect-src 'none'", parser.csp)
        for asset_id, source in [('address-data', 'data/addresses.json'), ('basemap-data', 'basemap/planner-compact.json'), ('geocoding-data', 'data/uug-geocoding.json'), ('routing-data', 'data/local-routes.json')]:
            bundled = next(text for _, attrs, text in parser.inline if attrs.get('id') == asset_id)
            self.assertTrue(json.loads(bundled) == json.loads((ROOT / source).read_text(encoding='utf-8')), f'Bundled {asset_id} differs from {source}')
        for _, _, text in parser.inline:
            token = base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode('ascii')
            self.assertIn(f"'sha256-{token}'", parser.csp)


if __name__ == '__main__':
    unittest.main()
