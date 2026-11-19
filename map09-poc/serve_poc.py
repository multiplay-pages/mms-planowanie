"""MAP-09 PoC server: serves ONLY the demonstrator files on 127.0.0.1, with its own Content-Security-Policy.

It is separate from map05/serve.py on purpose: the planner's CSP is `connect-src 'self'` and must stay that way.
This server never reads planner data, plans or the map pack; the vendored MapLibre is the only thing shared with map05.
"""
from __future__ import annotations

import argparse
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENDOR = HERE.parent / 'map05' / 'vendor' / 'maplibre-gl'

# Must stay identical to the <meta http-equiv="Content-Security-Policy"> in index.html (a test checks that).
CSP = ("default-src 'self'; connect-src 'self' https://tiles.openfreemap.org; "
       "img-src 'self' data: blob: https://tiles.openfreemap.org; script-src 'self'; style-src 'self'; "
       "worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")
HEADER_CSP = CSP + "; frame-ancestors 'none'"

FILES = {
    '/': (HERE / 'index.html', 'text/html; charset=utf-8'),
    '/index.html': (HERE / 'index.html', 'text/html; charset=utf-8'),
    '/poc.css': (HERE / 'poc.css', 'text/css; charset=utf-8'),
    '/poc.mjs': (HERE / 'poc.mjs', 'text/javascript; charset=utf-8'),
    '/overlay.mjs': (HERE / 'overlay.mjs', 'text/javascript; charset=utf-8'),
    '/vendor/maplibre-gl/maplibre-gl.mjs': (VENDOR / 'maplibre-gl.mjs', 'text/javascript; charset=utf-8'),
    '/vendor/maplibre-gl/maplibre-gl-worker.mjs': (VENDOR / 'maplibre-gl-worker.mjs', 'text/javascript; charset=utf-8'),
    '/vendor/maplibre-gl/maplibre-gl.css': (VENDOR / 'maplibre-gl.css', 'text/css; charset=utf-8'),
}
LOCAL_HOST = re.compile(r'^(127\.0\.0\.1|localhost)(:\d+)?$')


class Handler(BaseHTTPRequestHandler):
    server_version = 'MAP09PoC'

    def _send(self, status: int, body: bytes = b'', content_type: str = 'text/plain; charset=utf-8', head: bool = False):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Content-Security-Policy', HEADER_CSP)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')  # the provider must not learn the local address or path
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _route(self, head: bool):
        if not LOCAL_HOST.match(self.headers.get('Host', '')):  # DNS-rebinding guard
            return self._send(403, b'host not allowed', head=head)
        path = self.path.split('?', 1)[0]
        entry = FILES.get(path)
        if entry is None:
            return self._send(404, b'not found', head=head)
        file, content_type = entry
        try:
            body = file.read_bytes()
        except OSError:
            return self._send(404, b'not found', head=head)
        return self._send(200, body, content_type, head=head)

    def do_GET(self):
        self._route(False)

    def do_HEAD(self):
        self._route(True)

    def do_POST(self):
        self._send(405, b'read-only demo')

    do_PUT = do_DELETE = do_PATCH = do_POST

    def log_message(self, fmt, *args):  # keep the console quiet; no request log is kept
        pass


def make_server(port: int = 8765) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = make_server(args.port)
    print(f'MAP-09 PoC: http://127.0.0.1:{args.port}/  (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
