// Écran de bataille 2D (canvas, vue du dessus). Le joueur sélectionne un groupe puis touche
// la carte pour l'y envoyer. Combats abstraits : groupes, lignes de contact, zone disputée.
import { CONFIG } from '../config.js';
import { OBJECTIVE_R, groupRadius, orderMove, retreat, sideTroops, splitGroup, startBattle, step } from '../engine/battle.js';
import { icon } from './icons.js';
import { el, esc, fmt, ui } from './kit.js';

const B = CONFIG.BATTLE;

export function openBattle(game, battle) {
  return new Promise((resolve) => {
    const mine = battle.playerSide;
    const foe = mine === 'A' ? 'D' : 'A';
    const meInfo = mine === 'A' ? battle.attacker : battle.defender;
    const foeInfo = mine === 'A' ? battle.defender : battle.attacker;
    const colors = { [mine]: meInfo.color, [foe]: foeInfo.color };
    const root = el(`
      <div class="battle">
        <div class="battle-top">
          <div class="battle-title"><h2>${mine === 'A' ? 'Assaut' : 'Défense'} · ${esc(foeInfo.name)}</h2><span class="timer">${icon('clock', 16)}<span data-t></span></span></div>
          <div class="forces">
            <span class="num" data-f="me" style="color:${meInfo.color}"></span>
            <div class="force-bar"><span data-b="me" style="background:${meInfo.color}"></span><span data-b="foe" style="background:${foeInfo.color}"></span></div>
            <span class="num" data-f="foe" style="color:${foeInfo.color}"></span>
          </div>
          <div class="battle-hint"></div>
        </div>
        <canvas></canvas>
        <div class="battle-bottom">
          <button class="btn" data-a="split">${icon('split', 20)}<span>Diviser</span></button>
          <button class="btn btn-primary" data-a="go">${icon('play', 18)}<span>${mine === 'A' ? "Lancer l'assaut" : 'Engager'}</span></button>
        </div>
      </div>`);
    ui().append(root);
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const hint = root.querySelector('.battle-hint');
    const splitBtn = root.querySelector('[data-a="split"]');
    const goBtn = root.querySelector('[data-a="go"]');
    let selected = battle.groups.find((g) => g.side === mine)?.id ?? null;
    let view = null;
    let terrain = null;
    let raf = 0;
    let last = performance.now();
    let ended = false;

    // ── Vue : le joueur est toujours en bas de l'écran ──
    const flip = mine === 'D' ? -1 : 1;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      view = { w, h, dpr, cx: w / 2, cy: h / 2, s: Math.min(w, h) / (B.fieldM * 0.95) };
      terrain = drawTerrain();
    };
    const toScreen = (x, y) => [view.cx + flip * x * view.s, view.cy + flip * y * view.s];
    const toWorld = (sx, sy) => [(sx - view.cx) / (view.s * flip), (sy - view.cy) / (view.s * flip)];

    // Terrain statique (vraies cases autour de la zone), pré-rendu une fois.
    function drawTerrain() {
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const c = off.getContext('2d');
      c.scale(view.dpr, view.dpr);
      c.fillStyle = '#0a0e14';
      c.fillRect(0, 0, view.w, view.h);
      const ownerColor = (o) => (o === battle.attacker.id ? battle.attacker.color : o === battle.defender.id ? battle.defender.color : game.state.nations[o]?.color);
      for (const cell of battle.field?.cells || []) {
        c.beginPath();
        cell.pts.forEach(([x, y], i) => (i ? c.lineTo(...toScreen(x, y)) : c.moveTo(...toScreen(x, y))));
        c.closePath();
        const col = cell.owner ? ownerColor(cell.owner) : null;
        if (col) {
          c.globalAlpha = cell.zone ? 0.34 : cell.protected ? 0.3 : 0.16;
          c.fillStyle = col;
          c.fill();
        }
        c.globalAlpha = 0.07;
        c.strokeStyle = '#fff';
        c.lineWidth = 1;
        c.stroke();
      }
      c.globalAlpha = 1;
      return off;
    }

    // ── Entrées ──
    canvas.addEventListener('pointerdown', (e) => {
      if (ended) return;
      const r = canvas.getBoundingClientRect();
      const [x, y] = toWorld(e.clientX - r.left, e.clientY - r.top);
      const tol = 10 / view.s;
      const hit = (side) => battle.groups.find((g) => g.side === side && Math.hypot(g.x - x, g.y - y) <= groupRadius(g.troops) + tol);
      const own = hit(mine);
      if (own) selected = own.id;
      else if (selected != null) {
        const target = hit(foe);
        orderMove(battle, selected, target ? target.x : x, target ? target.y : y);
      }
      refreshButtons();
    });
    splitBtn.addEventListener('click', () => {
      const n = splitGroup(battle, selected);
      if (n) selected = n.id;
      refreshButtons();
    });
    goBtn.addEventListener('click', () => {
      if (battle.phase === 'plan') {
        // sans ordre, les groupes d'assaut chargent la zone
        if (mine === 'A') for (const g of battle.groups) if (g.side === 'A' && !g.target) orderMove(battle, g.id, g.x * 0.4, 0);
        startBattle(battle);
        goBtn.className = 'btn btn-danger';
        goBtn.innerHTML = `${icon('retreat', 20)}<span>${mine === 'A' ? 'Retraite' : 'Abandonner'}</span>`;
      } else retreat(battle, mine);
    });
    function refreshButtons() {
      const g = battle.groups.find((q) => q.id === selected);
      splitBtn.disabled = !g || g.troops < 4;
    }

    // ── Boucle ──
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(battle, dt);
      if (!battle.groups.some((g) => g.id === selected)) selected = battle.groups.find((g) => g.side === mine)?.id ?? null;
      draw();
      top();
      if (battle.phase === 'done' && !ended) return end();
      raf = requestAnimationFrame(frame);
    };

    function top() {
      const a = sideTroops(battle, mine);
      const d = sideTroops(battle, foe);
      root.querySelector('[data-f="me"]').textContent = fmt(Math.ceil(a));
      root.querySelector('[data-f="foe"]').textContent = fmt(Math.ceil(d));
      root.querySelector('[data-b="me"]').style.flexGrow = a;
      root.querySelector('[data-b="foe"]').style.flexGrow = d;
      const left = Math.max(0, B.timeLimitS - battle.t);
      root.querySelector('[data-t]').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      let h;
      if (battle.phase === 'plan') h = mine === 'A' ? 'Touchez un groupe, puis la carte pour l’y envoyer. Sans ordre, il charge la zone. De flanc ou de dos : ×1,5.' : 'Placez vos groupes pour intercepter l’assaut. De flanc ou de dos : ×1,5.';
      else if (battle.groups.some((g) => g.side === mine && g.encircled)) h = 'Un de vos groupes est encerclé : sa force baisse.';
      else if (battle.groups.some((g) => g.side === foe && g.encircled)) h = 'Ennemi encerclé : sa force baisse.';
      else if (battle.groups.some((g) => g.side === foe && g.flanked)) h = 'Attaque de flanc : force ×1,5 !';
      else if (battle.hold > 0) h = mine === 'A' ? `Tenez la zone : ${Math.ceil(B.holdSeconds - battle.hold)} s` : `L’ennemi tient la zone : ${Math.ceil(B.holdSeconds - battle.hold)} s`;
      else h = mine === 'A' ? 'Détruisez les défenseurs ou tenez la zone seul.' : 'Repoussez l’assaut jusqu’à la fin du temps.';
      if (hint.textContent !== h) hint.textContent = h;
    }

    function draw() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.drawImage(terrain, 0, 0, view.w, view.h);
      const [ox, oy] = toScreen(0, 0);
      // zone disputée + progression de la prise
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox, oy, OBJECTIVE_R * view.s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (battle.hold > 0) {
        ctx.strokeStyle = battle.attacker.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ox, oy, OBJECTIVE_R * view.s, -Math.PI / 2, -Math.PI / 2 + (battle.hold / B.holdSeconds) * Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ZONE', ox, oy - OBJECTIVE_R * view.s - 8);

      const byId = new Map(battle.groups.map((g) => [g.id, g]));
      // ordres en cours (vos groupes)
      for (const g of battle.groups) {
        if (g.side !== mine || !g.target) continue;
        const [x1, y1] = toScreen(g.x, g.y);
        const [x2, y2] = toScreen(g.target.x, g.target.y);
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = g.id === selected ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x2, y2, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // lignes de contact
      for (const c of battle.contacts) {
        const a = byId.get(c.from);
        const b = byId.get(c.to);
        if (!a || !b) continue;
        const [x1, y1] = toScreen(a.x, a.y);
        const [x2, y2] = toScreen(b.x, b.y);
        ctx.strokeStyle = c.flank ? '#f0c060' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = c.flank ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // groupes
      const t = performance.now() / 1000;
      for (const g of battle.groups) {
        const [x, y] = toScreen(g.x, g.y);
        const r = groupRadius(g.troops) * view.s;
        const f = g.facing + (flip < 0 ? Math.PI : 0);
        ctx.fillStyle = colors[g.side];
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // orientation : petite flèche sur le bord
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(f) * (r + 8), y + Math.sin(f) * (r + 8));
        ctx.lineTo(x + Math.cos(f + 0.35) * (r + 1), y + Math.sin(f + 0.35) * (r + 1));
        ctx.lineTo(x + Math.cos(f - 0.35) * (r + 1), y + Math.sin(f - 0.35) * (r + 1));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(8,11,16,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        if (g.encircled) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = '#ea5a5f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (g.id === selected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, r + 4 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.font = `700 ${Math.max(11, Math.min(16, r * 0.8))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(8,11,16,0.8)';
        ctx.strokeText(String(Math.ceil(g.troops)), x, y + 0.5);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.ceil(g.troops)), x, y + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    function end() {
      ended = true;
      const outcome = game.finishBattle(battle);
      const res = battle.result;
      const won = res.winner === mine;
      let line;
      if (mine === 'A') line = won ? `Zone conquise : <b>+${outcome.cells} cases</b>` : `${esc(foeInfo.name)} conserve la zone.`;
      else line = won ? 'Frontière tenue. La zone reste à vous.' : `Zone perdue : <b>−${outcome.cells} cases</b>`;
      if (outcome.destroyed) line += `<br>${outcome.destroyed} bâtiment${outcome.destroyed > 1 ? 's' : ''} détruit${outcome.destroyed > 1 ? 's' : ''}.`;
      const overlay = el(`
        <div class="battle-end"><div class="card">
          <div class="badge ${won ? 'win' : 'lose'}">${icon(won ? 'check' : 'shield', 30)}</div>
          <h2 class="${won ? 'win' : 'lose'}">${won ? 'Victoire' : 'Défaite'}</h2>
          <p class="muted" style="margin:0">${line}</p>
          <div class="stats">
            <div class="stat"><small>Vos pertes</small><b>${fmt(res.losses[mine])}</b></div>
            <div class="stat"><small>Pertes ennemies</small><b>${fmt(res.losses[foe])}</b></div>
            <div class="stat"><small>Rentrées</small><b>${fmt(res.survivors[mine])}</b></div>
          </div>
          <button class="btn btn-primary btn-block">Retour à la carte</button>
        </div></div>`);
      root.append(overlay);
      overlay.querySelector('button').addEventListener('click', () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        root.remove();
        resolve({ won, outcome });
      });
    }

    window.addEventListener('resize', resize);
    requestAnimationFrame(() => {
      resize();
      refreshButtons();
      raf = requestAnimationFrame(frame);
    });
  });
}
