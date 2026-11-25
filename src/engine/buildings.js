// Bâtiments data-driven : tout vient de CONFIG.BUILDINGS.
import { CONFIG } from '../config.js';
import { cellCenter } from './grid.js';
import { newId } from './state.js';

export const buildingTypes = () => Object.keys(CONFIG.BUILDINGS);
export const def = (type) => CONFIG.BUILDINGS[type];
export const stats = (b) => def(b.type).levels[b.level - 1];
export const maxLevel = (type) => def(type).levels.length;

export function buildCost(nation, type) {
  const c = def(type).cost;
  return Math.round(c.base * c.growth ** (nation.purchases[type] || 0));
}

export function upgradeCost(b) {
  if (b.level >= maxLevel(b.type)) return null;
  const u = def(b.type).upgrade;
  return Math.round(u.base * u.growth ** (b.level - 1));
}

export const buildingAt = (state, k) => state.buildings.find((b) => b.key === k);

export function canBuild(state, nationId, type, k) {
  const n = state.nations[nationId];
  if (!def(type)) return { ok: false, reason: 'Type de bâtiment inconnu.' };
  if (state.cells.get(k) !== nationId) return { ok: false, reason: 'Choisissez une case de votre territoire.' };
  if (n.capital?.key === k) return { ok: false, reason: 'Cette case accueille déjà votre capitale.' };
  if (buildingAt(state, k)) return { ok: false, reason: 'Cette case a déjà un bâtiment.' };
  const cost = buildCost(n, type);
  if (n.coins < cost) return { ok: false, reason: `Il vous manque ${Math.ceil(cost - n.coins)} pièces.` };
  return { ok: true, cost };
}

export function build(state, nationId, type, k) {
  const check = canBuild(state, nationId, type, k);
  if (!check.ok) return check;
  const n = state.nations[nationId];
  n.coins -= check.cost;
  n.purchases[type] = (n.purchases[type] || 0) + 1;
  const c = cellCenter(k);
  const b = { id: newId(state, 'b'), type, level: 1, key: k, owner: nationId, lat: c.lat, lon: c.lon, progress: 0 };
  state.buildings.push(b);
  return { ok: true, building: b };
}

export function upgrade(state, buildingId) {
  const b = state.buildings.find((x) => x.id === buildingId);
  if (!b) return { ok: false, reason: 'Bâtiment introuvable.' };
  const cost = upgradeCost(b);
  if (cost === null) return { ok: false, reason: 'Niveau maximum atteint.' };
  const n = state.nations[b.owner];
  if (n.coins < cost) return { ok: false, reason: `Il vous manque ${Math.ceil(cost - n.coins)} pièces.` };
  n.coins -= cost;
  b.level++;
  return { ok: true, building: b };
}

// Production cumulée d'une nation (capitale + bâtiments).
export function rates(state, nationId) {
  const n = state.nations[nationId];
  const r = n.kind === 'npc'
    ? { coinsPerMin: 0, troopsPerMin: 0, troopCap: 0 }
    : { coinsPerMin: CONFIG.CAPITAL.coinsPerMin, troopsPerMin: CONFIG.CAPITAL.troopsPerMin, troopCap: CONFIG.CAPITAL.troopCap };
  for (const b of state.buildings) {
    if (b.owner !== nationId) continue;
    const s = stats(b);
    r.coinsPerMin += s.coinsPerMin || 0;
    r.troopsPerMin += s.troopsPerMin || 0;
    r.troopCap += s.troopCap || 0;
  }
  return r;
}
