// Validation des positions GPS (anti-triche) et cases traversées.
import { CONFIG } from '../config.js';
import { cellAt, distanceM } from './grid.js';

const G = CONFIG.GPS;

// p = { lat, lon, accuracy (m), speed (m/s ou null), time (ms) } ; prev = dernier point reçu.
export function validatePoint(prev, p) {
  if (!(p.accuracy <= G.maxAccuracyM)) return { ok: false, reason: 'accuracy' };
  let speed = p.speed > 0 ? p.speed : 0;
  if (prev && p.time - prev.time >= 1000) speed = Math.max(speed, distanceM(prev, p) / ((p.time - prev.time) / 1000));
  if (speed * 3.6 > G.maxSpeedKmh) return { ok: false, reason: 'speed', speedKmh: speed * 3.6 };
  return { ok: true };
}

// Cases entre deux points valides consécutifs (comble les trous si proches).
export function pathCells(a, b) {
  if (!a) return [cellAt(b.lat, b.lon)];
  const d = distanceM(a, b);
  if (d > G.interpolateMaxM) return [cellAt(b.lat, b.lon)];
  const steps = Math.max(1, Math.ceil(d / G.stepM));
  const out = new Set();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.add(cellAt(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t));
  }
  return [...out];
}
