// Barre de ressources (haut) et barre d'actions (bas).
import { rates } from '../engine/buildings.js';
import { icon } from './icons.js';
import { el, fmt, fmt1, ui } from './kit.js';

const GPS_LABEL = {
  off: ['GPS inactif', ''],
  searching: ['Recherche GPS…', 'warn pending'],
  ok: ['GPS', 'ok'],
  weak: ['Précision faible', 'warn'],
  fast: ['Trop rapide', 'warn'],
  denied: ['GPS refusé', 'bad'],
  unavailable: ['GPS indisponible', 'bad'],
  sim: ['Simulation', 'sim'],
};

export class Hud {
  constructor(game, actions) {
    this.game = game;
    this.root = el(`
      <div class="layer">
        <div class="hud">
          <div class="hud-bar">
            <div class="res" data-r="coins"><span class="ri">${icon('coin', 20)}</span><div><b class="num">0</b><small></small></div></div>
            <div class="res" data-r="troops"><span class="ri">${icon('troops', 20)}</span><div><b class="num">0</b><small></small></div></div>
            <div class="res" data-r="cells"><span class="ri">${icon('cells', 20)}</span><div><b class="num">0</b><small>cases</small></div></div>
          </div>
          <div class="hud-chips"><button class="chip" data-gps><span class="led"></span><span></span></button></div>
        </div>
        <nav class="actionbar">
          <button class="act primary" data-a="build">${icon('build', 22)}<span>Construire</span></button>
          <button class="act" data-a="center">${icon('center', 22)}<span>Centrer</span></button>
          <button class="act" data-a="sim">${icon('sim', 22)}<span>Simulation</span></button>
          <button class="act" data-a="menu">${icon('menu', 22)}<span>Menu</span></button>
        </nav>
      </div>`);
    ui().append(this.root);
    this.root.querySelectorAll('.act').forEach((b) => b.addEventListener('click', () => actions[b.dataset.a]?.()));
    this.root.querySelector('[data-gps]').addEventListener('click', () => actions.gps?.());
    this.res = {};
    for (const r of ['coins', 'troops', 'cells']) {
      const box = this.root.querySelector(`[data-r="${r}"]`);
      this.res[r] = { box, b: box.querySelector('b'), s: box.querySelector('small'), last: null };
    }
    this.gps = this.root.querySelector('[data-gps]');
    this.setGps(game.state.sim.enabled ? 'sim' : game.gpsStatus);
    this.update();
  }

  set(r, value, sub) {
    const x = this.res[r];
    const v = fmt(value);
    if (x.last !== null && v !== x.last && Math.floor(value) > Number(x.last.replace(/\D/g, ''))) {
      x.box.classList.add('bump');
      setTimeout(() => x.box.classList.remove('bump'), 500);
    }
    if (v !== x.last) x.b.textContent = v;
    x.last = v;
    if (sub !== undefined && x.s.textContent !== sub) x.s.textContent = sub;
  }

  update() {
    const g = this.game;
    const me = g.me;
    if (!me) return;
    const r = rates(g.state, me.id);
    this.set('coins', me.coins, `+${fmt1(r.coinsPerMin)}/min`);
    this.set('troops', me.troops, `max ${fmt(r.troopCap)} · +${fmt1(r.troopsPerMin)}/min`);
    this.set('cells', me.cellCount);
    this.root.querySelector('[data-a="sim"]').classList.toggle('on', g.state.sim.enabled);
  }

  setGps(status, extra = {}) {
    const [label, cls] = GPS_LABEL[status] || GPS_LABEL.off;
    this.gps.className = 'chip ' + cls;
    let text = label;
    if (status === 'ok' && extra.accuracy) text = `GPS · ±${Math.round(extra.accuracy)} m`;
    if (status === 'weak' && extra.accuracy) text = `Précision faible · ±${Math.round(extra.accuracy)} m`;
    this.gps.lastElementChild.textContent = text;
  }

  gain(n) {
    const g = el(`<div class="gain">+${n} case${n > 1 ? 's' : ''}</div>`);
    g.style.setProperty('--me', this.game.me.color);
    ui().append(g);
    setTimeout(() => g.remove(), 1200);
  }
}
