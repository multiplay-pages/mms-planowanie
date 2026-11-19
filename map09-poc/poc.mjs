// MAP-09 PoC: whole-Poland vector basemap (OpenFreeMap) with a synthetic operational overlay.
// Standalone: it imports nothing from the MMS planner, reads no planner data and never writes anywhere.
// Network discipline: nothing leaves this computer until the user presses "Włącz mapę online".
import * as maplibregl from './vendor/maplibre-gl/maplibre-gl.mjs';
import {PLACES, POLAND_BOUNDS, KINDS, ICON_NAMES, mergeOverlay, emptyBasemapStyle, syntheticPoints} from './overlay.mjs';

const $ = (id) => document.getElementById(id);
const PROVIDER = 'https://tiles.openfreemap.org';
const STYLES = {
  positron: {label: 'Positron', url: `${PROVIDER}/styles/positron`},
  liberty: {label: 'Liberty', url: `${PROVIDER}/styles/liberty`},
};

const state = {
  online: false,        // user consented and the style request was started
  styleLoaded: false,   // the provider style has been applied at least once
  style: 'positron',
  pending: false,
  errors: [],           // every map error, for the QA scripts (never sent anywhere)
  tileErrors: 0,
  styleLoads: 0,
};

function markerImage(shape, color, size = 40) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), m = size / 2, r = size / 2 - 4;
  g.beginPath();
  if (shape === 'circle') g.arc(m, m, r, 0, Math.PI * 2);
  else if (shape === 'square') { const a = r * 0.9, k = 5; g.moveTo(m - a + k, m - a); g.arcTo(m + a, m - a, m + a, m + a, k); g.arcTo(m + a, m + a, m - a, m + a, k); g.arcTo(m - a, m + a, m - a, m - a, k); g.arcTo(m - a, m - a, m + a, m - a, k); g.closePath(); }
  else { const d = r * 1.12; g.moveTo(m, m - d); g.lineTo(m + d, m); g.lineTo(m, m + d); g.lineTo(m - d, m); g.closePath(); }
  g.fillStyle = color; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
  return g.getImageData(0, 0, size, size);
}

function setStatus(text, tone = '') {
  $('status').textContent = text;
  const footer = document.querySelector('.status');
  footer.classList.toggle('warn', tone === 'warn');
  footer.classList.toggle('ok', tone === 'ok');
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = reducedMotion ? 0 : 700;

// Before consent the map is a plain background plus the overlay, so the page works and shows the points with no network at all.
const map = new maplibregl.Map({
  container: 'map',
  style: mergeOverlay(emptyBasemapStyle()),
  bounds: POLAND_BOUNDS,
  fitBoundsOptions: {padding: 24},
  minZoom: 3,          // no maxBounds on purpose: the camera is not restricted to Opole or to the synthetic points
  maxZoom: 19,
  attributionControl: {compact: false},
  fadeDuration: 150,
  canvasContextAttributes: {preserveDrawingBuffer: true}, // lets the QA scripts read pixels back from the canvas
});
map.addControl(new maplibregl.NavigationControl({visualizePitch: false}), 'top-right');
map.addControl(new maplibregl.ScaleControl({maxWidth: 140, unit: 'metric'}), 'bottom-left');

// Marker images are re-created on demand: a style change drops them, this keeps points alive across setStyle.
map.on('styleimagemissing', (event) => {
  const kind = Object.entries(KINDS).find(([name]) => name.toLowerCase() === event.id);
  if (kind && !map.hasImage(event.id)) map.addImage(event.id, markerImage(kind[1].shape, kind[1].fill), {pixelRatio: 2});
});

map.on('style.load', () => {
  state.styleLoads += 1;
  if (state.pending) { state.pending = false; state.styleLoaded = true; }
});

map.on('error', (event) => {
  const message = String(event?.error?.message ?? event?.message ?? event);
  state.errors.push({message, sourceId: event?.sourceId ?? null, tile: Boolean(event?.tile), at: Date.now()});
  if (!state.online) return;
  if (!state.styleLoaded) { unavailable(`Nie udało się pobrać stylu mapy (${message}).`); return; }
  if (event?.tile || event?.sourceId) {
    state.tileErrors += 1;
    setStatus(`Mapa online: część kafli nie wczytała się (${state.tileErrors}). Sprawdź połączenie z internetem.`, 'warn');
  }
});

map.on('idle', () => {
  if (state.online && state.styleLoaded && state.tileErrors === 0) setStatus(`Mapa online: działa · styl ${STYLES[state.style].label} · zoom ${map.getZoom().toFixed(1)}`, 'ok');
});

function unavailable(reason) {
  state.pending = false;
  state.styleLoaded = false;
  state.online = false;
  $('retry').hidden = false;
  $('consent').hidden = true;
  setStatus(`Mapa online jest niedostępna: ${reason} Punkty i trasa demonstracyjna działają lokalnie, podkład mapy nie jest wyświetlany.`, 'warn');
}

function applyStyle(name) {
  state.style = name;
  state.pending = true;
  state.tileErrors = 0;
  setStatus(`Wczytywanie stylu ${STYLES[name].label}…`);
  // transformStyle runs on the style the provider returns, so the overlay is re-added after every basemap change.
  map.setStyle(STYLES[name].url, {transformStyle: (_previous, next) => mergeOverlay(next)});
}

function enableOnline() {
  state.online = true;
  $('consent').hidden = true;
  $('retry').hidden = true;
  applyStyle(state.style);
}

$('enable-online').addEventListener('click', enableOnline);
$('retry').addEventListener('click', enableOnline);
addEventListener('offline', () => { if (state.online) setStatus('Mapa online: brak połączenia z internetem. Ostatnio wczytany podkład może być niepełny.', 'warn'); });
addEventListener('online', () => { if (state.online && state.tileErrors) { state.tileErrors = 0; map.triggerRepaint(); } });

for (const radio of document.querySelectorAll('input[name="style"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.style = radio.value;
    if (state.online) applyStyle(radio.value); // before consent only the choice is stored
  });
}

function goTo(key) {
  const place = PLACES[key];
  if (!place) return;
  if (place.bounds) map.fitBounds(place.bounds, {padding: 24, duration});
  else map.flyTo({center: place.center, zoom: place.zoom, duration});
}
for (const button of document.querySelectorAll('[data-place]')) button.addEventListener('click', () => goTo(button.dataset.place));

$('fit-points').addEventListener('click', () => {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of syntheticPoints().features.filter((f) => f.properties.route)) bounds.extend(feature.geometry.coordinates);
  map.fitBounds(bounds, {padding: 60, duration});
});

// Interaction check: clicking a point opens a popup. It keeps working after a style switch, which is the point of the test.
map.on('click', 'demo-points', (event) => {
  const feature = event.features?.[0];
  if (!feature) return;
  const {kind, seq, city, id} = feature.properties;
  const root = document.createElement('div');
  const title = document.createElement('div'); title.className = 'popup-title'; title.textContent = `${kind} · wizyta ${seq} · ${city}`;
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = `${id} — punkt syntetyczny, nie jest zleceniem.`;
  root.append(title, note);
  new maplibregl.Popup({closeButton: true, offset: 14}).setLngLat(feature.geometry.coordinates).setDOMContent(root).addTo(map);
});
map.on('mouseenter', 'demo-points', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'demo-points', () => { map.getCanvas().style.cursor = ''; });

// Read-only handle for the QA scripts; it exposes nothing that changes data.
globalThis.__map09 = {
  map,
  maplibregl,
  state,
  ICON_NAMES,
  overlayLayerPresent: () => ['demo-route-casing', 'demo-route', 'demo-points'].every((id) => Boolean(map.getLayer(id))),
  renderedPointCount: () => map.queryRenderedFeatures({layers: ['demo-points']}).length,
};
document.documentElement.dataset.mapReady = 'true';
