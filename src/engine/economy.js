// Avancement du temps : production, expansion des bases, croissance des NPC.
// Fonction pure sur l'état, utilisable telle quelle par une tâche serveur (phase 2).
import { CONFIG } from '../config.js';
import { rates, stats } from './buildings.js';
import { runExpansion } from './expansion.js';
import { npcTick } from './npc.js';

export function advance(state, now) {
  const dtS = (now - state.lastTick) / 1000;
  const report = { dtS, offline: false, coins: 0, troops: 0, cells: 0 };
  if (dtS <= 0) return report;
  state.lastTick = now;
  const O = CONFIG.OFFLINE;
  report.offline = dtS > O.onlineGapS;
  // Usines et villes : taux réduit et plafonné hors ligne.
  const prodS = report.offline ? Math.min(dtS, O.maxHours * 3600) * O.rate : dtS;

  for (const n of Object.values(state.nations)) {
    if (n.kind !== 'player' || !n.capital) continue;
    const r = rates(state, n.id);
    const coins = (r.coinsPerMin * prodS) / 60;
    const before = n.troops;
    n.coins += coins;
    if (n.troops < r.troopCap) n.troops = Math.min(r.troopCap, n.troops + (r.troopsPerMin * prodS) / 60);
    if (n.id === state.me) {
      report.coins += coins;
      report.troops += n.troops - before;
    }
  }

  // Bases d'attaque : même rythme en ligne et hors ligne.
  for (const b of state.buildings) {
    const s = stats(b);
    if (!s.cellsPerHour) continue;
    const taken = runExpansion(state, b.owner, b.key, b, s.cellsPerHour, s.radiusM, dtS);
    if (b.owner === state.me) report.cells += taken.length;
  }

  npcTick(state, dtS);
  return report;
}
