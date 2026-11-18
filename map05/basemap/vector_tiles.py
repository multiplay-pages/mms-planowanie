"""Standard-library Mapbox Vector Tile (v2) encoder with line/polygon clipping.

Geometry arrives as lon/lat; it is projected to tile coordinates (extent 4096, buffer 64),
clipped, quantised and encoded. Used only by the offline map pack builder.
"""
import gzip
import math

EXTENT = 4096
BUFFER = 64


def world_xy(lon, lat, z):
    n = 1 << z
    sin = math.sin(math.radians(max(-85.0511, min(85.0511, lat))))
    return (lon + 180.0) / 360.0 * n, (0.5 - math.log((1 + sin) / (1 - sin)) / (4 * math.pi)) * n


def _varint(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def _field(number, wire, payload):
    return _varint(number << 3 | wire) + payload


def _bytes_field(number, data):
    return _field(number, 2, _varint(len(data)) + data)


def _zigzag(value):
    return value * 2 if value >= 0 else -value * 2 - 1


def clip_line(points, low=-BUFFER, high=EXTENT + BUFFER):
    """Liang-Barsky clip of a polyline to a square; returns list of rounded polylines (>=2 points)."""
    lines, current = [], None
    for index in range(1, len(points)):
        (ax, ay), (bx, by) = points[index - 1], points[index]
        t0, t1, dx, dy = 0.0, 1.0, bx - ax, by - ay
        inside = True
        for p, q in ((-dx, ax - low), (dx, high - ax), (-dy, ay - low), (dy, high - ay)):
            if p == 0:
                if q < 0:
                    inside = False
                    break
                continue
            r = q / p
            if p < 0:
                if r > t1:
                    inside = False
                    break
                t0 = max(t0, r)
            else:
                if r < t0:
                    inside = False
                    break
                t1 = min(t1, r)
        if not inside:
            current = None
            continue
        if current is None:
            current = [(ax + t0 * dx, ay + t0 * dy)]
            lines.append(current)
        current.append((ax + t1 * dx, ay + t1 * dy))
        if t1 < 1:
            current = None
    result = []
    for line in lines:
        rounded = []
        for x, y in line:
            point = (round(x), round(y))
            if not rounded or rounded[-1] != point:
                rounded.append(point)
        if len(rounded) >= 2:
            result.append(rounded)
    return result


def clip_polygon(ring, low=-BUFFER, high=EXTENT + BUFFER):
    """Sutherland-Hodgman clip of one closed ring (without repeated end point)."""
    def clip(points, inside, intersect):
        out = []
        for index, current in enumerate(points):
            previous = points[index - 1]
            a, b = inside(current), inside(previous)
            if a:
                if not b:
                    out.append(intersect(previous, current))
                out.append(current)
            elif b:
                out.append(intersect(previous, current))
        return out

    def at_x(value):
        return lambda p, q: (value, p[1] + (q[1] - p[1]) * (value - p[0]) / (q[0] - p[0]))

    def at_y(value):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (value - p[1]) / (q[1] - p[1]), value)

    points = ring
    for inside, intersect in ((lambda p: p[0] >= low, at_x(low)), (lambda p: p[0] <= high, at_x(high)),
                              (lambda p: p[1] >= low, at_y(low)), (lambda p: p[1] <= high, at_y(high))):
        if not points:
            return []
        points = clip(points, inside, intersect)
    rounded = []
    for x, y in points:
        point = (round(x), round(y))
        if not rounded or rounded[-1] != point:
            rounded.append(point)
    if len(rounded) > 1 and rounded[0] == rounded[-1]:
        rounded.pop()
    return rounded if len(rounded) >= 3 else []


def ring_area(ring):
    return sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring))) / 2


def encode_geometry(kind, parts):
    """kind: 1 point, 2 line, 3 polygon. parts: list of point lists (rings for polygons)."""
    commands, cx, cy = [], 0, 0
    if kind == 1:
        commands.append(1 | len(parts) << 3)
        for part in parts:
            x, y = part[0]
            commands += [_zigzag(x - cx), _zigzag(y - cy)]
            cx, cy = x, y
        return commands
    for part in parts:
        x0, y0 = part[0]
        commands += [1 | 1 << 3, _zigzag(x0 - cx), _zigzag(y0 - cy)]
        cx, cy = x0, y0
        rest = part[1:]
        commands.append(2 | len(rest) << 3)
        for x, y in rest:
            commands += [_zigzag(x - cx), _zigzag(y - cy)]
            cx, cy = x, y
        if kind == 3:
            commands.append(7 | 1 << 3)
    return commands


class Layer:
    def __init__(self, name):
        self.name, self.features, self.keys, self.values = name, [], {}, {}

    def _key(self, key):
        return self.keys.setdefault(key, len(self.keys))

    def _value(self, value):
        identity = (type(value).__name__, value)
        return self.values.setdefault(identity, len(self.values))

    def add(self, identifier, kind, parts, properties):
        if not parts:
            return False
        tags = []
        for key, value in properties.items():
            if value is None or value == '':
                continue
            tags += [self._key(key), self._value(value)]
        packed = lambda numbers: b''.join(_varint(n) for n in numbers)
        feature = b''
        if identifier is not None:
            feature += _field(1, 0, _varint(identifier))
        feature += _bytes_field(2, packed(tags)) + _field(3, 0, _varint(kind)) + _bytes_field(4, packed(encode_geometry(kind, parts)))
        self.features.append(feature)
        return True

    def encode(self):
        out = _field(15, 0, _varint(2)) + _bytes_field(1, self.name.encode('utf-8'))
        for feature in self.features:
            out += _bytes_field(2, feature)
        for key in self.keys:
            out += _bytes_field(3, key.encode('utf-8'))
        for kind, value in self.values:
            if kind == 'str':
                out += _bytes_field(4, _bytes_field(1, value.encode('utf-8')))
            else:
                out += _bytes_field(4, _field(5, 0, _varint(value)))
        out += _field(5, 0, _varint(EXTENT))
        return out


def encode_tile(layers):
    """layers: iterable of Layer; empty layers are dropped. Returns gzip-compressed bytes or b'' when empty."""
    data = b''.join(_bytes_field(3, layer.encode()) for layer in layers if layer.features)
    return gzip.compress(data, 9, mtime=0) if data else b''


# ---- minimal decoder used by tests and the builder's self-check -----------------------------------
def _read(data, position):
    value = shift = 0
    while True:
        byte = data[position]
        position += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, position
        shift += 7


def _fields(data):
    position = 0
    while position < len(data):
        key, position = _read(data, position)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, position = _read(data, position)
        elif wire == 2:
            size, position = _read(data, position)
            value, position = data[position:position + size], position + size
        else:
            raise ValueError('unsupported wire type')
        yield number, wire, value


def decode_tile(data):
    """Returns {layer: [{'type','properties','geometry': [[points...]]}]} for tests."""
    raw = gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data
    result = {}
    for number, _, layer_bytes in _fields(raw):
        if number != 3:
            continue
        name, keys, values, features = '', [], [], []
        for n, w, v in _fields(layer_bytes):
            if n == 1:
                name = v.decode('utf-8')
            elif n == 2:
                features.append(v)
            elif n == 3:
                keys.append(v.decode('utf-8'))
            elif n == 4:
                for vn, _, vv in _fields(v):
                    values.append(vv.decode('utf-8') if vn == 1 else vv)
        decoded = []
        for feature in features:
            tags, kind, geometry = [], 0, []
            for n, w, v in _fields(feature):
                if n == 2:
                    position = 0
                    while position < len(v):
                        item, position = _read(v, position)
                        tags.append(item)
                elif n == 3:
                    kind = v
                elif n == 4:
                    position = 0
                    while position < len(v):
                        item, position = _read(v, position)
                        geometry.append(item)
            unzig = lambda value: (value >> 1) ^ -(value & 1)
            parts, current, cx, cy, i = [], None, 0, 0, 0
            while i < len(geometry):
                command, count = geometry[i] & 7, geometry[i] >> 3
                i += 1
                if command == 7:
                    continue
                for _ in range(count):
                    cx += unzig(geometry[i])
                    cy += unzig(geometry[i + 1])
                    i += 2
                    if command == 1:
                        current = [(cx, cy)]
                        parts.append(current)
                    else:
                        current.append((cx, cy))
            decoded.append({'type': kind, 'properties': {keys[tags[j]]: values[tags[j + 1]] for j in range(0, len(tags), 2)}, 'geometry': parts})
        result[name] = decoded
    return result
