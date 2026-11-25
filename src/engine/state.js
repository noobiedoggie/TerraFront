// Modèle de données du jeu : objet simple, sérialisable, sans UI ni stockage.
import { CONFIG } from '../config.js';
import { cellsInRadius } from './grid.js';

export const STATE_VERSION = 1;

export function createState(now) {
  return {
    v: STATE_VERSION,
    createdAt: now,
    lastTick: now,
    me: null,
    nations: {},
    cells: new Map(), // clé de case → id de nation
    protected: new Map(), // clé de case → id de nation (zones de capitale, recalculées)
    buildings: [],
    nextId: 1,
    flags: { safetyAck: false, firstBuildDone: false, tutorialDone: false },
    sim: { enabled: false },
    npcClock: 0,
    lastNpcAttackAt: 0,
    version: 0, // incrémenté à chaque changement de territoire (pour le rendu)
  };
}

export function createNation(id, kind, name, color, extra = {}) {
  return {
    id, kind, name, color,
    capital: null,
    coins: 0,
    troops: 0,
    cellCount: 0,
    purchases: {},
    lastActive: null,
    progress: 0, // expansion automatique (NPC)
    ...extra,
  };
}

export function newId(state, prefix) {
  return prefix + (state.nextId++).toString(36);
}

export function setOwner(state, k, owner) {
  const prev = state.cells.get(k);
  if (prev === owner) return false;
  if (prev !== undefined && state.nations[prev]) state.nations[prev].cellCount--;
  if (owner == null) state.cells.delete(k);
  else {
    state.cells.set(k, owner);
    state.nations[owner].cellCount++;
  }
  state.version++;
  return true;
}

export function rebuildProtected(state) {
  state.protected.clear();
  for (const n of Object.values(state.nations)) {
    if (!n.capital) continue;
    for (const k of cellsInRadius(n.capital.lat, n.capital.lon, CONFIG.CAPITAL.radiusM)) state.protected.set(k, n.id);
  }
}

export function removeNation(state, id) {
  for (const [k, o] of state.cells) if (o === id) state.cells.delete(k);
  state.buildings = state.buildings.filter((b) => b.owner !== id);
  delete state.nations[id];
  rebuildProtected(state);
  state.version++;
}

export function serialize(state) {
  const cells = {};
  for (const [k, o] of state.cells) (cells[o] ??= []).push(k);
  for (const o in cells) cells[o] = cells[o].join(',');
  const { protected: _p, cells: _c, version: _v, ...rest } = state;
  return JSON.stringify({ ...rest, cells });
}

export function deserialize(json) {
  const raw = JSON.parse(json);
  if (raw.v !== STATE_VERSION) throw new Error('Version de sauvegarde inconnue');
  const state = { ...createState(raw.createdAt), ...raw, cells: new Map(), protected: new Map(), version: 0 };
  for (const n of Object.values(state.nations)) n.cellCount = 0;
  for (const [o, list] of Object.entries(raw.cells || {})) {
    if (!state.nations[o] || !list) continue;
    const keys = list.split(',');
    for (const k of keys) state.cells.set(k, o);
    state.nations[o].cellCount = keys.length;
  }
  rebuildProtected(state);
  return state;
}
