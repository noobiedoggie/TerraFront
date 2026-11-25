// Carte MapLibre stylée « carte de stratégie » + rendu des territoires (GeoJSON limité à la zone visible).
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONFIG } from '../config.js';
import { LAT_STEP, cellCenter, key, lonStep, neighbors, offsetLatLon, parse, rowColBounds } from '../engine/grid.js';
import { displayPosition } from '../engine/privacy.js';
import { def } from '../engine/buildings.js';
import { icon } from './icons.js';
import { esc } from './kit.js';

const BG = '#0d1219';
const FALLBACK_STYLE = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': BG } }] };
const EMPTY = { type: 'FeatureCollection', features: [] };

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// Fond sombre, désaturé, sans points d'intérêt : on garde le relief urbain, on efface le bruit.
function restyle(style) {
  style.layers = style.layers.filter((l) => {
    const id = l.id.toLowerCase();
    return !(l.type === 'symbol' && /poi|housenum|aeroway|aerodrome|transit|rail|station|shield|oneway/.test(id)) && l.type !== 'fill-extrusion';
  });
  for (const l of style.layers) {
    try {
      const p = (l.paint ||= {});
      const id = l.id.toLowerCase();
      const sl = (l['source-layer'] || '').toLowerCase();
      if (l.type === 'background') p['background-color'] = BG;
      else if (l.type === 'fill') {
        delete p['fill-pattern'];
        delete p['fill-outline-color'];
        if (sl === 'water' || id.includes('water')) p['fill-color'] = '#09141f';
        else if (sl === 'park' || /park|wood|forest|grass|scrub/.test(id)) p['fill-color'] = '#0f1a18';
        else if (sl === 'building' || id.includes('building')) p['fill-color'] = '#141b25';
        else p['fill-color'] = '#0f151d';
      } else if (l.type === 'line') {
        delete p['line-pattern'];
        if (sl === 'waterway' || id.includes('water')) p['line-color'] = '#0b1928';
        else if (sl === 'boundary' || id.includes('boundary')) p['line-color'] = '#3b4557';
        else if (/motorway|trunk|primary|major/.test(id)) p['line-color'] = '#263142';
        else p['line-color'] = '#1b2330';
      } else if (l.type === 'symbol') {
        const place = sl === 'place' || /place|country|city|town|village|continent/.test(id);
        p['text-color'] = place ? '#8f9aac' : '#5e697a';
        p['text-halo-color'] = BG;
        p['text-halo-width'] = 1.2;
        delete p['icon-color'];
        if (l.layout) delete l.layout['icon-image'];
      }
    } catch {
      // couche atypique : laissée telle quelle
    }
  }
  return style;
}

async function loadStyle() {
  const r = await fetch(CONFIG.MAP.styleUrl, { signal: timeoutSignal(8000) });
  if (!r.ok) throw new Error('style HTTP ' + r.status);
  return restyle(await r.json());
}

export function circleRing(lat, lon, r, n = 48) {
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = offsetLatLon(lat, lon, Math.cos(a) * r, Math.sin(a) * r);
    ring.push([p.lon, p.lat]);
  }
  return ring;
}

export function cellsPolygon(keys) {
  return keys.map((k) => {
    const [r, c] = parse(k);
    const [w, s, e, n] = rowColBounds(r, c);
    return [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  });
}

const WIDTH = ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 2, 19, 3.5];
const OFFSET = ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1, 19, 1.75];

export class GameMap {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    this.handlers = {};
    this.markers = new Map();
    this.offline = false;
    this.waterLayers = [];
    this.raf = null;
  }

  on(e, fn) {
    (this.handlers[e] ??= []).push(fn);
  }

  emit(e, d) {
    this.handlers[e]?.forEach((fn) => fn(d));
  }

  async init() {
    let style;
    try {
      style = await loadStyle();
    } catch {
      style = FALLBACK_STYLE;
      this.offline = true;
    }
    const m = (this.map = new maplibregl.Map({
      container: this.container,
      style,
      center: [2.35, 30],
      zoom: CONFIG.MAP.worldZoom,
      maxZoom: CONFIG.MAP.maxZoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 0,
    }));
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    m.on('style.load', () => this.addLayers());
    m.on('error', (e) => console.warn('Carte :', e?.error?.message || e));
    m.on('moveend', () => {
      this.zoomClass();
      this.render();
    });
    m.on('click', (e) => this.emit('click', { lat: e.lngLat.lat, lon: e.lngLat.lng }));
    await new Promise((res) => (m.loaded() ? res() : m.once('load', res)));
    this.zoomClass();
  }

  async retryStyle() {
    try {
      this.map.setStyle(await loadStyle());
      this.offline = false;
      return true;
    } catch {
      return false;
    }
  }

  addLayers() {
    const m = this.map;
    this.waterLayers = m.getStyle().layers.filter((l) => l.type === 'fill' && (l['source-layer'] === 'water' || l.id.includes('water'))).map((l) => l.id);
    for (const id of ['grid', 'territory', 'protected', 'borders', 'radius', 'highlight']) {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: EMPTY, tolerance: 0.2 });
    }
    const add = (layer) => !m.getLayer(layer.id) && m.addLayer(layer);
    add({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 16.4, 0, 17.5, 0.05] } });
    add({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'o'], 'fill-antialias': false } });
    add({ id: 'protected-line', type: 'line', source: 'protected', paint: { 'line-color': '#ffffff', 'line-opacity': 0.4, 'line-width': 1.2, 'line-dasharray': [2, 2] } });
    add({ id: 'territory-border', type: 'line', source: 'borders', layout: { 'line-cap': 'square' }, paint: { 'line-color': ['get', 'color'], 'line-width': WIDTH, 'line-offset': OFFSET, 'line-opacity': 0.95 } });
    add({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': 0.85 } });
    add({ id: 'highlight-fill', type: 'fill', source: 'highlight', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } });
    add({ id: 'highlight-line', type: 'line', source: 'highlight', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [1.5, 1.2] } });
    this.render();
  }

  zoomClass() {
    const z = this.map.getZoom();
    this.container.classList.toggle('z-far', z < 14.8);
    this.container.classList.toggle('z-world', z < 11);
  }

  // ── Territoires ──
  render() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.draw();
    });
  }

  draw() {
    const m = this.map;
    const st = this.game.state;
    if (!st || !m.getSource('territory')) return;
    const b = m.getBounds();
    const [w0, e0, s0, n0] = [b.getWest(), b.getEast(), b.getSouth(), b.getNorth()];
    const pw = (e0 - w0) / 2;
    const ph = (n0 - s0) / 2;
    const lat = m.getCenter().lat;
    const mpp = (40075016.7 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom());
    const cellPx = CONFIG.GRID.cellSizeM / mpp;
    let f = 1; // niveau de détail : on regroupe les cases quand elles deviennent minuscules
    while (cellPx * f < 2.5 && f < 256) f *= 2;

    const cells = new Map();
    for (const [k, o] of st.cells) {
      const c = cellCenter(k);
      if (c.lat < s0 - ph || c.lat > n0 + ph || c.lon < w0 - pw || c.lon > e0 + pw) continue;
      if (f === 1) cells.set(k, o);
      else {
        const [r, cc] = parse(k);
        const ak = key(Math.floor(r / f), Math.floor(cc / f));
        if (!cells.has(ak)) cells.set(ak, o);
      }
    }

    const polys = {};
    const segs = {};
    const prot = [];
    const ownerOf = f === 1 ? (k) => st.cells.get(k) : (k) => cells.get(k);
    for (const [k, o] of cells) {
      const [r, c] = parse(k);
      const [w, s, e, n] = rowColBounds(r * f, c * f, f);
      const isProt = f === 1 && st.protected.get(k) === o;
      (polys[isProt ? o + '|p' : o] ??= []).push([[[w, s], [e, s], [e, n], [w, n], [w, s]]]);
      // voisins : ouest, est, sud, nord. Segments orientés en sens horaire (intérieur à droite).
      const nb = f === 1 ? neighbors(k) : [key(r, c - 1), key(r, c + 1), key(r - 1, c), key(r + 1, c)];
      const L = (segs[o] ??= []);
      if (ownerOf(nb[3]) !== o) L.push([[w, n], [e, n]]);
      if (ownerOf(nb[1]) !== o) L.push([[e, n], [e, s]]);
      if (ownerOf(nb[2]) !== o) L.push([[e, s], [w, s]]);
      if (ownerOf(nb[0]) !== o) L.push([[w, s], [w, n]]);
      if (isProt) {
        const p = (x) => st.protected.get(x) === o;
        if (!p(nb[3])) prot.push([[w, n], [e, n]]);
        if (!p(nb[1])) prot.push([[e, n], [e, s]]);
        if (!p(nb[2])) prot.push([[e, s], [w, s]]);
        if (!p(nb[0])) prot.push([[w, s], [w, n]]);
      }
    }
    const color = (o) => st.nations[o]?.color || '#888';
    m.getSource('territory').setData({
      type: 'FeatureCollection',
      features: Object.entries(polys).map(([pk, rings]) => {
        const [o, p] = pk.split('|');
        return { type: 'Feature', properties: { color: color(o), o: (o === st.me ? 0.4 : 0.32) + (p ? 0.12 : 0) }, geometry: { type: 'MultiPolygon', coordinates: rings } };
      }),
    });
    m.getSource('borders').setData({
      type: 'FeatureCollection',
      features: Object.entries(segs).map(([o, L]) => ({ type: 'Feature', properties: { color: color(o) }, geometry: { type: 'MultiLineString', coordinates: L } })),
    });
    m.getSource('protected').setData({ type: 'FeatureCollection', features: prot.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: prot } }] : [] });

    // Quadrillage discret quand les cases sont assez grandes à l'écran
    const lines = [];
    if (cellPx >= 12) {
      const r0 = Math.floor(s0 / LAT_STEP);
      const r1 = Math.ceil(n0 / LAT_STEP);
      for (let r = r0; r <= r1; r++) lines.push([[w0, r * LAT_STEP], [e0, r * LAT_STEP]]);
      const s = lonStep(Math.floor(lat / LAT_STEP));
      for (let c = Math.floor(w0 / s); c <= Math.ceil(e0 / s); c++) lines.push([[c * s, s0], [c * s, n0]]);
    }
    m.getSource('grid').setData({ type: 'FeatureCollection', features: lines.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }] : [] });
  }

  // ── Marqueurs (capitales, bâtiments) ──
  renderMarkers() {
    const st = this.game.state;
    const want = new Set();
    for (const n of Object.values(st.nations)) {
      if (!n.capital) continue;
      const id = 'c:' + n.id;
      want.add(id);
      const pos = displayPosition(st, n.id, id, n.capital.lat, n.capital.lon);
      const sig = n.name + n.color;
      this.upsert(id, pos, sig, () =>
        `<div class="mk mk-capital ${n.id === st.me ? 'is-me' : ''}" style="--c:${n.color}"><div class="mk-emblem">${icon('capital', 15)}</div><div class="mk-label">${esc(n.name)}</div></div>`,
        { kind: 'capital', id: n.id });
    }
    for (const b of st.buildings) {
      const id = 'b:' + b.id;
      want.add(id);
      const owner = st.nations[b.owner];
      const pos = displayPosition(st, b.owner, id, b.lat, b.lon);
      this.upsert(id, pos, b.level + owner.color, () =>
        `<div class="mk mk-building" style="--c:${owner.color}">${icon(def(b.type).icon, 16)}<span class="mk-lvl">${b.level}</span></div>`,
        { kind: 'building', id: b.id });
    }
    for (const [id, mk] of this.markers) {
      if (!want.has(id)) {
        mk.marker.remove();
        this.markers.delete(id);
      }
    }
  }

  upsert(id, pos, sig, html, payload) {
    let mk = this.markers.get(id);
    if (mk && mk.sig !== sig) {
      mk.marker.remove();
      this.markers.delete(id);
      mk = null;
    }
    if (!mk) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html().trim();
      const elm = tpl.content.firstElementChild;
      elm.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = this.container.getBoundingClientRect();
        const ll = this.map.unproject([e.clientX - r.left, e.clientY - r.top]);
        this.emit('marker', { ...payload, lat: ll.lat, lon: ll.lng });
      });
      const marker = new maplibregl.Marker({ element: elm, anchor: 'center' }).setLngLat([pos.lon, pos.lat]).addTo(this.map);
      this.markers.set(id, { marker, sig });
    } else mk.marker.setLngLat([pos.lon, pos.lat]);
  }

  // ── Position du joueur ──
  setPosition(p, sim, color) {
    if (!this.posMarker) {
      const elm = document.createElement('div');
      elm.className = 'me-pos';
      elm.innerHTML = '<span class="me-pulse"></span><span class="me-dot"></span>';
      this.posMarker = new maplibregl.Marker({ element: elm, anchor: 'center' });
      this.posMarker.setLngLat([p.lon, p.lat]).addTo(this.map);
    }
    const elm = this.posMarker.getElement();
    elm.classList.toggle('sim', !!sim);
    elm.style.setProperty('--c', color);
    this.posMarker.setLngLat([p.lon, p.lat]);
  }

  // ── Repères temporaires ──
  setHighlight(features = []) {
    this.map.getSource('highlight')?.setData({ type: 'FeatureCollection', features });
  }

  setRadius(lat, lon, r, color) {
    this.map.getSource('radius')?.setData(lat == null ? EMPTY : {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: circleRing(lat, lon, r) } }],
    });
  }

  setPin(lat, lon, color) {
    if (lat == null) {
      this.pin?.remove();
      this.pin = null;
      this.setHighlight();
      return;
    }
    if (!this.pin) {
      const elm = document.createElement('div');
      elm.className = 'pin';
      elm.innerHTML = `<div class="pin-head">${icon('capital', 18)}</div><div class="pin-stem"></div>`;
      this.pin = new maplibregl.Marker({ element: elm, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(this.map);
    }
    this.pin.getElement().style.setProperty('--c', color);
    this.pin.setLngLat([lon, lat]);
    this.setHighlight([{ type: 'Feature', properties: { color }, geometry: { type: 'Polygon', coordinates: [circleRing(lat, lon, CONFIG.CAPITAL.radiusM)] } }]);
  }

  flyTo(lat, lon, zoom, duration = 1600) {
    return new Promise((res) => {
      const done = () => res();
      this.map.once('moveend', done);
      this.map.flyTo({ center: [lon, lat], zoom: zoom ?? this.map.getZoom(), duration, essential: true });
      setTimeout(done, duration + 800);
    });
  }

  idle(ms = 4000) {
    return new Promise((res) => {
      this.map.once('idle', res);
      setTimeout(res, ms);
    });
  }

  isWater(lat, lon) {
    if (!this.waterLayers.length) return false;
    const pt = this.map.project([lon, lat]);
    const c = this.map.getCanvas();
    if (pt.x < 0 || pt.y < 0 || pt.x > c.clientWidth || pt.y > c.clientHeight) return false;
    return this.map.queryRenderedFeatures(pt, { layers: this.waterLayers }).length > 0;
  }
}
