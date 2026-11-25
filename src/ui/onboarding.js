// Écrans d'arrivée : bienvenue, sécurité, pseudo et couleur.
import { CONFIG } from '../config.js';
import { icon } from './icons.js';
import { el, ui } from './kit.js';

function show(html) {
  const screen = el(html);
  ui().append(screen);
  const leave = () => {
    screen.classList.add('leaving');
    setTimeout(() => screen.remove(), 300);
  };
  return { screen, leave };
}

export function welcomeScreen() {
  return new Promise((resolve) => {
    const { screen, leave } = show(`
      <div class="screen">
        <div class="screen-grow">
          <div class="eyebrow">Stratégie · Monde réel</div>
          <h1 class="brand">TERRAFRONT</h1>
          <p class="lead">Fondez votre nation sur la vraie carte. Marchez pour conquérir, construisez, défendez vos frontières.</p>
          <ul class="feature-list">
            <li><div class="fi">${icon('capital')}</div><div><b>Une capitale protégée</b><span>Placée où vous le souhaitez, elle ne peut jamais tomber.</span></div></li>
            <li><div class="fi">${icon('pin')}</div><div><b>La conquête à pied</b><span>Chaque case libre que vous parcourez devient la vôtre.</span></div></li>
            <li><div class="fi">${icon('attack')}</div><div><b>Des batailles tactiques</b><span>Prenez de flanc, encerclez : la stratégie peut battre le nombre.</span></div></li>
          </ul>
        </div>
        <div class="screen-actions"><button class="btn btn-primary btn-block">Commencer</button></div>
      </div>`);
    screen.querySelector('button').addEventListener('click', () => {
      leave();
      resolve();
    });
  });
}

export function safetyScreen() {
  return new Promise((resolve) => {
    const { screen, leave } = show(`
      <div class="screen">
        <div class="screen-grow">
          <div class="eyebrow">Avant de jouer</div>
          <h2>Jouez en sécurité</h2>
          <p class="lead">Terrafront se joue dehors, dans la vraie vie. Trois règles simples :</p>
          <ul class="feature-list">
            <li><div class="fi">${icon('eye')}</div><div><b>Ne regardez pas votre téléphone en marchant</b><span>Consultez la carte à l'arrêt. Vos pas comptent tant que l'appli reste ouverte.</span></div></li>
            <li><div class="fi">${icon('lock')}</div><div><b>N'entrez jamais dans une propriété privée</b><span>Restez sur l'espace public. Aucune case ne vaut une infraction.</span></div></li>
            <li><div class="fi">${icon('warn')}</div><div><b>Restez attentif à la circulation</b><span>Traversez aux passages piétons, gardez les yeux sur la route.</span></div></li>
          </ul>
        </div>
        <div class="screen-actions"><button class="btn btn-primary btn-block">J'ai compris</button></div>
      </div>`);
    screen.querySelector('button').addEventListener('click', () => {
      leave();
      resolve();
    });
  });
}

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u;

export function profileScreen(message = '') {
  return new Promise((resolve) => {
    let color = CONFIG.PLAYER_COLORS[0].hex;
    const { screen, leave } = show(`
      <div class="screen">
        <div class="screen-grow">
          <div class="eyebrow">Votre nation</div>
          <h2>Pseudo et couleur</h2>
          ${message ? `<div class="note warn">${icon('warn', 18)}<span>${message}</span></div>` : ''}
          <div class="field">
            <label for="nm">Pseudo</label>
            <input id="nm" class="input" maxlength="18" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="ex. Aurélien" />
            <div class="hint" id="nm-hint">2 à 18 caractères. Il servira de nom à votre nation.</div>
          </div>
          <div class="field">
            <label>Couleur</label>
            <div class="swatches" role="radiogroup" aria-label="Couleur">
              ${CONFIG.PLAYER_COLORS.map((c, i) => `<button class="swatch" role="radio" aria-label="${c.name}" aria-checked="${i === 0}" data-c="${c.hex}" style="--c:${c.hex}">${icon('check', 22)}</button>`).join('')}
            </div>
          </div>
          <div class="emblem-preview" style="--c:${color}"><div class="em">${icon('capital', 20)}</div><div><b id="pv">Votre nation</b><div class="muted" style="font-size:13px">Aperçu sur la carte</div></div></div>
          <div class="note">${icon('coin', 18)}<span><b style="color:var(--text)">${CONFIG.START.coins} pièces offertes</b> pour vos premières constructions.</span></div>
        </div>
        <div class="screen-actions"><button class="btn btn-primary btn-block" id="go" disabled>Fonder ma nation</button></div>
      </div>`);
    const input = screen.querySelector('#nm');
    const hint = screen.querySelector('#nm-hint');
    const go = screen.querySelector('#go');
    const pv = screen.querySelector('#pv');
    const preview = screen.querySelector('.emblem-preview');
    const validate = () => {
      const v = input.value.trim();
      const ok = v.length >= 2 && v.length <= 18 && NAME_RE.test(v);
      go.disabled = !ok;
      pv.textContent = v || 'Votre nation';
      hint.classList.toggle('error', !!v && !ok);
      hint.textContent = v && !ok ? 'Lettres, chiffres, espaces, apostrophes et tirets uniquement.' : '2 à 18 caractères. Il servira de nom à votre nation.';
      return ok;
    };
    input.addEventListener('input', validate);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && validate() && input.blur());
    screen.querySelectorAll('.swatch').forEach((s) =>
      s.addEventListener('click', () => {
        screen.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-checked', String(x === s)));
        color = s.dataset.c;
        preview.style.setProperty('--c', color);
      }),
    );
    go.addEventListener('click', () => {
      if (!validate()) return;
      leave();
      resolve({ name: input.value.trim().replace(/\s+/g, ' '), color });
    });
    setTimeout(() => input.focus(), 350);
  });
}

