// Couche réseau : tout ce qui concerne « les autres » (joueurs, NPC, serveur) passe par ici.
// V1 : LocalNetwork — les autres sont des NPC simulés localement, le stockage est local.
// Phase 2 : SupabaseNetwork implémentera exactement la même interface (voir README).
//
// Interface :
//   checkCapitalAvailable(lat, lon)      → Promise<{ ok, reason?, nationId? }>
//   placeCapital(playerId, lat, lon)     → Promise<{ ok, reason?, nationId? }>
//   sendAttackRequest(request)           → Promise<{ accepted, defenderTroops, reason? }>
//   onAttackRequest(callback)            → fonction de désabonnement
//   sendBattleResult(result)             → Promise<void>
//   syncTerritory(changes)               → Promise<void>
//   tick(now, dtS)                       → décisions des autres (NPC) pendant que l'appli est ouverte
//
// request = { attackerId, defenderId, zone: { center, keys }, troops }
import { checkCapitalSpot, foundCapital } from '../engine/territory.js';
import { npcAttackIntent, npcDefenders } from '../engine/npc.js';

export class LocalNetwork {
  constructor(getState, save) {
    this.getState = getState;
    this.save = save;
    this.listeners = new Set();
  }

  async checkCapitalAvailable(lat, lon) {
    return checkCapitalSpot(this.getState(), lat, lon);
  }

  async placeCapital(playerId, lat, lon) {
    const r = foundCapital(this.getState(), playerId, lat, lon);
    if (r.ok) await this.save();
    return r;
  }

  // Un NPC accepte toujours le combat et défend avec la majorité de ses troupes.
  async sendAttackRequest({ defenderId }) {
    const d = this.getState().nations[defenderId];
    if (!d) return { accepted: false, reason: 'Nation introuvable.' };
    if (d.kind !== 'npc') return { accepted: false, reason: 'Les combats contre des joueurs arrivent en phase 2.' };
    return { accepted: true, defenderTroops: npcDefenders(d) };
  }

  onAttackRequest(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async sendBattleResult() {
    await this.save();
  }

  async syncTerritory() {
    await this.save();
  }

  // Les NPC décident (rarement) d'attaquer un voisin faible. Renvoie les intentions NPC contre NPC.
  tick(now, dtS) {
    const state = this.getState();
    const intent = npcAttackIntent(state, now, dtS);
    if (!intent) return null;
    if (intent.defenderId === state.me) {
      this.listeners.forEach((cb) => cb(intent));
      return null;
    }
    return intent;
  }
}
