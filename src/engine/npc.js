// Nations contrôlées par l'ordinateur : apparition, croissance, défense, attaques.
import { CONFIG } from '../config.js';
import { cellCenter, distanceM, hash, rng } from './grid.js';
import { createNation, removeNation } from './state.js';
import { attackZone, checkCapitalSpot, foundCapital, neighborNations } from './territory.js';
import { expand, runExpansion } from './expansion.js';

const T = CONFIG.NPC;
export const difficulty = () => T.difficulties[T.difficulty] || T.difficulties.normal;
export const npcTroopCap = () => T.troopCap * difficulty().troops;

function pickUnique(list, used, r) {
  let i = Math.floor(r() * list.length);
  for (let n = 0; n < list.length && used.has(list[i]); n++) i = (i + 1) % list.length;
  used.add(list[i]);
  return list[i];
}

// Génère les nations autour d'un point (tuiles déterministes). Remplace les NPC existants.
export function seedNpcs(state, lat, lon, isWater = () => false) {
  for (const n of Object.values(state.nations)) if (n.kind === 'npc') removeNation(state, n.id);
  const tileLat = (T.tileKm * 1000) / 111320;
  const tileLon = tileLat / Math.cos(((Math.floor(lat) + 0.5) * Math.PI) / 180);
  const tr = Math.floor(lat / tileLat);
  const tc = Math.floor(lon / tileLon);
  const names = new Set();
  const colors = new Set();
  const created = [];
  for (let dr = -T.seedRadiusTiles; dr <= T.seedRadiusTiles; dr++) {
    for (let dc = -T.seedRadiusTiles; dc <= T.seedRadiusTiles; dc++) {
      const r = rng(hash(`npc:${tr + dr}:${tc + dc}`));
      if (r() > T.spawnChance) continue;
      const p = { lat: (tr + dr + 0.2 + 0.6 * r()) * tileLat, lon: (tc + dc + 0.2 + 0.6 * r()) * tileLon };
      if (distanceM({ lat, lon }, p) < T.clearRadiusM || isWater(p.lat, p.lon)) continue;
      if (!checkCapitalSpot(state, p.lat, p.lon).ok) continue; // jamais sur une capitale existante
      const id = `npc_${tr + dr}_${tc + dc}`;
      const n = createNation(id, 'npc', pickUnique(T.names, names, r), pickUnique(T.colors, colors, r), {
        troops: Math.round(T.startTroops * difficulty().troops),
      });
      state.nations[id] = n;
      foundCapital(state, id, p.lat, p.lon);
      expand(state, id, n.capital.key, T.startRadiusM, 10000);
      created.push(n);
    }
  }
  return created;
}

// Croissance des NPC (même rythme en ligne et hors ligne).
export function npcTick(state, dtS) {
  const d = difficulty();
  const taken = [];
  for (const n of Object.values(state.nations)) {
    if (n.kind !== 'npc' || !n.capital) continue;
    n.troops = Math.min(npcTroopCap(), n.troops + (T.troopsPerMin * d.troops * dtS) / 60);
    taken.push(...runExpansion(state, n.id, n.capital.key, n, T.cellsPerHour * d.expand, T.maxRadiusM, dtS));
  }
  return taken;
}

// Décision d'attaque (uniquement appli ouverte). Renvoie au plus une intention.
export function npcAttackIntent(state, now, dtS, random = Math.random) {
  const A = T.attack;
  state.npcClock += dtS;
  if (state.npcClock < A.checkEveryMin * 60) return null;
  state.npcClock = 0;
  if (now - state.lastNpcAttackAt < A.cooldownMin * 60000) return null;
  const npcs = Object.values(state.nations).filter((n) => n.kind === 'npc' && n.capital && n.troops >= A.minTroops);
  for (const n of npcs.sort(() => random() - 0.5)) {
    if (random() > A.chance * difficulty().aggression) continue;
    let target = null;
    for (const id of neighborNations(state, n.id)) {
      const t = state.nations[id];
      if (!t || t.troops * A.strengthRatio > n.troops) continue;
      if (!target || t.troops < target.troops) target = t;
    }
    if (!target) continue;
    const zone = attackZone(state, n.id, target.id, cellCenter(n.capital.key));
    if (!zone.ok || !zone.keys.length) continue;
    state.lastNpcAttackAt = now;
    return { attackerId: n.id, defenderId: target.id, zone, troops: Math.floor(n.troops * A.commitRatio) };
  }
  return null;
}

export const npcDefenders = (n) => Math.floor(n.troops * T.defendRatio);
