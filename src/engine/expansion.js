// Expansion automatique (bases d'attaque et NPC) : uniquement des cases libres,
// contiguës au territoire relié à l'origine, la plus proche d'abord, dans un rayon maximum.
import { cellCenter, distanceM, hash, neighbors } from './grid.js';
import { setOwner } from './state.js';

export function expand(state, owner, originKey, radiusM, count) {
  const taken = [];
  if (count <= 0 || state.cells.get(originKey) !== owner) return taken;
  const o = cellCenter(originKey);
  const seen = new Set([originKey]);
  const frontier = new Map(); // case libre → distance pondérée
  const dist = (k) => distanceM(o, cellCenter(k));
  // léger bruit déterministe pour une croissance organique plutôt qu'un disque parfait
  const score = (k, d) => d + (hash(k) % 1000) / 250;

  const explore = (start) => {
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      for (const n of neighbors(k)) {
        if (seen.has(n)) continue;
        seen.add(n);
        const d = dist(n);
        if (d > radiusM) continue;
        const own = state.cells.get(n);
        if (own === owner) stack.push(n);
        else if (own === undefined) frontier.set(n, score(n, d));
      }
    }
  };
  explore(originKey);

  while (taken.length < count && frontier.size) {
    let best = null;
    let bs = Infinity;
    for (const [k, s] of frontier) if (s < bs) { bs = s; best = k; }
    frontier.delete(best);
    if (state.cells.has(best)) continue;
    setOwner(state, best, owner);
    taken.push(best);
    explore(best);
  }
  return taken;
}

// Fait avancer un expanseur (objet avec .progress) de dtS secondes.
export function runExpansion(state, owner, originKey, holder, cellsPerHour, radiusM, dtS) {
  holder.progress = (holder.progress || 0) + (dtS * cellsPerHour) / 3600;
  const want = Math.floor(holder.progress);
  if (want < 1) return [];
  const taken = expand(state, owner, originKey, radiusM, want);
  holder.progress -= taken.length;
  if (taken.length < want) holder.progress = Math.min(holder.progress, 0.99); // bloqué : on ne stocke pas
  return taken;
}
