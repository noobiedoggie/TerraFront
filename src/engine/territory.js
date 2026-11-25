// Règles de territoire : capitales, frontières, zones d'attaque, transferts.
import { CONFIG } from '../config.js';
import { cellAt, cellCenter, cellsInRadius, distanceM, neighbors } from './grid.js';
import { setOwner, rebuildProtected } from './state.js';

export const isProtected = (state, k) => state.protected.has(k);

// Peut-on fonder une capitale ici ? (sera vérifié côté serveur en phase 2)
export function checkCapitalSpot(state, lat, lon, ignoreId = null) {
  const p = { lat, lon };
  for (const n of Object.values(state.nations)) {
    if (!n.capital || n.id === ignoreId) continue;
    if (distanceM(p, n.capital) < CONFIG.CAPITAL.minDistanceM) return { ok: false, reason: 'near', nationId: n.id };
  }
  for (const k of cellsInRadius(lat, lon, CONFIG.CAPITAL.radiusM)) {
    const o = state.cells.get(k);
    if (o !== undefined && o !== ignoreId) return { ok: false, reason: 'occupied', nationId: o };
  }
  return { ok: true };
}

export function foundCapital(state, nationId, lat, lon) {
  const check = checkCapitalSpot(state, lat, lon, nationId);
  if (!check.ok) return check;
  const n = state.nations[nationId];
  n.capital = { lat, lon, key: cellAt(lat, lon) };
  for (const k of cellsInRadius(lat, lon, CONFIG.CAPITAL.radiusM)) setOwner(state, k, nationId);
  rebuildProtected(state);
  return { ok: true };
}

// Capture d'une case libre (marche). Jamais une case possédée.
export function captureFree(state, k, owner) {
  if (state.cells.has(k)) return false;
  return setOwner(state, k, owner);
}

// Nations ayant une frontière commune avec `id`. Mémoïsé par version de territoire.
const borderMemo = new Map();
export function neighborNations(state, id) {
  const memo = borderMemo.get(id);
  if (memo && memo.version === state.version && memo.cells === state.cells) return memo.set;
  const set = new Set();
  for (const [k, o] of state.cells) {
    if (o !== id) continue;
    for (const n of neighbors(k)) {
      const other = state.cells.get(n);
      if (other !== undefined && other !== id) set.add(other);
    }
  }
  borderMemo.set(id, { version: state.version, cells: state.cells, set });
  return set;
}

export const sharesBorder = (state, a, b) => neighborNations(state, a).has(b);

// Cases du défenseur, conquérables, qui touchent l'attaquant.
export function frontCells(state, attacker, defender) {
  const out = [];
  for (const [k, o] of state.cells) {
    if (o !== defender || isProtected(state, k)) continue;
    if (neighbors(k).some((n) => state.cells.get(n) === attacker)) out.push(k);
  }
  return out;
}

// Zone disputée la plus proche du point visé, toujours sur la ligne de front.
export function attackZone(state, attacker, defender, near) {
  if (!sharesBorder(state, attacker, defender)) return { ok: false, reason: 'no-border' };
  const front = frontCells(state, attacker, defender);
  if (!front.length) return { ok: false, reason: 'protected-only' };
  let center = front[0];
  let best = Infinity;
  for (const k of front) {
    const d = distanceM(near, cellCenter(k));
    if (d < best) { best = d; center = k; }
  }
  const c = cellCenter(center);
  const keys = cellsInRadius(c.lat, c.lon, CONFIG.ATTACK.zoneRadiusM).filter(
    (k) => state.cells.get(k) === defender && !isProtected(state, k),
  );
  return { ok: true, center, keys };
}

// Transfert de cases (après bataille). Les bâtiments perdus sont détruits ; les capitales jamais.
export function transferCells(state, keys, newOwner) {
  const set = new Set(keys.filter((k) => !isProtected(state, k)));
  let cells = 0;
  for (const k of set) if (setOwner(state, k, newOwner)) cells++;
  const before = state.buildings.length;
  state.buildings = state.buildings.filter((b) => !(set.has(b.key) && b.owner !== newOwner));
  return { cells, destroyed: before - state.buildings.length };
}
