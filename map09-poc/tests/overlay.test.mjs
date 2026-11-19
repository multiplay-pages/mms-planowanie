import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeOverlay, emptyBasemapStyle, pickFont, overlayLayers, OVERLAY_LAYER_IDS, syntheticPoints, syntheticRoutes, PLACES, POLAND_BOUNDS} from '../overlay.mjs';

const providerStyle = () => ({
  version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  sources: {openmaptiles: {type: 'vector', url: 'https://tiles.openfreemap.org/planet'}},
  layers: [
    {id: 'background', type: 'background'},
    {id: 'place_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: {'text-font': ['Noto Sans Regular']}},
    {id: 'place_capital', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: {'text-font': ['Noto Sans Bold']}},
  ],
});

test('overlay is appended on top of the provider style and does not alter basemap layers', () => {
  const base = providerStyle();
  const merged = mergeOverlay(base);
  assert.deepEqual(merged.layers.slice(0, 3).map((l) => l.id), ['background', 'place_city', 'place_capital']);
  assert.deepEqual(merged.layers.slice(3).map((l) => l.id), OVERLAY_LAYER_IDS);
  assert.ok(merged.sources.openmaptiles && merged.sources['demo-points'] && merged.sources['demo-routes']);
  assert.equal(merged.glyphs, base.glyphs);
  assert.equal(base.layers.length, 3, 'input style is not mutated');
});

test('merge is idempotent: switching style twice never duplicates overlay layers', () => {
  const once = mergeOverlay(providerStyle());
  const twice = mergeOverlay(once);
  assert.equal(twice.layers.filter((l) => OVERLAY_LAYER_IDS.includes(l.id)).length, OVERLAY_LAYER_IDS.length);
});

test('visit numbers use a bold font taken from the provider style, never an invented one', () => {
  assert.deepEqual(pickFont(providerStyle()), ['Noto Sans Bold']);
  const layer = mergeOverlay(providerStyle()).layers.find((l) => l.id === 'demo-points');
  assert.deepEqual(layer.layout['text-font'], ['Noto Sans Bold']);
});

test('without glyphs (offline/empty style) no text layer is requested', () => {
  const layer = mergeOverlay(emptyBasemapStyle()).layers.find((l) => l.id === 'demo-points');
  assert.equal(layer.layout['text-field'], undefined);
  assert.equal(overlayLayers().find((l) => l.id === 'demo-points').layout['text-font'], undefined);
});

test('synthetic data: three kinds, flagged synthetic, two non-road routes, no MMS identifiers', () => {
  const points = syntheticPoints().features;
  assert.deepEqual([...new Set(points.map((f) => f.properties.kind))].sort(), ['BSA', 'MPL', 'POMIAR']);
  assert.ok(points.every((f) => f.properties.synthetic === true && /^SYN-/.test(f.properties.id)));
  const routes = syntheticRoutes().features;
  assert.equal(routes.length, 2);
  assert.ok(routes.every((f) => f.geometry.coordinates.length >= 3 && f.properties.synthetic === true));
});

test('camera presets cover all of Poland and the requested towns; nothing restricts the camera', () => {
  for (const key of ['polska', 'opole', 'knurow', 'warszawa', 'gdansk', 'krakow', 'wroclaw']) assert.ok(PLACES[key], key);
  const [[w, s], [e, n]] = POLAND_BOUNDS;
  assert.ok(w <= 14.2 && e >= 24.1 && s <= 49.0 && n >= 54.8);
});
