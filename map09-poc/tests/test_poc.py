import http.client
import json
import re
import subprocess
import sys
import threading
import unittest
from pathlib import Path

POC = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POC))
import serve_poc  # noqa: E402


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve_poc.make_server(0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def get(self, path, method='GET', host=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        conn.request(method, path, headers={'Host': host or f'127.0.0.1:{self.port}'})
        response = conn.getresponse()
        body = response.read()
        headers = dict(response.getheaders())
        conn.close()
        return response.status, headers, body

    def test_demo_files_are_served_with_the_demo_csp(self):
        for path in serve_poc.FILES:
            status, headers, body = self.get(path)
            self.assertEqual(status, 200, path)
            self.assertTrue(body, path)
            self.assertIn("connect-src 'self' https://tiles.openfreemap.org", headers['Content-Security-Policy'])
            self.assertEqual(headers['Referrer-Policy'], 'no-referrer')

    def test_meta_csp_in_html_matches_the_header_policy(self):
        html = (POC / 'index.html').read_text(encoding='utf-8')
        meta = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html).group(1)
        self.assertEqual(meta, serve_poc.CSP)

    def test_only_the_provider_origin_is_allowed_outside_self(self):
        origins = set(re.findall(r'https?://[^\s;]+', serve_poc.CSP))
        self.assertEqual(origins, {'https://tiles.openfreemap.org'})

    def test_nothing_outside_the_allowlist_is_served(self):
        for path in ['/../serve_poc.py', '/serve_poc.py', '/tests/test_poc.py', '/vendor/maplibre-gl/MANIFEST.json',
                     '/map05/planner.html', '/%2e%2e/map05/planner.html', '/basemap/map-pack.pmtiles']:
            self.assertEqual(self.get(path)[0], 404, path)

    def test_foreign_host_header_and_writes_are_refused(self):
        self.assertEqual(self.get('/', host='evil.example')[0], 403)
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        conn.request('POST', '/', body=b'x', headers={'Host': f'127.0.0.1:{self.port}'})
        self.assertEqual(conn.getresponse().status, 405)

    def test_head_has_no_body(self):
        status, headers, body = self.get('/poc.mjs', method='HEAD')
        self.assertEqual((status, body), (200, b''))
        self.assertGreater(int(headers['Content-Length']), 0)


class IsolationTests(unittest.TestCase):
    def test_demo_does_not_import_or_name_planner_data(self):
        for name in ['poc.mjs', 'overlay.mjs', 'index.html', 'serve_poc.py']:
            text = (POC / name).read_text(encoding='utf-8')
            for forbidden in ['planner.mjs', 'planner-data', 'planner-compact', 'map-pack', 'localStorage', 'nominatim', 'geocod']:
                self.assertNotIn(forbidden, text.replace('geocoder', ''), f'{name}: {forbidden}')
        # Only the vendored MapLibre is shared with map05.
        imports = re.findall(r"from '([^']+)'", (POC / 'poc.mjs').read_text(encoding='utf-8'))
        self.assertEqual(sorted(imports), ['./overlay.mjs', './vendor/maplibre-gl/maplibre-gl.mjs'])

    def test_overlay_module_runs_under_node_and_is_synthetic(self):
        script = (
            "import('" + (POC / 'overlay.mjs').as_uri() + "').then(m => {"
            "const pts = m.syntheticPoints().features;"
            "console.log(JSON.stringify({n: pts.length, synthetic: pts.every(f => f.properties.synthetic === true),"
            "kinds: [...new Set(pts.map(f => f.properties.kind))].sort()}));});"
        )
        out = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout
        data = json.loads(out)
        self.assertTrue(data['synthetic'])
        self.assertEqual(data['kinds'], ['BSA', 'MPL', 'POMIAR'])


if __name__ == '__main__':
    unittest.main()
