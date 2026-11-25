// Grille mondiale lat/lon. Une case ≈ CONFIG.GRID.cellSizeM de côté.
// Les lignes ont une hauteur fixe en latitude ; la largeur en longitude est
// recalculée par bande de latitude (bandDeg) pour garder des cases ~carrées.
import { CONFIG } from '../config.js';

const M_PER_DEG = 111320;
export const LAT_STEP = CONFIG.GRID.cellSizeM / M_PER_DEG;
const BAND = CONFIG.GRID.bandDeg;
const lonStepCache = new Map();

export function bandOf(row) {
  return Math.floor((row * LAT_STEP) / BAND);
}

export function lonStep(row) {
  const band = bandOf(row);
  let s = lonStepCache.get(band);
  if (s === undefined) {
    const lat = ((band + 0.5) * BAND * Math.PI) / 180;
    s = LAT_STEP / Math.max(0.05, Math.cos(lat));
    lonStepCache.set(band, s);
  }
  return s;
}

export const key = (row, col) => row + ':' + col;

export function parse(k) {
  const i = k.indexOf(':');
  return [+k.slice(0, i), +k.slice(i + 1)];
}

export function cellAt(lat, lon) {
  const row = Math.floor(lat / LAT_STEP);
  return key(row, Math.floor(lon / lonStep(row)));
}

// [ouest, sud, est, nord]
export function rowColBounds(row, col, size = 1) {
  const s = lonStep(row);
  return [col * s, row * LAT_STEP, (col + size) * s, (row + size) * LAT_STEP];
}

const centerCache = new Map();
export function cellCenter(k) {
  let c = centerCache.get(k);
  if (!c) {
    const [row, col] = parse(k);
    c = { lat: (row + 0.5) * LAT_STEP, lon: (col + 0.5) * lonStep(row) };
    if (centerCache.size > 200000) centerCache.clear();
    centerCache.set(k, c);
  }
  return c;
}

// 4 voisins. Entre deux bandes, le voisin est la case qui contient le centre.
export function neighbors(k) {
  const [row, col] = parse(k);
  const out = [key(row, col - 1), key(row, col + 1)];
  for (const r of [row - 1, row + 1]) {
    if (bandOf(r) === bandOf(row)) out.push(key(r, col));
    else out.push(key(r, Math.floor(((col + 0.5) * lonStep(row)) / lonStep(r))));
  }
  return out;
}

// shortcut: approximation équirectangulaire, exacte à <0,1 % sous 10 km ; ignore l'antiméridien.
export function distanceM(a, b) {
  const x = (b.lon - a.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * M_PER_DEG;
}

export function offsetLatLon(lat, lon, eastM, northM) {
  return {
    lat: lat + northM / M_PER_DEG,
    lon: lon + eastM / (M_PER_DEG * Math.max(0.05, Math.cos((lat * Math.PI) / 180))),
  };
}

// Vecteur en mètres (est, nord) de a vers b.
export function vectorM(a, b) {
  return {
    x: (b.lon - a.lon) * M_PER_DEG * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180),
    y: (b.lat - a.lat) * M_PER_DEG,
  };
}

// Toutes les cases dont le centre est à moins de radiusM.
export function cellsInRadius(lat, lon, radiusM) {
  const out = [];
  const p = { lat, lon };
  const r0 = Math.floor((lat - radiusM / M_PER_DEG) / LAT_STEP);
  const r1 = Math.floor((lat + radiusM / M_PER_DEG) / LAT_STEP);
  const dLon = radiusM / (M_PER_DEG * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  for (let row = r0; row <= r1; row++) {
    const s = lonStep(row);
    for (let col = Math.floor((lon - dLon) / s); col <= Math.floor((lon + dLon) / s); col++) {
      const k = key(row, col);
      if (distanceM(p, cellCenter(k)) <= radiusM) out.push(k);
    }
  }
  return out;
}

// Hachage déterministe (FNV-1a) et générateur pseudo-aléatoire (mulberry32).
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
