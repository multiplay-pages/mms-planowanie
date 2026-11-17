"""Loopback-only, allowlisted static server for the MAP-05 demonstrator."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
FILES = {
    '/': ('planner.html', 'text/html; charset=utf-8'),
    '/planner.html': ('planner.html', 'text/html; charset=utf-8'),
    '/planner.css': ('planner.css', 'text/css; charset=utf-8'),
    '/planner.mjs': ('planner.mjs', 'text/javascript; charset=utf-8'),
    '/planner-model.mjs': ('planner-model.mjs', 'text/javascript; charset=utf-8'),
    '/locations.mjs': ('locations.mjs', 'text/javascript; charset=utf-8'),
    '/routes.mjs': ('routes.mjs', 'text/javascript; charset=utf-8'),
    '/planner-map.mjs': ('planner-map.mjs', 'text/javascript; charset=utf-8'),
    '/data/addresses.json': ('data/addresses.json', 'application/json; charset=utf-8'),
    '/data/geocoding.json': ('data/geocoding.json', 'application/json; charset=utf-8'),
    '/data/uug-geocoding.json': ('data/uug-geocoding.json', 'application/json; charset=utf-8'),
    '/data/local-routes.json': ('data/local-routes.json', 'application/json; charset=utf-8'),
    '/basemap/planner-compact.json': ('basemap/planner-compact.json', 'application/json; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
    '/app.mjs': ('app.mjs', 'text/javascript; charset=utf-8'),
    '/model.mjs': ('model.mjs', 'text/javascript; charset=utf-8'),
    '/map.mjs': ('map.mjs', 'text/javascript; charset=utf-8'),
    '/basemap/data.json': ('basemap/data.json', 'application/json; charset=utf-8'),
    '/favicon.svg': ('favicon.svg', 'image/svg+xml'),
    '/map04/fixtures.json': ('../map04/fixtures.json', 'application/json; charset=utf-8'),
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_file(body=True)

    def do_HEAD(self):
        self.send_file(body=False)

    def send_file(self, *, body):
        entry = FILES.get(urlsplit(self.path).path)
        if entry is None:
            self.send_error(404)
            return
        try:
            data = (ROOT / entry[0]).read_bytes()
        except OSError:
            self.send_error(404, 'Required local file is unavailable')
            return
        self.send_response(200)
        self.send_header('Content-Type', entry[1])
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.end_headers()
        if body:
            self.wfile.write(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'MAP-05: http://127.0.0.1:{args.port}  (Ctrl+C to stop)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
