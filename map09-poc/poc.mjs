// MAP-09 PoC: whole-Poland vector basemap (OpenFreeMap) with a synthetic operational overlay.
// Standalone: it imports nothing from the MMS planner, reads no planner data and never writes anywhere.
// Network discipline: nothing leaves this computer until the user presses "Włącz mapę online".
import * as maplibregl from './vendor/maplibre-gl/maplibre-gl.mjs';
import {PLACES, POLAND_BOUNDS, KINDS, ICON_PREFIX, ICON_NAMES, mergeOverlay, emptyBasemapStyle, syntheticPoints} from './overlay.mjs';

const $ = (id) => document.getElementById(id);
const PROVIDER = 'https://tiles.openfreemap.org';
const STYLES = {
  positron: {label: 'Positron', url: `${PROVIDER}/styles/positron`},
  liberty: {label: 'Liberty', url: `${PROVIDER}/styles/liberty`},
};
const STYLE_TIMEOUT_MS = Number(new URLSearchParams(location.search).get('styleTimeoutMs')) || 20000;

const state = {
  online: false,        // the user consented; from now on style/tile requests are made
  active: null,         // the provider style actually applied to the map (null = local background only)
  requested: 'positron', // the style the user asked for last
  pending: false,       // a style transaction is in flight
  failed: null,         // name of the style whose last load failed (drives "Spróbuj ponownie")
  errors: [],           // every map error, for the QA scripts (never sent anywhere)
  tileErrors: 0,
  styleLoads: 0,
  get styleLoaded() { return this.active !== null; },
  get style() { return this.requested; },
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
const checkedRadio = () => document.querySelector('input[name="style"]:checked');
const radioFor = (name) => document.querySelector(`input[name="style"][value="${name}"]`);

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
// Ids carry a prefix so they can never collide with images from a provider sprite.
map.on('styleimagemissing', (event) => {
  if (!event.id.startsWith(ICON_PREFIX)) return;
  const kind = Object.entries(KINDS).find(([name]) => `${ICON_PREFIX}${name.toLowerCase()}` === event.id);
  if (kind && !map.hasImage(event.id)) map.addImage(event.id, markerImage(kind[1].shape, kind[1].fill), {pixelRatio: 2});
});

map.on('style.load', () => { state.styleLoads += 1; });

map.on('error', (event) => {
  const message = String(event?.error?.message ?? event?.message ?? event);
  state.errors.push({message, sourceId: event?.sourceId ?? null, tile: Boolean(event?.tile), at: Date.now()});
  if (state.online && state.active && (event?.tile || event?.sourceId)) {
    state.tileErrors += 1;
    setStatus(`Mapa online: część kafli nie wczytała się (${state.tileErrors}). Sprawdź połączenie z internetem.`, 'warn');
  }
});

map.on('idle', () => {
  if (state.online && state.active && !state.pending && state.failed === null && state.tileErrors === 0) {
    setStatus(`Mapa online: działa · styl ${STYLES[state.active].label} · zoom ${map.getZoom().toFixed(1)}`, 'ok');
  }
});

// ---- One owner for style changes. Every change gets a number; only the newest request may touch state or the map. ----
let sequence = 0;
let inflight = null;

function failStyle(name, reason) {
  state.pending = false;
  state.failed = name;
  $('retry').hidden = false;
  if (state.active) {
    // Keep the last good style; make the radio say what is really on the map.
    state.requested = state.active;
    radioFor(state.active).checked = true;
    setStatus(`Nie udało się wczytać stylu ${STYLES[name].label} (${reason}). Nadal wyświetlany jest styl ${STYLES[state.active].label}.`, 'warn');
  } else {
    setStatus(`Mapa online jest niedostępna: ${reason}. Punkty i trasa demonstracyjna działają lokalnie, podkład mapy nie jest wyświetlany.`, 'warn');
  }
  $('retry').focus();
}

async function applyStyle(name) {
  const id = ++sequence;
  inflight?.abort();
  const mine = new AbortController();
  inflight = mine;
  const timer = setTimeout(() => mine.abort(new Error('timeout')), STYLE_TIMEOUT_MS);
  state.requested = name;
  state.pending = true;
  state.failed = null;
  state.tileErrors = 0;
  $('retry').hidden = true;
  setStatus(`Wczytywanie stylu ${STYLES[name].label}…`);

  let style;
  try {
    const response = await fetch(STYLES[name].url, {signal: mine.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    style = await response.json();
    if (!style || style.version !== 8 || !Array.isArray(style.layers) || typeof style.sources !== 'object') throw new Error('niepoprawny styl');
  } catch (error) {
    clearTimeout(timer);
    if (id !== sequence) return; // superseded: the newer request owns the state
    const timedOut = mine.signal.aborted && mine.signal.reason?.message === 'timeout';
    failStyle(name, timedOut ? 'przekroczono czas oczekiwania' : String(error?.message ?? error));
    return;
  }
  clearTimeout(timer);
  if (id !== sequence) return;

  try {
    await new Promise((resolve, reject) => {
      const onError = (event) => { if (!event?.tile && !event?.sourceId) { cleanup(); reject(event?.error ?? new Error('błąd stylu')); } };
      const onLoad = () => { cleanup(); resolve(); };
      const cleanup = () => { map.off('error', onError); map.off('style.load', onLoad); };
      map.on('error', onError);
      map.on('style.load', onLoad);
      map.setStyle(mergeOverlay(style), {diff: false}); // full replace: no diff race, style.load always follows
    });
  } catch (error) {
    if (id !== sequence) return;
    // The map is in an unknown state after a rejected style; go back to the local background + overlay.
    state.active = null;
    map.setStyle(mergeOverlay(emptyBasemapStyle()), {diff: false});
    failStyle(name, String(error?.message ?? error));
    return;
  }
  if (id !== sequence) return;
  state.active = name;
  state.pending = false;
  state.requested = name;
  radioFor(name).checked = true;
  setStatus(`Mapa online: styl ${STYLES[name].label} wczytany.`, 'ok');
}

function enableOnline() {
  state.online = true;
  $('consent').hidden = true;
  $('retry').hidden = true;
  applyStyle(checkedRadio().value);
  checkedRadio().focus();
}

$('enable-online').addEventListener('click', enableOnline);
$('retry').addEventListener('click', () => {
  state.online = true;
  $('retry').hidden = true;
  applyStyle(state.failed ?? checkedRadio().value);
  checkedRadio().focus();
});
addEventListener('offline', () => { if (state.online && state.active) setStatus('Mapa online: brak połączenia z internetem. Ostatnio wczytany podkład może być niepełny.', 'warn'); });
addEventListener('online', () => { if (state.online && state.tileErrors) { state.tileErrors = 0; map.triggerRepaint(); } });

for (const radio of document.querySelectorAll('input[name="style"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.requested = radio.value;
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

// Popup for a visit: opened by clicking the point on the map or by choosing it in the keyboard-friendly list.
function openPopup(properties, coordinates) {
  const {kind, seq, city, id} = properties;
  const root = document.createElement('div');
  const title = document.createElement('div'); title.className = 'popup-title'; title.textContent = `${kind} · wizyta ${seq} · ${city}`;
  const note = document.createElement('div'); note.className = 'popup-note'; note.textContent = `${id} — punkt syntetyczny, nie jest zleceniem.`;
  root.append(title, note);
  new maplibregl.Popup({closeButton: true, offset: 14}).setLngLat(coordinates).setDOMContent(root).addTo(map);
}
map.on('click', 'demo-points', (event) => {
  const feature = event.features?.[0];
  if (feature) openPopup(feature.properties, feature.geometry.coordinates);
});
map.on('mouseenter', 'demo-points', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'demo-points', () => { map.getCanvas().style.cursor = ''; });

const picker = $('point-pick');
for (const feature of syntheticPoints().features) {
  const option = document.createElement('option');
  option.value = feature.properties.id;
  option.textContent = `${feature.properties.kind} · ${feature.properties.city} · wizyta ${feature.properties.seq}`;
  picker.append(option);
}
picker.addEventListener('change', () => {
  const feature = syntheticPoints().features.find((f) => f.properties.id === picker.value);
  picker.value = '';
  if (!feature) return;
  map.flyTo({center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 14), duration});
  openPopup(feature.properties, feature.geometry.coordinates);
});

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
