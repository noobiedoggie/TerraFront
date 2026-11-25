// Les capitales et bâtiments des autres joueurs ne sont jamais montrés à leur position exacte :
// décalage pseudo-aléatoire fixe (dérivé de l'id) d'environ CONFIG.PRIVACY.offsetM.
import { CONFIG } from '../config.js';
import { hash, offsetLatLon, rng } from './grid.js';

export function fuzzedPosition(id, lat, lon) {
  const r = rng(hash('privacy:' + id));
  const angle = r() * Math.PI * 2;
  const dist = CONFIG.PRIVACY.offsetM * (0.8 + 0.4 * r());
  return offsetLatLon(lat, lon, Math.cos(angle) * dist, Math.sin(angle) * dist);
}

// Position à afficher pour une entité appartenant à `ownerId`.
export function displayPosition(state, ownerId, entityId, lat, lon) {
  const owner = state.nations[ownerId];
  if (!owner || owner.kind !== 'player' || ownerId === state.me) return { lat, lon };
  return fuzzedPosition(entityId, lat, lon);
}
