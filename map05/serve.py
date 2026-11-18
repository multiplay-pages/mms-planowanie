"""Loopback-only, allowlisted static server for the MAP-05 demonstrator."""
import argparse
import re
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
    '/optimizer.mjs': ('optimizer.mjs', 'text/javascript; charset=utf-8'),
    '/planner-map.mjs': ('planner-map.mjs', 'text/javascript; charset=utf-8'),
    '/operational-map.mjs': ('operational-map.mjs', 'text/javascript; charset=utf-8'),
    '/road-tiles.mjs': ('road-tiles.mjs', 'text/javascript; charset=utf-8'),
    '/road-tile-worker.mjs': ('road-tile-worker.mjs', 'text/javascript; charset=utf-8'),
    '/road-tile-client.mjs': ('road-tile-client.mjs', 'text/javascript; charset=utf-8'),
    '/embedded-data.mjs': ('embedded-data.mjs', 'text/javascript; charset=utf-8'),
    '/maplibre-view.mjs': ('maplibre-view.mjs', 'text/javascript; charset=utf-8'),
    '/vendor/maplibre-gl/maplibre-gl.mjs': ('vendor/maplibre-gl/maplibre-gl.mjs', 'text/javascript; charset=utf-8'),
    '/vendor/maplibre-gl/maplibre-gl-worker.mjs': ('vendor/maplibre-gl/maplibre-gl-worker.mjs', 'text/javascript; charset=utf-8'),
    '/vendor/maplibre-gl/maplibre-gl.css': ('vendor/maplibre-gl/maplibre-gl.css', 'text/css; charset=utf-8'),
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


BASE_CSP = "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
# Satellite tiles are off unless the operator starts the server with explicit provider origins.
TILE_ORIGINS = []


def tile_csp(csp, origins):
    if not origins:
        return csp
    extra = ' ' + ' '.join(origins)
    csp = csp.replace("connect-src 'self'", "connect-src 'self'" + extra)
    return csp.replace("img-src 'self' data:", "img-src 'self' data: blob:" + extra)


ORIGIN_RE = re.compile(r'^(https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?|http://(127\.0\.0\.1|localhost))(:[0-9]{1,5})?/?$', re.I)


def valid_origin(value):
    """Accepts only a bare origin; the value is later written into a CSP header and an HTML attribute."""
    if not ORIGIN_RE.fullmatch(value):
        raise argparse.ArgumentTypeError(f'Not a plain https origin: {value!r}')
    port = urlsplit(value).port
    if port is not None and not 0 < port < 65536:
        raise argparse.ArgumentTypeError(f'Invalid port: {value!r}')
    return value.lower().rstrip('/')


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
            if TILE_ORIGINS and entry[0] == 'planner.html':
                html = data.decode('utf-8')
                meta = '<meta name="mms-tile-origins" content="' + ' '.join(TILE_ORIGINS) + '">'
                html = re.sub(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)', lambda m: m.group(1) + tile_csp(m.group(2), TILE_ORIGINS) + m.group(3) + '\n  ' + meta, html, count=1)
                data = html.encode('utf-8')
        except OSError:
            self.send_error(404, 'Required local file is unavailable')
            return
        self.send_response(200)
        self.send_header('Content-Type', entry[1])
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', tile_csp(BASE_CSP, TILE_ORIGINS))
        self.end_headers()
        if body:
            self.wfile.write(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--allow-tile-origin', action='append', type=valid_origin, default=[], help='Explicitly allow one satellite tile provider origin (opt-in; the visible map area is sent to it).')
    args = parser.parse_args()
    TILE_ORIGINS[:] = args.allow_tile_origin
    if TILE_ORIGINS:
        print('Satellite tiles allowed only from: ' + ', '.join(TILE_ORIGINS), flush=True)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'MAP-05: http://127.0.0.1:{args.port}  (Ctrl+C to stop)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
