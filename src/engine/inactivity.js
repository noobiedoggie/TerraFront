// Règles d'inactivité, appliquées à l'ouverture de l'appli (et par une tâche serveur en phase 2).
import { CONFIG } from '../config.js';
import { isProtected } from './territory.js';
import { removeNation, setOwner } from './state.js';

const DAY = 86400000;
const I = CONFIG.INACTIVITY;

export function inactivityStatus(lastActive, now) {
  const days = lastActive ? (now - lastActive) / DAY : 0;
  let level = 'ok';
  if (days >= I.deleteAccountDays) level = 'delete';
  else if (days >= I.wipeTerritoryDays) level = 'wipe';
  else if (days >= I.warnDays) level = 'warn';
  return { days, level };
}

// Applique la règle à un joueur. Renvoie l'action effectuée.
export function applyInactivity(state, playerId, now) {
  const n = state.nations[playerId];
  if (!n) return { action: 'none', days: 0 };
  const { days, level } = inactivityStatus(n.lastActive, now);
  if (level === 'delete') {
    removeNation(state, playerId);
    if (state.me === playerId) state.me = null;
    return { action: 'deleteAccount', days };
  }
  if (level === 'wipe' && !n.wipedAt) {
    for (const [k, o] of [...state.cells]) if (o === playerId && !isProtected(state, k)) setOwner(state, k, undefined);
    state.buildings = state.buildings.filter((b) => b.owner !== playerId || isProtected(state, b.key));
    n.wipedAt = now;
    return { action: 'wipeTerritory', days };
  }
  return { action: level === 'warn' ? 'warn' : 'none', days };
}

// À appeler à chaque session active.
export function markActive(state, playerId, now) {
  const n = state.nations[playerId];
  if (!n) return;
  n.lastActive = now;
  n.wipedAt = null;
}
