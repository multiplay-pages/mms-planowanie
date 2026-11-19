// MAP-09 PoC: synthetic operational overlay, kept completely apart from the basemap.
// Everything here is plain data and pure functions (no DOM, no network, no MMS planner state), so it is unit-testable.
// The points and the route are SYNTHETIC: city-centre areas with made-up offsets. They are not customer addresses or real routes.

export const POLAND_BOUNDS = [[14.07, 49.0], [24.15, 54.84]];

// Camera presets. Polska = fit of the national bounds; the others are fixed centres of public places.
export const PLACES = {
  polska: {label: 'Polska', bounds: POLAND_BOUNDS},
  opole: {label: 'Opole', center: [17.9213, 50.6751], zoom: 13.5},
  knurow: {label: 'Knurów', center: [18.6667, 50.2167], zoom: 13.5},
  warszawa: {label: 'Warszawa', center: [21.0122, 52.2297], zoom: 12},
  gdansk: {label: 'Gdańsk', center: [18.6466, 54.352], zoom: 12},
  krakow: {label: 'Kraków', center: [19.945, 50.0647], zoom: 12},
  wroclaw: {label: 'Wrocław', center: [17.0385, 51.1079], zoom: 12},
};

export const KINDS = {
  MPL: {shape: 'circle', fill: '#005a8d'},
  BSA: {shape: 'square', fill: '#b35c00'},
  POMIAR: {shape: 'diamond', fill: '#8a3f6d'},
};

const point = (id, kind, seq, city, route, coordinates) => ({
  type: 'Feature',
  geometry: {type: 'Point', coordinates},
  properties: {id, kind, seq, city, route, icon: kind.toLowerCase(), synthetic: true},
});

// Visits are numbered per route (1..n), like the MAP-08 operational map. Opole and Knurów have a short route each.
const POINTS = [
  point('SYN-OPO-1', 'MPL', 1, 'Opole', 'opole', [17.925, 50.6745]),
  point('SYN-OPO-2', 'BSA', 2, 'Opole', 'opole', [17.9135, 50.679]),
  point('SYN-OPO-3', 'POMIAR', 3, 'Opole', 'opole', [17.933, 50.6702]),
  point('SYN-OPO-4', 'MPL', 4, 'Opole', 'opole', [17.906, 50.669]),
  point('SYN-KNU-1', 'MPL', 1, 'Knurów', 'knurow', [18.67, 50.219]),
  point('SYN-KNU-2', 'BSA', 2, 'Knurów', 'knurow', [18.661, 50.214]),
  point('SYN-KNU-3', 'POMIAR', 3, 'Knurów', 'knurow', [18.6745, 50.21]),
  point('SYN-WAW-1', 'MPL', 1, 'Warszawa', null, [21.0122, 52.2297]),
  point('SYN-GDA-1', 'BSA', 1, 'Gdańsk', null, [18.6466, 54.352]),
  point('SYN-KRA-1', 'POMIAR', 1, 'Kraków', null, [19.945, 50.0647]),
  point('SYN-WRO-1', 'MPL', 1, 'Wrocław', null, [17.0385, 51.1079]),
];

const ROUTE_COLORS = {opole: '#0072B2', knurow: '#D55E00'};

export function syntheticPoints() {
  return {type: 'FeatureCollection', features: POINTS.map((feature) => structuredClone(feature))};
}

// A deliberately simple straight polyline through the visits of one route. It only exists to judge contrast and legibility;
// it is NOT a road route and the demonstrator says so.
export function syntheticRoutes() {
  const features = Object.entries(ROUTE_COLORS).map(([route, color]) => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: POINTS.filter((p) => p.properties.route === route).sort((a, b) => a.properties.seq - b.properties.seq).map((p) => p.geometry.coordinates)},
    properties: {route, color, synthetic: true},
  }));
  return {type: 'FeatureCollection', features};
}

export const OVERLAY_SOURCES = {'demo-points': 'demo-points', 'demo-routes': 'demo-routes'};
export const OVERLAY_LAYER_IDS = ['demo-route-casing', 'demo-route', 'demo-points'];
export const ICON_NAMES = ['mpl', 'bsa', 'pomiar'];

/** A bold font that the basemap style's own glyph server certainly serves, so numbers never depend on a font we invented. */
export function pickFont(style) {
  const fonts = [];
  for (const layer of style?.layers ?? []) {
    const font = layer?.layout?.['text-font'];
    if (Array.isArray(font) && font.every((name) => typeof name === 'string') && font.length) fonts.push(font);
  }
  return fonts.find((font) => font.some((name) => /bold/i.test(name))) ?? fonts[0] ?? null;
}

export function overlaySources() {
  return {
    'demo-points': {type: 'geojson', data: syntheticPoints()},
    'demo-routes': {type: 'geojson', data: syntheticRoutes()},
  };
}

export function overlayLayers({font = null} = {}) {
  const layers = [
    {id: 'demo-route-casing', type: 'line', source: 'demo-routes', layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 6, 12, 11, 17, 16], 'line-opacity': 0.95}},
    {id: 'demo-route', type: 'line', source: 'demo-routes', layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 12, 6, 17, 9]}},
    {id: 'demo-points', type: 'symbol', source: 'demo-points',
      layout: {'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 12, 0.8, 17, 1], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        ...(font ? {'text-field': ['to-string', ['get', 'seq']], 'text-font': font, 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': true} : {})},
      paint: font ? {'text-color': '#ffffff'} : {}},
  ];
  return layers;
}

/** Adds the overlay to a freshly loaded basemap style. Used as MapLibre `transformStyle`, so it survives every style change. */
export function mergeOverlay(nextStyle) {
  const next = nextStyle ?? {version: 8, sources: {}, layers: []};
  const font = next.glyphs ? pickFont(next) : null;
  return {
    ...next,
    sources: {...(next.sources ?? {}), ...overlaySources()},
    layers: [...(next.layers ?? []).filter((layer) => !OVERLAY_LAYER_IDS.includes(layer.id)), ...overlayLayers({font})],
  };
}

/** Basemap-less style used before the online map is enabled and when the provider is unreachable: a plain background only. */
export function emptyBasemapStyle() {
  return {version: 8, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': '#e8ecef'}}]};
}

export function summarizeOverlay(map) {
  const points = syntheticPoints().features;
  return {total: points.length, byKind: points.reduce((acc, p) => ({...acc, [p.properties.kind]: (acc[p.properties.kind] ?? 0) + 1}), {})};
}
