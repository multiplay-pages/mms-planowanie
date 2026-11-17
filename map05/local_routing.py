"""Conservative, local shortest-road-distance graph for a planning prototype.

No network calls. Access/turns are enforced on saved OSM topology. Unsupported
conditional/via-way restrictions exclude affected roads, never silently pass.
Speeds are explicit planning assumptions, not traffic or navigation data.
"""
from collections import Counter, defaultdict
import heapq
import math

CAR_ROADS = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service'}
SPEEDS = {'motorway': 90, 'motorway_link': 35, 'trunk': 70, 'trunk_link': 30, 'primary': 60, 'primary_link': 30, 'secondary': 50, 'secondary_link': 25, 'tertiary': 45, 'tertiary_link': 25, 'residential': 25, 'unclassified': 35, 'living_street': 10, 'service': 15}
ALLOW_ACCESS = {'yes', 'permissive', 'designated'}
NO_SNAP = {'motorway', 'motorway_link', 'trunk', 'trunk_link'}


def distance_m(a, b):
    lat_a, lat_b = math.radians(a[1]), math.radians(b[1])
    term = math.sin((lat_b - lat_a) / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 12742000 * math.asin(min(1, math.sqrt(term)))


def access(tags, direction=None):
    for kind in ['motorcar', 'motor_vehicle', 'vehicle', 'access']:
        if direction and f'{kind}:{direction}' in tags:
            return tags[f'{kind}:{direction}'] in ALLOW_ACCESS
        if kind in tags:
            return tags[kind] in ALLOW_ACCESS
    return True


def directions(tags):
    if tags.get('highway') not in CAR_ROADS or tags.get('area') == 'yes' or tags.get('ford') in {'yes', 'stepping_stones'} or any(key.endswith(':conditional') for key in tags):
        return False, False
    value = next((tags[key] for key in ['oneway:motorcar', 'oneway:motor_vehicle', 'oneway'] if key in tags), None)
    if value is None:
        value = 'yes' if tags.get('junction') == 'roundabout' or tags.get('highway') == 'motorway' else 'no'
    if value not in {'yes', '1', 'true', '-1', 'reverse', 'no', '0', 'false'}:
        return False, False
    return value not in {'-1', 'reverse'} and access(tags, 'forward'), value not in {'yes', '1', 'true'} and access(tags, 'backward')


def estimated_speed(tags, direction):
    speed = SPEEDS[tags['highway']]
    value = tags.get('maxspeed:' + direction, tags.get('maxspeed', ''))
    try:
        posted = float(value.replace(' mph', '')) * (1.609344 if 'mph' in value else 1)
        if posted > 0:
            speed = min(speed, posted * .7)
    except (ValueError, TypeError):
        pass
    return max(5, speed) / 3.6


def barrier_blocks(tags):
    if any(key.endswith(':conditional') for key in tags) or not access(tags) or tags.get('locked') == 'yes':
        return True
    kind = tags.get('barrier')
    if kind in {'cattle_grid', 'toll_booth', 'border_control'}:
        return False
    if kind in {'gate', 'lift_gate', 'swing_gate', 'sally_port'}:
        return not any(tags.get(key) in ALLOW_ACCESS for key in ['motorcar', 'motor_vehicle', 'vehicle', 'access'])
    return kind not in {None, 'no'}


def project_to_segment(point, a, b):
    # Local tangent plane is used only to snap; path lengths use spherical meters.
    sx, sy = math.cos(math.radians(point[1])) * 111195, 111195
    ax, ay = (a[0] - point[0]) * sx, (a[1] - point[1]) * sy
    dx, dy = (b[0] - a[0]) * sx, (b[1] - a[1]) * sy
    denominator = dx * dx + dy * dy
    ratio = max(0, min(1, -(ax * dx + ay * dy) / denominator)) if denominator else 0
    target = [a[0] + ratio * (b[0] - a[0]), a[1] + ratio * (b[1] - a[1])]
    return distance_m(point, target), ratio, target


class RoadGraph:
    def __init__(self, data, points=None, snap_limit_m=150):
        self.nodes = {int(key): value for key, value in data['nodes'].items()}
        self.blocked = {int(key) for key, value in data.get('barriers', {}).items() if barrier_blocks(value)}
        self.no_turns, self.only_turns, self.no_uturns = defaultdict(set), defaultdict(set), set()
        excluded, restriction_nodes, unsupported = set(), set(), 0
        for relation in data.get('restrictions', []):
            tags = relation['tags']
            if set(tags.get('except', '').split(';')) & {'motorcar', 'motor_vehicle', 'vehicle'}:
                continue
            kind = tags.get('restriction:motorcar', tags.get('restriction:motor_vehicle', tags.get('restriction', '')))
            members = relation['members']
            froms = [int(m['ref']) for m in members if m['role'] == 'from' and m['type'] == 'way']
            tos = [int(m['ref']) for m in members if m['role'] == 'to' and m['type'] == 'way']
            vias = [m for m in members if m['role'] == 'via']
            known = kind in {'no_left_turn', 'no_right_turn', 'no_straight_on', 'no_u_turn', 'no_entry', 'no_exit', 'only_right_turn', 'only_left_turn', 'only_straight_on'}
            if len(vias) != 1 or vias[0]['type'] != 'node' or not froms or not tos or not known or any(key.endswith(':conditional') for key in tags):
                excluded.update(froms)
                excluded.update(int(m['ref']) for m in vias if m['type'] == 'way')
                unsupported += 1
                continue
            node = int(vias[0]['ref'])
            restriction_nodes.add(node)
            for source in froms:
                if kind == 'no_u_turn' and source in tos:
                    self.no_uturns.add((node, source))
                else:
                    target = self.only_turns if kind.startswith('only_') else self.no_turns
                    target[(node, source)].update(tos)
        self.ways = [way for way in data['ways'] if way['id'] not in excluded and any(directions(way['tags']))]
        self.snaps, self.address_nodes = {}, {}
        insertions = self._snap(points or {}, snap_limit_m, restriction_nodes)
        counts = Counter(int(node) for way in self.ways for node in way['nodes'])
        junctions = {node for node, count in counts.items() if count > 1} | self.blocked | restriction_nodes | set(self.address_nodes.values())
        self.edges, self.adjacency, self.shapes = [], defaultdict(list), []
        for way in self.ways:
            ids = []
            for index, (a, b) in enumerate(zip(way['nodes'], way['nodes'][1:])):
                if not ids:
                    ids.append(int(a))
                ids.extend(node for _, node in sorted(insertions.get((way['id'], index), [])))
                ids.append(int(b))
            start = 0
            forward, backward = directions(way['tags'])
            for index in range(1, len(ids)):
                if ids[index] not in junctions and index != len(ids) - 1:
                    continue
                geometry = [self.nodes[node] for node in ids[start:index + 1]]
                length = sum(distance_m(a, b) for a, b in zip(geometry, geometry[1:]))
                if length > 0:
                    shape_id = len(self.shapes)
                    self.shapes.append(geometry)
                    for allowed, a, b, direction, reverse in [(forward, ids[start], ids[index], 'forward', False), (backward, ids[index], ids[start], 'backward', True)]:
                        if allowed:
                            edge = (a, b, length, length / estimated_speed(way['tags'], direction), int(way['id']), shape_id, reverse)
                            self.adjacency[a].append(len(self.edges))
                            self.edges.append(edge)
                start = index
        self.summary = {'sourceWays': len(data['ways']), 'carWays': len(self.ways), 'directedEdges': len(self.edges), 'junctions': len(self.adjacency), 'blockedNodes': len(self.blocked), 'unsupportedRestrictions': unsupported, 'conservativelyExcludedWays': len(excluded), 'snappedPoints': len(self.address_nodes)}

    def _snap(self, points, limit, restriction_nodes):
        grid, segments, insertions = defaultdict(list), [], defaultdict(list)
        for way in self.ways:
            if way['tags']['highway'] in NO_SNAP:
                continue
            for index, (a, b) in enumerate(zip(way['nodes'], way['nodes'][1:])):
                pa, pb = self.nodes[int(a)], self.nodes[int(b)]
                segment_id = len(segments)
                segments.append((way['id'], index, int(a), int(b), pa, pb))
                for x in range(math.floor(min(pa[0], pb[0]) * 100), math.floor(max(pa[0], pb[0]) * 100) + 1):
                    for y in range(math.floor(min(pa[1], pb[1]) * 100), math.floor(max(pa[1], pb[1]) * 100) + 1):
                        grid[(x, y)].append(segment_id)
        virtual_id = -1
        for address_id, point in points.items():
            cell = (math.floor(point[0] * 100), math.floor(point[1] * 100))
            candidates = {segment for dx in [-1, 0, 1] for dy in [-1, 0, 1] for segment in grid.get((cell[0] + dx, cell[1] + dy), [])}
            nearest = None
            for segment_id in sorted(candidates):
                way_id, index, a, b, pa, pb = segments[segment_id]
                distance, ratio, target = project_to_segment(point, pa, pb)
                node = a if ratio < 1e-8 else b if ratio > 1 - 1e-8 else None
                if node in self.blocked or node in restriction_nodes:
                    continue
                item = (distance, segment_id, ratio, target, node)
                if nearest is None or item[:2] < nearest[:2]:
                    nearest = item
            if nearest is None or nearest[0] > limit:
                self.snaps[address_id] = {'status': 'SNAP_UNCERTAIN', 'distanceM': None if nearest is None else round(nearest[0], 2), 'coordinates': None}
                continue
            distance, segment_id, ratio, target, node = nearest
            way_id, index, *_ = segments[segment_id]
            if node is None:
                same = next((existing for fraction, existing in insertions[(way_id, index)] if abs(fraction - ratio) < 1e-9), None)
                node = same if same is not None else virtual_id
                if same is None:
                    virtual_id -= 1
                    self.nodes[node] = target
                    insertions[(way_id, index)].append((ratio, node))
            self.address_nodes[address_id] = node
            self.snaps[address_id] = {'status': 'OK', 'distanceM': round(distance, 2), 'coordinates': target}
        return insertions

    def _transition(self, incoming, outgoing):
        previous, following = self.edges[incoming], self.edges[outgoing]
        node, source_way = previous[1], previous[4]
        if node in self.blocked or following[4] in self.no_turns.get((node, source_way), ()):
            return False
        only = self.only_turns.get((node, source_way))
        if only and following[4] not in only:
            return False
        if (node, source_way) in self.no_uturns and following[1] == previous[0] and following[4] == source_way:
            return False
        return True

    def _tree(self, source, targets):
        remaining = set(targets) - {source}
        best, previous, found, queue = {}, {}, {source: (-1, 0.0, 0.0)}, []
        for edge_id in self.adjacency.get(source, []):
            edge = self.edges[edge_id]
            best[edge_id] = (edge[2], edge[3])
            previous[edge_id] = -1
            heapq.heappush(queue, (edge[2], edge[3], edge_id))
        while queue and remaining:
            length, duration, incoming = heapq.heappop(queue)
            if best.get(incoming) != (length, duration):
                continue
            node = self.edges[incoming][1]
            if node in remaining:
                found[node] = (incoming, length, duration)
                remaining.remove(node)
            for outgoing in self.adjacency.get(node, []):
                if not self._transition(incoming, outgoing):
                    continue
                edge = self.edges[outgoing]
                candidate = (length + edge[2], duration + edge[3])
                if candidate < best.get(outgoing, (math.inf, math.inf)):
                    best[outgoing] = candidate
                    previous[outgoing] = incoming
                    heapq.heappush(queue, (*candidate, outgoing))
        return found, previous

    def _result(self, source, destination, found, previous, include_geometry=True):
        if destination not in found:
            return {'status': 'NO_PATH', 'distanceM': None, 'estimatedDurationS': None, 'geometry': None, 'path': None}
        state, length, duration = found[destination]
        path = []
        while state != -1:
            path.append(state)
            state = previous[state]
        segments = [(self.edges[edge_id][5] + 1) * (-1 if self.edges[edge_id][6] else 1) for edge_id in reversed(path)]
        geometry = [self.nodes[source]] if include_geometry else None
        if include_geometry:
            for segment in segments:
                shape = self.shapes[abs(segment)-1]
                geometry.extend((list(reversed(shape)) if segment < 0 else shape)[1:])
        return {'status': 'OK', 'distanceM': length, 'estimatedDurationS': duration, 'geometry': geometry, 'path': segments}

    def route_nodes(self, source, destination):
        found, previous = self._tree(source, {destination})
        return self._result(source, destination, found, previous)

    def routes_from(self, address_id, include_geometry=True):
        if address_id not in self.address_nodes:
            return {}
        source = self.address_nodes[address_id]
        found, previous = self._tree(source, set(self.address_nodes.values()))
        return {target: self._result(source, node, found, previous, include_geometry) for target, node in self.address_nodes.items()}

    def route(self, address_ids):
        if len(address_ids) < 2 or any(value not in self.address_nodes for value in address_ids):
            return {'status': 'LOCATION_UNKNOWN', 'distanceM': None, 'estimatedDurationS': None, 'geometry': None}
        results = [self.route_nodes(self.address_nodes[a], self.address_nodes[b]) for a, b in zip(address_ids, address_ids[1:])]
        if any(result['status'] != 'OK' for result in results):
            return next(result for result in results if result['status'] != 'OK')
        return {'status': 'OK', 'distanceM': sum(r['distanceM'] for r in results), 'estimatedDurationS': sum(r['estimatedDurationS'] for r in results), 'geometry': results[0]['geometry'] + [point for result in results[1:] for point in result['geometry'][1:]]}
