import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { cellAt, cellCenter, cellsInRadius, distanceM, neighbors, offsetLatLon } from '../src/engine/grid.js';
import { createNation, createState, deserialize, serialize } from '../src/engine/state.js';
import { attackZone, captureFree, checkCapitalSpot, foundCapital, sharesBorder, transferCells } from '../src/engine/territory.js';
import { build, buildCost, rates, upgrade } from '../src/engine/buildings.js';
import { advance } from '../src/engine/economy.js';
import { expand } from '../src/engine/expansion.js';
import { seedNpcs, npcAttackIntent } from '../src/engine/npc.js';
import { applyInactivity, markActive } from '../src/engine/inactivity.js';
import { validatePoint, pathCells } from '../src/engine/movement.js';
import { fuzzedPosition } from '../src/engine/privacy.js';
import { autoResolve, createBattle, orderMove, startBattle, step } from '../src/engine/battle.js';

const PARIS = { lat: 48.8566, lon: 2.3522 };
const T0 = Date.UTC(2026, 0, 1);

function world() {
  const s = createState(T0);
  s.me = 'me';
  s.nations.me = createNation('me', 'player', 'Moi', '#4c8dff', { coins: 500, troops: 20, lastActive: T0 });
  assert.equal(foundCapital(s, 'me', PARIS.lat, PARIS.lon).ok, true);
  return s;
}

test('grille : cases ~15 m, voisins réciproques, rayon', () => {
  const k = cellAt(PARIS.lat, PARIS.lon);
  const c = cellCenter(k);
  assert.equal(cellAt(c.lat, c.lon), k);
  for (const n of neighbors(k)) {
    const d = distanceM(c, cellCenter(n));
    assert.ok(d > 13 && d < 17, `distance voisin ${d}`);
    assert.ok(neighbors(n).includes(k));
  }
  const zone = cellsInRadius(PARIS.lat, PARIS.lon, 50);
  assert.ok(zone.length > 28 && zone.length < 45, `zone capitale ${zone.length}`);
});

test('capitale : zone protégée, refus si occupé ou trop proche', () => {
  const s = world();
  assert.ok(s.nations.me.cellCount > 28);
  assert.equal(checkCapitalSpot(s, PARIS.lat, PARIS.lon).ok, false);
  const near = offsetLatLon(PARIS.lat, PARIS.lon, 150, 0);
  assert.equal(checkCapitalSpot(s, near.lat, near.lon).reason, 'near');
  const far = offsetLatLon(PARIS.lat, PARIS.lon, 600, 0);
  assert.equal(checkCapitalSpot(s, far.lat, far.lon).ok, true);
});

test('sauvegarde : aller-retour', () => {
  const s = world();
  const back = deserialize(serialize(s));
  assert.equal(back.cells.size, s.cells.size);
  assert.equal(back.nations.me.cellCount, s.nations.me.cellCount);
  assert.equal(back.protected.size, s.protected.size);
});

test('GPS : précision, vitesse, interpolation', () => {
  const a = { ...PARIS, accuracy: 10, speed: null, time: T0 };
  assert.equal(validatePoint(null, { ...a, accuracy: 41 }).reason, 'accuracy');
  const b = { ...offsetLatLon(PARIS.lat, PARIS.lon, 10, 0), accuracy: 10, speed: null, time: T0 + 10000 };
  assert.equal(validatePoint(a, b).ok, true); // 3,6 km/h
  const car = { ...offsetLatLon(PARIS.lat, PARIS.lon, 100, 0), accuracy: 10, speed: null, time: T0 + 10000 };
  assert.equal(validatePoint(a, car).reason, 'speed'); // 36 km/h
  const c = { ...offsetLatLon(PARIS.lat, PARIS.lon, 45, 0) };
  assert.ok(pathCells(a, c).length >= 3);
});

test('bâtiments : coût croissant, production, amélioration', () => {
  const s = world();
  const cells = [...s.cells.keys()].filter((k) => k !== s.nations.me.capital.key);
  const c1 = buildCost(s.nations.me, 'factory');
  assert.equal(build(s, 'me', 'factory', cells[0]).ok, true);
  assert.ok(buildCost(s.nations.me, 'factory') > c1);
  assert.equal(build(s, 'me', 'factory', cells[0]).ok, false); // case déjà prise
  assert.equal(build(s, 'me', 'city', s.nations.me.capital.key).ok, false);
  assert.equal(rates(s, 'me').coinsPerMin, CONFIG.CAPITAL.coinsPerMin + 2);
  const id = s.buildings[0].id;
  s.nations.me.coins = 10000;
  assert.equal(upgrade(s, id).ok, true);
  assert.equal(s.buildings[0].level, 2);
});

test('production hors ligne : taux réduit et plafonné', () => {
  const s = world();
  const k = [...s.cells.keys()].find((x) => x !== s.nations.me.capital.key);
  build(s, 'me', 'factory', k);
  const start = s.nations.me.coins;
  advance(s, T0 + 60000); // 1 min « hors ligne » (écart > 15 s)
  const perMin = (2 + CONFIG.CAPITAL.coinsPerMin) * CONFIG.OFFLINE.rate;
  assert.ok(Math.abs(s.nations.me.coins - start - perMin) < 1e-6);
  const before = s.nations.me.coins;
  advance(s, s.lastTick + 7 * 86400000); // une semaine : plafonné à maxHours
  const cap = perMin * 60 * CONFIG.OFFLINE.maxHours;
  assert.ok(Math.abs(s.nations.me.coins - before - cap) < 1e-6);
  // en ligne : plein taux
  const b2 = s.nations.me.coins;
  for (let i = 1; i <= 60; i++) advance(s, s.lastTick + 1000);
  assert.ok(Math.abs(s.nations.me.coins - b2 - perMin / CONFIG.OFFLINE.rate) < 1e-6);
});

test("base d'attaque : n'étend que des cases libres et contiguës, même hors ligne", () => {
  const s = world();
  s.nations.other = createNation('other', 'player', 'Autre', '#e5484d');
  const near = offsetLatLon(PARIS.lat, PARIS.lon, 0, 75);
  const enemyKey = cellAt(near.lat, near.lon);
  captureFree(s, enemyKey, 'other');
  const k = [...s.cells.keys()].find((x) => x !== s.nations.me.capital.key && s.cells.get(x) === 'me');
  build(s, 'me', 'base', k);
  const before = s.nations.me.cellCount;
  advance(s, T0 + 10 * 3600000); // 10 h hors ligne : 3 cases/h
  assert.equal(s.nations.me.cellCount - before, 30);
  assert.equal(s.cells.get(enemyKey), 'other');
  // chaque case du joueur reste reliée
  for (const [c, o] of s.cells) if (o === 'me') assert.ok(neighbors(c).some((n) => s.cells.get(n) === 'me'));
});

test('NPC : apparition hors de la zone du joueur, expansion bornée', () => {
  const s = createState(T0);
  const npcs = seedNpcs(s, PARIS.lat, PARIS.lon);
  assert.ok(npcs.length >= 3, `${npcs.length} NPC`);
  for (const n of npcs) assert.ok(distanceM(PARIS, n.capital) >= CONFIG.NPC.clearRadiusM);
  const before = npcs.map((n) => n.cellCount);
  advance(s, T0 + 3600000 * 4);
  npcs.forEach((n, i) => assert.ok(n.cellCount >= before[i]));
});

test('frontière et zone d’attaque : jamais la capitale', () => {
  const s = world();
  s.nations.npc = createNation('npc', 'npc', 'Valdoria', '#a39470', { troops: 30 });
  const p = offsetLatLon(PARIS.lat, PARIS.lon, 300, 0);
  foundCapital(s, 'npc', p.lat, p.lon);
  expand(s, 'npc', s.nations.npc.capital.key, 70, 999);
  assert.equal(sharesBorder(s, 'me', 'npc'), false);
  assert.equal(attackZone(s, 'me', 'npc', p).reason, 'no-border');
  // couloir du joueur jusqu'à la NPC
  for (let x = 40; x <= 240; x += 5) {
    const q = offsetLatLon(PARIS.lat, PARIS.lon, x, 0);
    captureFree(s, cellAt(q.lat, q.lon), 'me');
  }
  assert.equal(sharesBorder(s, 'me', 'npc'), true);
  const z = attackZone(s, 'me', 'npc', p);
  assert.equal(z.ok, true);
  assert.ok(z.keys.every((k) => !s.protected.has(k)));
  const r = transferCells(s, [...z.keys, s.nations.npc.capital.key], 'me');
  assert.equal(r.cells, z.keys.length);
  assert.equal(s.cells.get(s.nations.npc.capital.key), 'npc');
  // NPC plus fort : intention d'attaque possible
  s.nations.me.troops = 5;
  s.npcClock = 1e9;
  const intent = npcAttackIntent(s, T0 + 1e9, 1, () => 0);
  assert.equal(intent?.attackerId, 'npc');
});

test('inactivité : 1 mois = territoire perdu sauf capitale, 3 mois = compte supprimé', () => {
  const s = world();
  const k = cellAt(...Object.values(offsetLatLon(PARIS.lat, PARIS.lon, 120, 0)));
  captureFree(s, k, 'me');
  const capitalCells = s.protected.size;
  assert.equal(applyInactivity(s, 'me', T0 + 22 * 86400000).action, 'warn');
  assert.equal(applyInactivity(s, 'me', T0 + 31 * 86400000).action, 'wipeTerritory');
  assert.equal(s.nations.me.cellCount, capitalCells);
  markActive(s, 'me', T0 + 31 * 86400000);
  assert.equal(applyInactivity(s, 'me', T0 + 122 * 86400000).action, 'deleteAccount');
  assert.equal(s.nations.me, undefined);
  assert.equal(s.cells.size, 0);
});

test('vie privée : décalage fixe ~100 m', () => {
  const a = fuzzedPosition('x', PARIS.lat, PARIS.lon);
  const b = fuzzedPosition('x', PARIS.lat, PARIS.lon);
  assert.deepEqual(a, b);
  const d = distanceM(PARIS, a);
  assert.ok(d >= 75 && d <= 125, `${d}`);
});

const side = (troops) => ({ id: troops, troops });

test('bataille : sans stratégie, le plus nombreux gagne', () => {
  assert.equal(autoResolve(createBattle({ attacker: side(50), defender: side(70) })).winner, 'D');
  assert.equal(autoResolve(createBattle({ attacker: side(80), defender: side(50) })).winner, 'A');
});

test('bataille : prendre à revers permet au plus faible de gagner', () => {
  const run = (flank) => {
    const b = createBattle({ attacker: side(44), defender: side(12), playerSide: 'A' });
    // un seul défenseur de 60 face au sud
    b.groups = b.groups.filter((g) => g.side === 'A');
    b.groups.push({ id: 99, side: 'D', troops: 56, x: 0, y: 0, facing: Math.PI / 2, target: null, post: { x: 0, y: 0 }, primary: null, contactIds: new Set(), encircled: false, flanked: false });
    b.ai = { A: false, D: false }; // ordres scriptés
    b.initial.D = 56;
    const [g1, g2] = b.groups.filter((g) => g.side === 'A');
    orderMove(b, g1.id, 0, 30);
    if (flank) { g2.x = 0; g2.y = -88; orderMove(b, g2.id, 0, -20); } else orderMove(b, g2.id, 5, 30);
    startBattle(b);
    for (let i = 0; i < 3000 && b.phase !== 'done'; i++) step(b, 0.05);
    return b.result.winner;
  };
  assert.equal(run(false), 'D');
  assert.equal(run(true), 'A');
});
