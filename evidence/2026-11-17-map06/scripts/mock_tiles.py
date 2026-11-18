"""Loopback-only mock satellite tile provider for MAP-06 browser tests. Logs every request."""
import sys, zlib, struct
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

def png(rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * 256 for _ in range(256))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 256, 256, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

TILE = png((46, 92, 58))
LOG = open(sys.argv[2], 'a', encoding='utf-8') if len(sys.argv) > 2 else None

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if LOG: LOG.write(self.path + '\n'); LOG.flush()
        self.send_response(200); self.send_header('Content-Type', 'image/png'); self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Content-Length', str(len(TILE))); self.end_headers(); self.wfile.write(TILE)
    def log_message(self, *a): pass

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
