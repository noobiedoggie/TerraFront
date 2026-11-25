// Contrôleur de jeu : relie le moteur pur, la couche réseau, le stockage et le GPS.
// L'UI n'appelle que cette classe et écoute ses événements.
import { CONFIG } from './config.js';
import { createNation, createState } from './engine/state.js';
import { advance } from './engine/economy.js';
import { applyInactivity, markActive } from './engine/inactivity.js';
import { seedNpcs } from './engine/npc.js';
import { attackZone, captureFree, transferCells } from './engine/territory.js';
import { build, canBuild, upgrade } from './engine/buildings.js';
import { pathCells, validatePoint } from './engine/movement.js';
import { autoResolve, buildField, createBattle } from './engine/battle.js';
import { distanceM } from './engine/grid.js';
import { LocalNetwork } from './net/network.js';
import * as storage from './platform/storage.js';
import * as gps from './platform/gps.js';

const SIM_SPEED_MPS = 1.4; // vitesse de marche simulée (pour l'anti-triche)

export class Game {
  constructor() {
    this.state = null;
    this.handlers = {};
    this.network = new LocalNetwork(() => this.state, () => this.save());
    this.network.onAttackRequest((intent) => this.emit('attack-incoming', intent));
    this.position = null;
    this.lastPoint = null;
    this.lastAccepted = null;
    this.gpsStatus = 'off';
    this.active = false;
    this.timer = null;
    this.sinceSave = 0;
    this.renderedVersion = -1;
    this.walk = null;
  }

  on(event, fn) {
    (this.handlers[event] ??= new Set()).add(fn);
    return () => this.handlers[event].delete(fn);
  }

  emit(event, data) {
    this.handlers[event]?.forEach((fn) => fn(data));
  }

  get me() {
    return this.state?.nations[this.state.me];
  }

  save() {
    this.sinceSave = 0;
    return storage.saveState(this.state);
  }

  // ── Chargement et rattrapage hors ligne ──
  async load(now = Date.now()) {
    this.state = await storage.loadState().catch(() => null);
    if (!this.state) this.state = createState(now);
    if (!this.me) return { status: 'new' };
    if (!this.me.capital) return { status: 'placement' };
    return this.catchUp(now);
  }

  async catchUp(now = Date.now()) {
    const report = advance(this.state, now);
    const inactivity = applyInactivity(this.state, this.state.me, now);
    if (inactivity.action === 'deleteAccount') {
      const flags = { ...this.state.flags, firstBuildDone: false, tutorialDone: false };
      await storage.clearState();
      this.state = createState(now);
      this.state.flags = flags;
      return { status: 'deleted', inactivity };
    }
    markActive(this.state, this.state.me, now);
    await this.save();
    return { status: this.state.flags.firstBuildDone ? 'ok' : 'firstBuild', report, inactivity };
  }

  // ── Arrivée ──
  createPlayer(name, color, now = Date.now()) {
    const id = 'p_' + Math.random().toString(36).slice(2, 10);
    this.state.me = id;
    this.state.nations[id] = createNation(id, 'player', name, color, {
      coins: CONFIG.START.coins,
      troops: CONFIG.START.troops,
      lastActive: now,
    });
    return this.save();
  }

  setFlag(name, value = true) {
    this.state.flags[name] = value;
    return this.save();
  }

  // Les nations voisines existent avant la fondation : la vérification d'emplacement a un sens.
  previewArea(lat, lon, isWater) {
    seedNpcs(this.state, lat, lon, isWater);
    this.emit('territory');
  }

  checkCapital(lat, lon) {
    return this.network.checkCapitalAvailable(lat, lon);
  }

  async placeCapital(lat, lon) {
    const check = await this.network.checkCapitalAvailable(lat, lon);
    if (!check.ok) return check;
    const r = await this.network.placeCapital(this.state.me, lat, lon);
    if (r.ok) {
      this.state.lastTick = Date.now();
      markActive(this.state, this.state.me, Date.now());
      await this.save();
      this.emit('territory');
    }
    return r;
  }

  // ── Bâtiments ──
  canBuild(type, key) {
    return canBuild(this.state, this.state.me, type, key);
  }

  build(type, key) {
    const r = build(this.state, this.state.me, type, key);
    if (r.ok) this.changed();
    return r;
  }

  upgrade(id) {
    const r = upgrade(this.state, id);
    if (r.ok) this.changed();
    return r;
  }

  changed() {
    this.emit('buildings');
    this.emit('tick');
    this.save();
  }

  // ── Boucle de jeu (appli au premier plan) ──
  start() {
    if (this.active) return;
    this.active = true;
    this.timer = setInterval(() => this.tick(), 1000);
    if (!this.state.sim.enabled) this.startGps();
    gps.keepAwake(true);
  }

  async pause() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    this.stopWalk();
    await gps.stopWatch();
    gps.keepAwake(false);
    await this.save();
  }

  async resume() {
    if (this.active || !this.me?.capital) return null;
    const r = await this.catchUp();
    if (r.status !== 'deleted') this.start();
    return r;
  }

  tick(now = Date.now()) {
    const r = advance(this.state, now);
    this.me.lastActive = now;
    if (r.offline && r.dtS > 60) this.emit('offline-report', r);
    if (!r.offline) {
      const intent = this.network.tick(now, r.dtS);
      if (intent) this.resolveNpcWar(intent);
    }
    if (this.state.version !== this.renderedVersion) {
      this.renderedVersion = this.state.version;
      this.emit('territory');
    }
    this.emit('tick');
    this.sinceSave += Math.max(0, r.dtS);
    if (this.sinceSave >= CONFIG.SAVE_EVERY_S) this.save();
  }

  // ── GPS et conquête en marchant ──
  startGps() {
    this.setGpsStatus('searching');
    gps.startWatch(
      (p) => this.handlePoint(p),
      (err) => {
        const kind = gps.errorKind(err);
        if (kind !== 'timeout' || this.gpsStatus === 'searching') this.setGpsStatus(kind === 'timeout' ? 'searching' : kind);
      },
    );
  }

  setGpsStatus(s, extra = {}) {
    this.gpsStatus = s;
    this.emit('gps', { status: s, ...extra });
  }

  handlePoint(p) {
    if (!this.active || !this.me?.capital) return;
    const prev = this.lastPoint;
    this.lastPoint = p;
    const v = validatePoint(prev, p);
    this.position = p;
    this.emit('position', p);
    if (!v.ok) {
      if (v.reason === 'speed') this.lastAccepted = null;
      return this.setGpsStatus(v.reason === 'speed' ? 'fast' : 'weak', { accuracy: p.accuracy, speedKmh: v.speedKmh });
    }
    if (!p.simulated) this.setGpsStatus('ok', { accuracy: p.accuracy });
    let n = 0;
    for (const k of pathCells(this.lastAccepted, p)) if (captureFree(this.state, k, this.state.me)) n++;
    this.lastAccepted = p;
    if (n) this.emit('captured', n);
  }

  // ── Mode simulation : position virtuelle déplacée en touchant la carte ──
  async setSimulation(on) {
    this.state.sim.enabled = on;
    this.stopWalk();
    this.lastPoint = null;
    this.lastAccepted = null;
    if (on) {
      await gps.stopWatch();
      this.setGpsStatus('sim');
      const start = this.position || { ...this.me.capital };
      this.handlePoint(this.simPoint(start.lat, start.lon, Date.now()));
    } else if (this.active) this.startGps();
    this.save();
  }

  simPoint(lat, lon, time) {
    return { lat, lon, accuracy: 5, speed: SIM_SPEED_MPS, time, simulated: true };
  }

  simulateWalkTo(lat, lon) {
    this.stopWalk();
    const from = this.position || this.me.capital;
    const d = distanceM(from, { lat, lon });
    const steps = Math.max(1, Math.ceil(d / CONFIG.GPS.stepM));
    const duration = Math.min(6000, Math.max(300, (d / 80) * 1000));
    let simTime = this.lastPoint?.time ?? Date.now();
    let i = 0;
    const t0 = performance.now();
    const loop = () => {
      const target = Math.min(steps, Math.ceil(((performance.now() - t0) / duration) * steps));
      while (i < target) {
        i++;
        simTime += (CONFIG.GPS.stepM / SIM_SPEED_MPS) * 1000; // horloge virtuelle au pas de marche
        const t = i / steps;
        this.handlePoint(this.simPoint(from.lat + (lat - from.lat) * t, from.lon + (lon - from.lon) * t, simTime));
      }
      this.walk = i < steps ? requestAnimationFrame(loop) : null;
    };
    this.walk = requestAnimationFrame(loop);
  }

  stopWalk() {
    if (this.walk) cancelAnimationFrame(this.walk);
    this.walk = null;
  }

  // ── Attaque ──
  attackTarget(defenderId, near) {
    return attackZone(this.state, this.state.me, defenderId, near);
  }

  async startAttack(defenderId, zone, troops) {
    const me = this.me;
    const res = await this.network.sendAttackRequest({ attackerId: me.id, defenderId, zone, troops });
    if (!res.accepted) return { ok: false, reason: res.reason };
    const d = this.state.nations[defenderId];
    me.troops -= troops;
    d.troops -= res.defenderTroops;
    const battle = createBattle({
      attacker: { id: me.id, name: me.name, color: me.color, troops },
      defender: { id: d.id, name: d.name, color: d.color, troops: res.defenderTroops },
      field: buildField(this.state, zone, me.id),
      playerSide: 'A',
    });
    battle.zone = zone;
    this.save();
    return { ok: true, battle };
  }

  // Défense contre une attaque NPC : bataille jouée ou résolution automatique.
  defend(intent, troops, auto) {
    const a = this.state.nations[intent.attackerId];
    const me = this.me;
    if (!a) return null;
    const attackTroops = Math.min(intent.troops, Math.floor(a.troops));
    a.troops -= attackTroops;
    me.troops -= troops;
    const battle = createBattle({
      attacker: { id: a.id, name: a.name, color: a.color, troops: attackTroops },
      defender: { id: me.id, name: me.name, color: me.color, troops },
      field: buildField(this.state, intent.zone, a.id),
      playerSide: 'D',
    });
    battle.zone = intent.zone;
    if (!auto) return battle;
    autoResolve(battle);
    return battle;
  }

  // Applique l'issue : survivants rendus, zone transférée si l'attaquant gagne.
  finishBattle(battle) {
    const { attacker, defender, result, zone } = battle;
    const A = this.state.nations[attacker.id];
    const D = this.state.nations[defender.id];
    if (A) A.troops += result.survivors.A;
    if (D) D.troops += result.survivors.D;
    let outcome = { cells: 0, destroyed: 0 };
    if (result.winner === 'A' && A) outcome = transferCells(this.state, zone.keys, attacker.id);
    this.network.sendBattleResult({ attackerId: attacker.id, defenderId: defender.id, result, zone });
    this.emit('territory');
    this.emit('buildings');
    this.emit('tick');
    return outcome;
  }

  resolveNpcWar(intent) {
    const a = this.state.nations[intent.attackerId];
    const d = this.state.nations[intent.defenderId];
    const dTroops = Math.floor(d.troops * CONFIG.NPC.defendRatio);
    a.troops -= intent.troops;
    d.troops -= dTroops;
    const battle = createBattle({ attacker: { id: a.id, troops: intent.troops }, defender: { id: d.id, troops: dTroops } });
    battle.zone = intent.zone;
    autoResolve(battle);
    const out = this.finishBattle(battle);
    if (out.cells) this.emit('news', `${a.name} a conquis ${out.cells} cases de ${d.name}.`);
  }

  async reset() {
    await this.pause();
    await storage.clearState();
    this.state = createState(Date.now());
    this.position = null;
    this.lastPoint = null;
    this.lastAccepted = null;
  }
}
