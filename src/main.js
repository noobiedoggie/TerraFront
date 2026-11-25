import './styles.css';
import { App } from '@capacitor/app';
import { CONFIG } from './config.js';
import { cellAt } from './engine/grid.js';
import { buildingAt } from './engine/buildings.js';
import { Game } from './game.js';
import { GameMap } from './ui/map.js';
import { Hud } from './ui/hud.js';
import { closeSheet, el, esc, openSheet, sheetOpen, toast, ui } from './ui/kit.js';
import { profileScreen, safetyScreen, welcomeScreen } from './ui/onboarding.js';
import { placeCapital } from './ui/placement.js';
import * as panels from './ui/panels.js';
import { openBattle } from './ui/battle.js';
import { tutorial } from './ui/tutorial.js';
import { icon } from './ui/icons.js';

const game = new Game();
let gmap = null;
let hud = null;
let clickHandler = null;
let inBattle = false;
const setClick = (fn) => { clickHandler = fn; };

// ── Démarrage ──
async function boot() {
  const splash = el(`<div class="splash"><div class="splash-in"><div class="eyebrow">Stratégie · Monde réel</div><h1 class="brand">TERRAFRONT</h1><span class="spinner"></span></div></div>`);
  document.body.append(splash);
  let res;
  try {
    gmap = new GameMap(document.getElementById('map'), game);
    [res] = await Promise.all([game.load(), gmap.init()]);
  } catch (e) {
    console.error(e);
    splash.remove();
    return fatal(e);
  }
  game.on('territory', () => gmap.render());
  gmap.on('click', (p) => (clickHandler ? clickHandler(p) : onMapTap(p)));
  gmap.on('marker', onMarker);
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 500);
  lifecycle();

  if (res.status === 'ok' || res.status === 'firstBuild') {
    const c = game.me.capital;
    gmap.map.jumpTo({ center: [c.lon, c.lat], zoom: CONFIG.MAP.capitalZoom });
    gmap.renderMarkers();
    gmap.render();
  }
  if (res.status === 'new' || res.status === 'deleted') await onboarding(res.status === 'deleted');
  if (gmap.offline) offlineChip();
  if (res.status !== 'ok') {
    if (!game.me.capital) await placeCapital(game, gmap, setClick);
    await firstBuild();
    await game.setFlag('tutorialDone');
    await tutorial();
  }
  enterGame();
  if (res.status === 'ok') {
    panels.inactivityNotice(res.inactivity);
    if (res.report?.offline && res.report.dtS > 60) panels.offlineReport(res.report);
  }
}

async function onboarding(deleted) {
  if (!game.state.flags.safetyAck) {
    await welcomeScreen();
    await safetyScreen();
    await game.setFlag('safetyAck');
  }
  const msg = deleted ? `Votre compte a été supprimé après ${CONFIG.INACTIVITY.deleteAccountDays} jours d’inactivité. Fondez une nouvelle nation.` : '';
  const { name, color } = await profileScreen(msg);
  await game.createPlayer(name, color);
  toast(`+${CONFIG.START.coins} pièces offertes. Bienvenue, ${esc(name)} !`, 'ok', 3500);
}

async function firstBuild() {
  for (;;) {
    const type = await panels.chooseBuilding(game, {
      types: ['factory', 'city'],
      title: 'Première construction',
      subtitle: `Vous avez ${Math.floor(game.me.coins)} pièces. Choisissez une usine ou une ville, puis placez-la sur votre territoire.`,
      dismissable: false,
    });
    if (type && (await panels.pickCell(game, gmap, type, setClick, { cancellable: false }))) break;
  }
  await game.setFlag('firstBuildDone');
}

let entered = false;
function enterGame() {
  if (entered) return;
  entered = true;
  hud = new Hud(game, { build: onBuild, center: onCenter, sim: () => setSim(!game.state.sim.enabled), menu: onMenu, gps: onGpsChip });
  game.on('tick', () => hud.update());
  game.on('gps', (s) => hud.setGps(s.status, s));
  game.on('position', (p) => gmap.setPosition(p, game.state.sim.enabled, game.me.color));
  game.on('captured', (n) => hud.gain(n));
  game.on('buildings', () => gmap.renderMarkers());
  game.on('offline-report', panels.offlineReport);
  game.on('news', (m) => toast(esc(m), 'info', 3500));
  game.on('attack-incoming', onIncoming);
  if (chip) hud.root.querySelector('.hud-chips').append(chip);
  gmap.renderMarkers();
  game.start();
  if (game.state.sim.enabled) game.setSimulation(true);
}

// ── Interactions carte ──
function onMapTap(p) {
  if (!entered) return;
  const st = game.state;
  const k = cellAt(p.lat, p.lon);
  const owner = st.cells.get(k);
  if (st.sim.enabled && (owner === undefined || owner === st.me)) return game.simulateWalkTo(p.lat, p.lon);
  if (owner === undefined) return toast('Case libre : marchez dessus pour la conquérir.');
  if (owner !== st.me) return panels.nationSheet(game, owner, p, attackFlow);
  const b = buildingAt(st, k);
  if (b) return panels.buildingSheet(game, gmap, b.id);
  if (game.me.capital.key === k) return panels.capitalSheet(game, st.me, attackFlow);
  panels.ownCellSheet(game, gmap, k, setClick);
}

function onMarker({ kind, id, lat, lon }) {
  if (clickHandler) return clickHandler({ lat, lon }); // mode placement : le toucher vaut pour la case dessous
  if (!entered) return;
  if (kind === 'building') panels.buildingSheet(game, gmap, id);
  else panels.capitalSheet(game, id, attackFlow);
}

async function onBuild() {
  if (clickHandler) return;
  const type = await panels.chooseBuilding(game);
  if (type) await panels.pickCell(game, gmap, type, setClick);
}

function onCenter() {
  const p = game.position || game.me.capital;
  gmap.flyTo(p.lat, p.lon, Math.max(gmap.map.getZoom(), CONFIG.MAP.capitalZoom), 900);
}

async function setSim(on) {
  await game.setSimulation(on);
  hud.update();
  toast(on ? 'Simulation : touchez la carte pour vous déplacer.' : 'Simulation désactivée : retour au GPS.', 'info', 3200);
}

function onGpsChip() {
  const s = game.state.sim.enabled ? 'sim' : game.gpsStatus;
  const text = {
    sim: 'Votre position est virtuelle : touchez une case libre ou à vous pour vous y déplacer.',
    ok: 'Le GPS fonctionne. Chaque case libre que vous traversez à pied est conquise.',
    searching: 'Recherche du signal… Le GPS est plus précis à l’extérieur, loin des grands bâtiments.',
    weak: `Précision insuffisante : les positions à plus de ${CONFIG.GPS.maxAccuracyM} m près sont ignorées.`,
    fast: `Vitesse supérieure à ${CONFIG.GPS.maxSpeedKmh} km/h : la conquête ne compte qu’à pied.`,
    denied: 'La localisation est refusée. Autorisez-la dans Réglages › Applications › Terrafront › Autorisations, ou utilisez le mode simulation.',
    unavailable: 'Le GPS est indisponible. Activez la localisation du téléphone, ou utilisez le mode simulation.',
    off: 'Le GPS est inactif.',
  }[s];
  openSheet({
    title: `${icon('gps', 22)} Position`,
    subtitle: text,
    actions: [{ label: game.state.sim.enabled ? 'Revenir au GPS' : 'Mode simulation', kind: 'primary', onClick: () => setSim(!game.state.sim.enabled) }],
  });
}

function onMenu() {
  panels.menuSheet(game, {
    onSim: (on) => setSim(on),
    onTutorial: tutorial,
    onReset: async () => {
      await game.reset();
      location.reload();
    },
  });
}

// ── Combats ──
async function attackFlow(nationId, near) {
  const prep = await panels.attackPrep(game, gmap, nationId, near);
  if (!prep) return;
  const r = await game.startAttack(nationId, prep.zone, prep.troops);
  if (!r.ok) return toast(esc(r.reason), 'warn');
  await battle(r.battle);
}

async function battle(b) {
  inBattle = true;
  await openBattle(game, b);
  inBattle = false;
}

async function onIncoming(intent) {
  const name = game.state.nations[intent.attackerId]?.name || 'Une nation';
  const choice = inBattle || clickHandler ? 'auto' : await panels.incomingAttack(game, gmap, intent);
  const b = game.defend(intent, Math.floor(game.me.troops), choice === 'auto');
  if (!b) return;
  if (choice === 'battle') return battle(b);
  const out = game.finishBattle(b);
  if (b.result.winner === 'D') toast(`Attaque de ${esc(name)} repoussée.`, 'ok', 3500);
  else toast(`${esc(name)} a pris ${out.cells} cases de votre frontière.`, 'warn', 4000);
}

// ── Cycle de vie (premier plan / arrière-plan) ──
function lifecycle() {
  const pause = () => game.pause();
  const resume = async () => {
    const r = await game.resume();
    if (!r) return;
    if (r.status === 'deleted') return location.reload();
    panels.inactivityNotice(r.inactivity);
    if (r.report?.offline && r.report.dtS > 60) panels.offlineReport(r.report);
  };
  App.addListener('appStateChange', ({ isActive }) => (isActive ? resume() : pause())).catch(() => {});
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  App.addListener('backButton', () => {
    if (sheetOpen()) closeSheet();
    else if (!inBattle) App.minimizeApp();
  }).catch(() => {});
}

let chip = null;
function offlineChip() {
  chip = el(`<button class="chip warn"><span class="led"></span><span>Carte hors ligne · Réessayer</span></button>`);
  const box = el('<div class="floating-chips"></div>');
  box.append(chip);
  ui().append(box);
  chip.addEventListener('click', async () => {
    if (await gmap.retryStyle()) {
      chip.remove();
      box.remove();
    } else toast('Fond de carte toujours indisponible. Le jeu continue sans.', 'warn');
  });
}

function fatal(e) {
  const s = el(`<div class="screen"><div class="screen-grow"><div class="eyebrow">Erreur</div><h2>Impossible de démarrer</h2><p class="lead">${esc(e?.message || e)}</p></div><div class="screen-actions"><button class="btn btn-primary btn-block">Réessayer</button></div></div>`);
  ui().append(s);
  s.querySelector('button').addEventListener('click', () => location.reload());
}

boot();

// Outil de test sur PC (mode développement uniquement) : window.terrafront.game / .map
if (import.meta.env.DEV) window.terrafront = { game, get map() { return gmap; } };
