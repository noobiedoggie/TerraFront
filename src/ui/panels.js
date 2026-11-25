// Panneaux de jeu : construction, bâtiments, nations, attaque, défense, menu.
import { CONFIG } from '../config.js';
import { buildCost, buildingTypes, def, maxLevel, stats, upgradeCost } from '../engine/buildings.js';
import { cellAt, cellCenter } from '../engine/grid.js';
import { sharesBorder } from '../engine/territory.js';
import { icon } from './icons.js';
import { cellsPolygon } from './map.js';
import { closeSheet, duration, el, esc, fmt, fmt1, openSheet, toast, ui } from './kit.js';

// Description lisible des effets d'un niveau (data-driven).
export function effectText(s) {
  const out = [];
  if (s.coinsPerMin) out.push(`+${fmt1(s.coinsPerMin)} pièces/min`);
  if (s.troopsPerMin) out.push(`+${fmt1(s.troopsPerMin)} troupes/min`);
  if (s.troopCap) out.push(`+${fmt(s.troopCap)} plafond de troupes`);
  if (s.cellsPerHour) out.push(`${fmt1(s.cellsPerHour)} cases/h`);
  if (s.radiusM) out.push(`rayon ${fmt(s.radiusM)} m`);
  return out.join(' · ');
}

// ── Construction ──
export function chooseBuilding(game, { types = buildingTypes(), title = 'Construire', subtitle = '', dismissable = true } = {}) {
  return new Promise((resolve) => {
    const me = game.me;
    const body = el('<div class="choices"></div>');
    let picked = null;
    for (const t of types) {
      const d = def(t);
      const cost = buildCost(me, t);
      const b = el(`
        <button class="choice" ${me.coins < cost ? 'disabled' : ''}>
          <span class="ci">${icon(d.icon, 24)}</span>
          <span><b>${d.name}</b><small>${d.description}</small><small style="color:var(--text);margin-top:2px">${effectText(d.levels[0])}</small></span>
          <span class="cost">${icon('coin', 16)}${fmt(cost)}</span>
        </button>`);
      b.addEventListener('click', () => {
        picked = t;
        closeSheet();
      });
      body.append(b);
    }
    if (types.every((t) => me.coins < buildCost(me, t))) {
      body.append(el(`<div class="note">${icon('info', 18)}<span>Pas assez de pièces pour l'instant. Vos usines et votre capitale en produisent en continu.</span></div>`));
    }
    openSheet({ title, subtitle, body, dismissable, onClose: () => resolve(picked) });
  });
}

// Mode placement : toucher une case de son territoire.
export function pickCell(game, gmap, type, setClick, { cancellable = true } = {}) {
  return new Promise((resolve) => {
    const d = def(type);
    const banner = el(`
      <div class="banner">${icon(d.icon, 22)}<p><b>${d.name}</b> : touchez une case de votre territoire.</p>
      ${cancellable ? '<button class="btn btn-sm">Annuler</button>' : '<button class="btn btn-sm">Changer</button>'}</div>`);
    ui().append(banner);
    const done = (result) => {
      setClick(null);
      banner.remove();
      resolve(result);
    };
    banner.querySelector('button').addEventListener('click', () => done(null));
    setClick(({ lat, lon }) => {
      const k = cellAt(lat, lon);
      const check = game.canBuild(type, k);
      if (!check.ok) return toast(check.reason, 'warn');
      const r = game.build(type, k);
      if (!r.ok) return toast(r.reason, 'warn');
      toast(`${d.name} construite.`, 'ok');
      done(r.building);
    });
  });
}

// ── Fiches ──
export function buildingSheet(game, gmap, id) {
  const b = game.state.buildings.find((x) => x.id === id);
  if (!b) return;
  const d = def(b.type);
  const mineB = b.owner === game.state.me;
  const owner = game.state.nations[b.owner];
  const s = stats(b);
  if (mineB && s.radiusM) gmap.setRadius(b.lat, b.lon, s.radiusM, owner.color);
  const cost = upgradeCost(b);
  const next = b.level < maxLevel(b.type) ? d.levels[b.level] : null;
  const body = `
    <div class="stats">
      <div class="stat"><small>Niveau</small><b>${b.level} / ${maxLevel(b.type)}</b></div>
      <div class="stat"><small>Propriétaire</small><b style="font-size:15px">${esc(owner.name)}</b></div>
    </div>
    <div class="row"><span class="muted">Actuel</span><span>${effectText(s)}</span></div>
    ${mineB && next ? `<div class="row"><span class="muted">Niveau ${b.level + 1}</span><span style="color:var(--accent)">${effectText(next)}</span></div>` : ''}
    ${s.cellsPerHour && mineB ? `<div class="note">${icon('info', 18)}<span>Prend une case libre contiguë à la fois, même appli fermée. Ne prend jamais une case déjà occupée.</span></div>` : ''}`;
  const actions = mineB && cost !== null
    ? [{
        label: `Améliorer · ${fmt(cost)} pièces`,
        kind: 'primary',
        icon: 'up',
        disabled: game.me.coins < cost,
        onClick: () => {
          const r = game.upgrade(b.id);
          toast(r.ok ? `${d.name} niveau ${r.building.level}.` : r.reason, r.ok ? 'ok' : 'warn');
          if (r.ok) setTimeout(() => buildingSheet(game, gmap, id), 280);
        },
      }]
    : [];
  openSheet({
    title: `${icon(d.icon, 22)} ${d.name}`,
    subtitle: mineB ? (cost === null ? 'Niveau maximum atteint.' : d.description) : 'Bâtiment ennemi.',
    body,
    actions,
    onClose: () => gmap.setRadius(null),
  });
}

export function capitalSheet(game, nationId, attack) {
  const n = game.state.nations[nationId];
  if (nationId !== game.state.me) return nationSheet(game, nationId, cellCenter(n.capital.key), attack);
  openSheet({
    title: `${icon('capital', 22)} Capitale · ${esc(n.name)}`,
    subtitle: 'Zone protégée de 100 m : elle ne peut jamais être conquise.',
    body: `<div class="stats">
      <div class="stat"><small>Territoire</small><b>${fmt(n.cellCount)} cases</b></div>
      <div class="stat"><small>Bâtiments</small><b>${game.state.buildings.filter((b) => b.owner === n.id).length}</b></div>
      <div class="stat"><small>Troupes</small><b>${fmt(n.troops)}</b></div>
    </div>`,
  });
}

export function ownCellSheet(game, gmap, key, setClick) {
  const free = !game.state.buildings.some((b) => b.key === key) && game.me.capital.key !== key;
  openSheet({
    title: `<span class="dot" style="--c:${game.me.color}"></span> Votre territoire`,
    subtitle: game.state.protected.has(key) ? 'Case de votre capitale : protégée.' : 'Case conquise : elle peut être prise par combat.',
    actions: free
      ? [{
          label: 'Construire ici',
          kind: 'primary',
          icon: 'build',
          onClick: async () => {
            setTimeout(async () => {
              const type = await chooseBuilding(game);
              if (!type) return;
              const check = game.canBuild(type, key);
              if (!check.ok) return toast(check.reason, 'warn');
              const r = game.build(type, key);
              toast(r.ok ? `${def(type).name} construite.` : r.reason, r.ok ? 'ok' : 'warn');
            }, 280);
          },
        }]
      : [],
  });
}

const approx = (n) => (n < 10 ? Math.round(n) : Math.round(n / 5) * 5);

export function nationSheet(game, nationId, near, attack) {
  const n = game.state.nations[nationId];
  if (!n) return;
  const border = sharesBorder(game.state, game.state.me, nationId);
  const kind = n.kind === 'npc' ? 'Nation contrôlée par l’ordinateur' : 'Joueur';
  openSheet({
    title: `<span class="dot" style="--c:${n.color}"></span> ${esc(n.name)}`,
    subtitle: kind,
    body: `
      <div class="stats">
        <div class="stat"><small>Territoire</small><b>${fmt(n.cellCount)} cases</b></div>
        <div class="stat"><small>Troupes</small><b>≈ ${fmt(approx(n.troops))}</b></div>
      </div>
      ${border ? '' : `<div class="note">${icon('info', 18)}<span>Aucune frontière commune avec ${esc(n.name)}. Étendez votre territoire jusqu’à toucher le sien pour pouvoir l’attaquer.</span></div>`}`,
    actions: [{ label: 'Attaquer', kind: 'primary', icon: 'attack', disabled: !border, onClick: () => setTimeout(() => attack(nationId, near), 260) }],
  });
}

// ── Préparation d'une attaque ──
export function attackPrep(game, gmap, nationId, near) {
  return new Promise((resolve) => {
    const n = game.state.nations[nationId];
    const zone = game.attackTarget(nationId, near);
    if (!zone.ok) {
      toast(zone.reason === 'protected-only'
        ? `Vous ne touchez que la capitale de ${esc(n.name)}, qui ne peut pas être prise.`
        : `Aucune frontière commune avec ${esc(n.name)}.`, 'warn', 3600);
      return resolve(null);
    }
    const me = game.me;
    const max = Math.floor(me.troops);
    gmap.setHighlight([{ type: 'Feature', properties: { color: '#ea5a5f' }, geometry: { type: 'MultiPolygon', coordinates: cellsPolygon(zone.keys) } }]);
    const c = cellCenter(zone.center);
    gmap.flyTo(c.lat, c.lon, Math.max(gmap.map.getZoom(), 16.6), 700);
    let troops = Math.max(CONFIG.ATTACK.minTroops, Math.round(max * 0.8));
    const enough = max >= CONFIG.ATTACK.minTroops;
    const body = el(`
      <div>
        <div class="stats">
          <div class="stat"><small>Zone ciblée</small><b>${zone.keys.length} cases</b></div>
          <div class="stat"><small>Défenseurs</small><b>≈ ${fmt(approx(n.troops * CONFIG.NPC.defendRatio))}</b></div>
        </div>
        ${enough ? `
          <div class="field" style="margin-bottom:0">
            <label>Troupes engagées</label>
            <div class="range-row"><b data-v>${troops}</b><span class="muted">sur ${fmt(max)}</span></div>
            <input class="range" type="range" min="${CONFIG.ATTACK.minTroops}" max="${max}" value="${Math.min(troops, max)}" />
          </div>
          <div class="note">${icon('info', 18)}<span>Les survivants reviennent après la bataille. Prendre de flanc ou de dos donne ×1,5.</span></div>`
        : `<div class="note warn">${icon('warn', 18)}<span>Il faut au moins ${CONFIG.ATTACK.minTroops} troupes pour attaquer. Vos villes en forment en continu.</span></div>`}
      </div>`);
    const range = body.querySelector('.range');
    range?.addEventListener('input', () => {
      troops = +range.value;
      body.querySelector('[data-v]').textContent = troops;
    });
    let launched = false;
    openSheet({
      title: `${icon('attack', 22)} Attaquer ${esc(n.name)}`,
      subtitle: 'La zone en rouge sera disputée.',
      body,
      actions: [{ label: 'Lancer la bataille', kind: 'primary', icon: 'play', disabled: !enough, onClick: () => { launched = true; } }],
      onClose: () => {
        gmap.setHighlight();
        resolve(launched ? { zone, troops: Math.min(troops, max) } : null);
      },
    });
  });
}

// ── Attaque NPC entrante ──
export function incomingAttack(game, gmap, intent) {
  return new Promise((resolve) => {
    const a = game.state.nations[intent.attackerId];
    const me = game.me;
    gmap.setHighlight([{ type: 'Feature', properties: { color: '#ea5a5f' }, geometry: { type: 'MultiPolygon', coordinates: cellsPolygon(intent.zone.keys) } }]);
    const c = cellCenter(intent.zone.center);
    gmap.flyTo(c.lat, c.lon, 16.4, 900);
    let choice = 'auto';
    openSheet({
      title: `${icon('warn', 22)} ${esc(a.name)} vous attaque`,
      subtitle: `Une zone de ${intent.zone.keys.length} cases de votre frontière est menacée.`,
      dismissable: false,
      body: `<div class="stats">
        <div class="stat"><small>Assaillants</small><b>≈ ${fmt(approx(intent.troops))}</b></div>
        <div class="stat"><small>Vos troupes</small><b>${fmt(me.troops)}</b></div>
      </div>
      <div class="note">${icon('info', 18)}<span>Défendez en personne pour manœuvrer, ou laissez vos troupes se battre seules.</span></div>`,
      actions: [
        { label: 'Défendre', kind: 'primary', icon: 'shield', onClick: () => { choice = 'battle'; } },
        { label: 'Résolution auto', onClick: () => { choice = 'auto'; } },
      ],
      onClose: () => {
        gmap.setHighlight();
        resolve(choice);
      },
    });
  });
}

// ── Menu ──
export function menuSheet(game, { onSim, onReset, onTutorial }) {
  const me = game.me;
  const st = game.state;
  const days = CONFIG.INACTIVITY;
  const body = el(`
    <div>
      <div class="stats">
        <div class="stat"><small>Territoire</small><b>${fmt(me.cellCount)}</b></div>
        <div class="stat"><small>Bâtiments</small><b>${st.buildings.filter((b) => b.owner === me.id).length}</b></div>
        <div class="stat"><small>Nations</small><b>${Object.values(st.nations).filter((n) => n.kind === 'npc').length}</b></div>
      </div>
      <div class="row">
        <div><b>Mode simulation</b><div class="muted">Touchez la carte pour déplacer une position virtuelle (test sans marcher).</div></div>
        <input type="checkbox" class="switch" ${st.sim.enabled ? 'checked' : ''} aria-label="Mode simulation" />
      </div>
      <div class="row"><div><b>Inactivité</b><div class="muted">Sans connexion pendant ${days.wipeTerritoryDays} jours, vous perdez tout votre territoire sauf la capitale. Après ${days.deleteAccountDays} jours, le compte est supprimé. Ouvrez l’appli au moins une fois par mois.</div></div></div>
      <div class="row"><div><b>Sécurité</b><div class="muted">Ne regardez pas l’écran en marchant et n’entrez jamais dans une propriété privée.</div></div></div>
      <div class="row"><div><b>Crédits</b><div class="muted">Carte © OpenStreetMap, OpenMapTiles, OpenFreeMap · Recherche Nominatim · MapLibre.</div></div></div>
    </div>`);
  body.querySelector('.switch').addEventListener('change', (e) => onSim(e.target.checked));
  openSheet({
    title: `<span class="dot" style="--c:${me.color}"></span> ${esc(me.name)}`,
    subtitle: 'Terrafront · version 1',
    body,
    actions: [
      { label: 'Tutoriel', icon: 'info', onClick: () => setTimeout(onTutorial, 280) },
      { label: 'Réinitialiser', kind: 'danger', icon: 'trash', onClick: () => { setTimeout(() => confirmReset(onReset), 280); } },
    ],
  });
}

function confirmReset(onReset) {
  openSheet({
    title: 'Réinitialiser la partie ?',
    subtitle: 'Votre capitale, votre territoire, vos bâtiments et vos ressources seront définitivement effacés.',
    actions: [
      { label: 'Annuler' },
      { label: 'Tout effacer', kind: 'danger', onClick: onReset },
    ],
  });
}

// ── Messages au retour ──
export function offlineReport(r) {
  const parts = [];
  if (r.coins >= 1) parts.push(`+${fmt(r.coins)} pièces`);
  if (r.troops >= 1) parts.push(`+${fmt(r.troops)} troupes`);
  if (r.cells >= 1) parts.push(`+${fmt(r.cells)} cases`);
  if (!parts.length) return;
  toast(`Pendant votre absence (${duration(r.dtS)}) : ${parts.join(', ')}.`, 'info', 4500);
}

export function inactivityNotice(result) {
  const I = CONFIG.INACTIVITY;
  const days = Math.floor(result.days);
  if (result.action === 'warn') {
    openSheet({
      title: `${icon('warn', 22)} Absence de ${days} jours`,
      subtitle: `Attention : après ${I.wipeTerritoryDays} jours sans connexion, vous perdez tout votre territoire sauf votre capitale. Après ${I.deleteAccountDays} jours, votre compte est supprimé.`,
      actions: [{ label: 'Compris', kind: 'primary' }],
    });
  } else if (result.action === 'wipeTerritory') {
    openSheet({
      title: `${icon('warn', 22)} Territoire perdu`,
      subtitle: `Vous étiez absent depuis ${days} jours : votre territoire a été perdu, votre capitale est intacte. Encore ${Math.max(0, I.deleteAccountDays - days)} jours d’absence et le compte sera supprimé.`,
      actions: [{ label: 'Reconquérir', kind: 'primary' }],
    });
  }
}

