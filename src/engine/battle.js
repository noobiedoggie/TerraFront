// Simulation de bataille tactique (pure, déterministe, sans rendu).
// Repère local en mètres : x vers la droite, y vers le bas ; l'attaquant arrive par le bas (+y).
// La zone disputée est un cercle centré en (0, 0).
import { CONFIG } from '../config.js';
import { cellCenter, cellsInRadius, parse, rowColBounds, vectorM } from './grid.js';

const B = CONFIG.BATTLE;
const DEG = Math.PI / 180;
const HALF = B.fieldM / 2;
export const OBJECTIVE_R = CONFIG.ATTACK.zoneRadiusM;

export const groupRadius = (t) => B.radiusBase + Math.sqrt(Math.max(0, t)) * B.radiusPerSqrtTroop;
const angleDiff = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

// Terrain : les vraies cases autour de la zone, tournées pour que l'attaquant soit en bas.
export function buildField(state, zone, attackerId) {
  const c = cellCenter(zone.center);
  const near = cellsInRadius(c.lat, c.lon, B.fieldM * 0.75);
  let ax = 0;
  let ay = 0;
  for (const k of near) {
    if (state.cells.get(k) !== attackerId) continue;
    const v = vectorM(c, cellCenter(k));
    ax += v.x;
    ay -= v.y;
  }
  const phi = ax || ay ? Math.PI / 2 - Math.atan2(ay, ax) : 0;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const local = (lat, lon) => {
    const v = vectorM(c, { lat, lon });
    return [v.x * cos + v.y * sin, v.x * sin - v.y * cos];
  };
  const zoneSet = new Set(zone.keys);
  const cells = near.map((k) => {
    const [row, col] = parse(k);
    const [w, s, e, n] = rowColBounds(row, col);
    return {
      pts: [local(n, w), local(n, e), local(s, e), local(s, w)],
      owner: state.cells.get(k) ?? null,
      zone: zoneSet.has(k),
      protected: state.protected.has(k),
    };
  });
  return { cells, phi };
}

function split(total, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(total / n) + (i < total % n ? 1 : 0));
  return out.filter((t) => t > 0);
}

const countFor = (t) => (t >= 45 ? 3 : t >= 16 ? 2 : 1);
const SPAWN = {
  A: [[[0, 80]], [[-35, 80], [35, 80]], [[-55, 80], [0, 85], [55, 80]]],
  D: [[[0, -10]], [[-22, -8], [22, -8]], [[-28, -4], [28, -4], [0, -30]]],
};

export function createBattle({ attacker, defender, field = null, playerSide = 'A' }) {
  const b = {
    t: 0, phase: 'plan', winner: null, hold: 0, aiClock: 0, nextId: 1,
    attacker, defender, field, playerSide,
    ai: { A: playerSide !== 'A', D: playerSide !== 'D' }, // camps joués par l'ordinateur
    initial: { A: attacker.troops, D: defender.troops },
    groups: [], contacts: [],
  };
  for (const side of ['A', 'D']) {
    const parts = split((side === 'A' ? attacker : defender).troops, countFor((side === 'A' ? attacker : defender).troops));
    parts.forEach((t, i) => {
      const [x, y] = SPAWN[side][parts.length - 1][i];
      addGroup(b, side, t, x, y, side === 'A' ? -Math.PI / 2 : Math.PI / 2);
    });
  }
  return b;
}

function addGroup(b, side, troops, x, y, facing) {
  const g = { id: b.nextId++, side, troops, x, y, facing, target: null, post: { x, y }, primary: null, contactIds: new Set(), encircled: false, flanked: false };
  b.groups.push(g);
  return g;
}

export const startBattle = (b) => { if (b.phase === 'plan') b.phase = 'fight'; };

export function orderMove(b, id, x, y) {
  const g = b.groups.find((q) => q.id === id);
  if (!g || b.phase === 'done') return;
  g.target = { x: clamp(x, HALF), y: clamp(y, HALF) };
}

export function splitGroup(b, id) {
  const g = b.groups.find((q) => q.id === id);
  if (!g || g.troops < 4 || b.phase === 'done') return null;
  const half = Math.floor(g.troops / 2);
  g.troops -= half;
  const r = groupRadius(g.troops);
  const px = -Math.sin(g.facing);
  const py = Math.cos(g.facing);
  const n = addGroup(b, g.side, half, clamp(g.x + px * r * 1.2, HALF), clamp(g.y + py * r * 1.2, HALF), g.facing);
  g.x = clamp(g.x - px * r * 1.2, HALF);
  g.y = clamp(g.y - py * r * 1.2, HALF);
  return n;
}

export function retreat(b, side) {
  if (b.phase === 'done') return;
  finish(b, side === 'A' ? 'D' : 'A');
}

const alive = (b, side) => b.groups.filter((g) => g.side === side);
const inObjective = (g) => Math.hypot(g.x, g.y) < OBJECTIVE_R;

// ── IA (NPC, ou les deux camps en résolution automatique) ──
function think(b, side) {
  const enemies = alive(b, side === 'A' ? 'D' : 'A');
  const mine = alive(b, side);
  mine.forEach((g, i) => {
    if (g.contactIds.size || g.primary) return; // engagé : il se bat
    if (side === 'D') {
      const threats = enemies.filter((e) => Math.hypot(e.x, e.y) < B.defenderLeashM);
      const t = nearest(g, threats.length ? threats : []);
      g.target = t ? { x: t.x, y: t.y } : { ...g.post };
      return;
    }
    const t = nearest(g, enemies);
    if (!t) { g.target = { x: 0, y: 0 }; return; }
    const d = Math.hypot(t.x - g.x, t.y - g.y);
    if (i % 2 === 1 && d > 50) {
      // un groupe sur deux contourne pour prendre l'ennemi de flanc
      const ux = (t.x - g.x) / d;
      const uy = (t.y - g.y) / d;
      const s = (ux * (g.y - t.y) - uy * (g.x - t.x)) >= 0 ? 1 : -1;
      g.target = { x: clamp(t.x - uy * 45 * s, HALF), y: clamp(t.y + ux * 45 * s, HALF) };
    } else g.target = { x: t.x, y: t.y };
  });
}

function nearest(g, list) {
  let best = null;
  let bd = Infinity;
  for (const e of list) {
    const d = Math.hypot(e.x - g.x, e.y - g.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function step(b, dt) {
  if (b.phase !== 'fight') return;
  b.t += dt;
  b.aiClock -= dt;
  if (b.aiClock <= 0) {
    b.aiClock = 0.4;
    for (const side of ['A', 'D']) if (b.ai[side]) think(b, side);
  }

  // Contacts
  const G = b.groups;
  const byId = new Map(G.map((g) => [g.id, g]));
  const now = new Map(G.map((g) => [g.id, new Set()]));
  for (let i = 0; i < G.length; i++) {
    for (let j = i + 1; j < G.length; j++) {
      const a = G[i];
      const c = G[j];
      if (a.side === c.side) continue;
      if (Math.hypot(a.x - c.x, a.y - c.y) <= groupRadius(a.troops) + groupRadius(c.troops) + 1.5) {
        now.get(a.id).add(c.id);
        now.get(c.id).add(a.id);
      }
    }
  }
  const dist = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
  const reach = (a, c) => groupRadius(a.troops) + groupRadius(c.troops) + B.engageGapM;
  for (const g of G) {
    const set = now.get(g.id);
    for (const id of set) if (!g.contactIds.has(id)) g.target = null; // nouveau contact : il s'arrête pour combattre
    g.contactIds = set;
    // Ennemi principal : conservé tant qu'il est à portée (les autres attaquants restent sur le flanc).
    const p = byId.get(g.primary);
    if (!p || dist(g, p) > reach(g, p)) {
      let next = set.size ? byId.get(set.values().next().value) : null;
      if (!next && !g.target) {
        next = nearest(g, G.filter((e) => e.side !== g.side && dist(g, e) <= reach(g, e)));
      }
      g.primary = next ? next.id : null;
    }
  }

  // Mouvement et orientation
  const speed = B.speedMps * dt;
  const maxTurn = B.turnRateDeg * DEG * dt;
  for (const g of G) {
    if (g.target) {
      const dx = g.target.x - g.x;
      const dy = g.target.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) g.target = null;
      else {
        const s = Math.min(speed, d);
        g.x += (dx / d) * s;
        g.y += (dy / d) * s;
        g.facing = Math.atan2(dy, dx);
      }
    } else if (g.primary) {
      // engagé : il presse l'ennemi principal et pivote lentement vers lui
      const p = byId.get(g.primary);
      const d = dist(g, p);
      const gap = d - groupRadius(g.troops) - groupRadius(p.troops);
      if (gap > 0.5) {
        const s = Math.min(speed * 0.6, gap);
        g.x += ((p.x - g.x) / d) * s;
        g.y += ((p.y - g.y) / d) * s;
      }
      const want = Math.atan2(p.y - g.y, p.x - g.x);
      const diff = ((want - g.facing + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      g.facing += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
  }

  // Séparation : les groupes ne se chevauchent pas
  for (let i = 0; i < G.length; i++) {
    for (let j = i + 1; j < G.length; j++) {
      const a = G[i];
      const c = G[j];
      const min = groupRadius(a.troops) + groupRadius(c.troops);
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= min) continue;
      const push = (min - d) / 2;
      a.x = clamp(a.x - (dx / d) * push, HALF);
      a.y = clamp(a.y - (dy / d) * push, HALF);
      c.x = clamp(c.x + (dx / d) * push, HALF);
      c.y = clamp(c.y + (dy / d) * push, HALF);
    }
  }

  // Combat : force = troupes × bonus ; flanc/arrière ×1,5 ; encerclé = malus
  const dmg = new Map();
  b.contacts = [];
  for (const g of G) g.flanked = false;
  for (const g of G) {
    if (!g.contactIds.size) { g.encircled = false; continue; }
    const enemies = [...g.contactIds].map((id) => byId.get(id));
    const dirs = enemies.map((e) => Math.atan2(e.y - g.y, e.x - g.x));
    g.encircled = dirs.some((a, i) => dirs.some((c, j) => j > i && angleDiff(a, c) >= B.encircleSpreadDeg * DEG));
    const share = (g.troops * (g.encircled ? B.encircleMalus : 1)) / enemies.length;
    for (const e of enemies) {
      const flank = angleDiff(e.facing, Math.atan2(g.y - e.y, g.x - e.x)) > B.frontArcDeg * DEG;
      if (flank) e.flanked = true;
      dmg.set(e.id, (dmg.get(e.id) || 0) + share * (flank ? B.flankBonus : 1) * B.dpsPerTroop * dt);
      b.contacts.push({ from: g.id, to: e.id, flank });
    }
  }
  for (const [id, d] of dmg) byId.get(id).troops -= d;
  b.groups = G.filter((g) => g.troops >= 0.5);

  // Tenir la zone
  const inA = alive(b, 'A').some(inObjective);
  const inD = alive(b, 'D').some(inObjective);
  b.hold = inA && !inD ? b.hold + dt : 0;

  if (!alive(b, 'D').length || b.hold >= B.holdSeconds) finish(b, 'A');
  else if (!alive(b, 'A').length || b.t >= B.timeLimitS) finish(b, 'D');
}

function finish(b, winner) {
  b.phase = 'done';
  b.winner = winner;
  const sum = (side) => Math.floor(alive(b, side).reduce((s, g) => s + g.troops, 0));
  b.result = {
    winner,
    survivors: { A: sum('A'), D: sum('D') },
    losses: { A: b.initial.A - sum('A'), D: b.initial.D - sum('D') },
  };
}

// Résolution automatique : les deux camps sont joués par l'IA.
export function autoResolve(b) {
  b.playerSide = null;
  b.ai = { A: true, D: true };
  startBattle(b);
  while (b.phase !== 'done') step(b, 0.1);
  return b.result;
}

export const sideTroops = (b, side) => alive(b, side).reduce((s, g) => s + g.troops, 0);
