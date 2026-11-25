// Placement de la capitale : position actuelle ou adresse, vérification, confirmation sur la carte.
import { CONFIG } from '../config.js';
import { currentPosition, errorKind } from '../platform/gps.js';
import { searchAddress } from '../platform/geocode.js';
import { icon } from './icons.js';
import { closeSheet, el, esc, openSheet, spinner, ui } from './kit.js';

export function placeCapital(game, gmap, setClick) {
  return new Promise((resolve) => {
    const color = game.me.color;
    let dock = null;
    let point = null;

    const showDock = (html) => {
      dock?.remove();
      dock = el(`<div class="dock">${html}</div>`);
      ui().append(dock);
      return dock;
    };

    // Étape 1 : choisir la méthode
    const choose = (error = '') => {
      setClick(null);
      gmap.setPin(null);
      const d = showDock(`
        <h3>Placez votre capitale</h3>
        <p>Elle crée une zone protégée de 100 m qui ne pourra jamais être conquise. Vous n'aurez qu'une capitale.</p>
        ${error ? `<div class="note error" style="margin:0 0 12px">${icon('warn', 18)}<span>${error}</span></div>` : ''}
        <div class="btns">
          <button class="btn btn-primary" data-a="gps">${icon('gps', 20)}<span>Utiliser ma position actuelle</span></button>
          <button class="btn" data-a="addr">${icon('search', 20)}<span>Entrer une adresse</span></button>
        </div>
        <div class="note" style="margin-bottom:0">${icon('lock', 18)}<span>Conseil vie privée : évitez de la placer exactement chez vous.</span></div>`);
      const gpsBtn = d.querySelector('[data-a="gps"]');
      gpsBtn.addEventListener('click', async () => {
        gpsBtn.disabled = true;
        gpsBtn.innerHTML = `${spinner()}<span>Localisation…</span>`;
        try {
          const p = await currentPosition();
          goTo(p.lat, p.lon, 'Votre position actuelle');
        } catch (e) {
          choose(errorKind(e) === 'denied'
            ? "Accès à la position refusé. Autorisez-le dans les réglages du téléphone, ou entrez une adresse."
            : 'Position introuvable pour le moment. Réessayez à l’extérieur, ou entrez une adresse.');
        }
      });
      d.querySelector('[data-a="addr"]').addEventListener('click', addressSearch);
    };

    // Recherche d'adresse (Nominatim : recherche explicite, pas d'autocomplétion)
    const addressSearch = () => {
      const body = el(`
        <div>
          <form class="search-row">
            <input class="input" type="search" enterkeyhint="search" placeholder="Adresse, ville, lieu…" autocomplete="off" />
            <button class="btn btn-primary" type="submit" aria-label="Rechercher">${icon('search', 20)}</button>
          </form>
          <div class="results"></div>
        </div>`);
      const input = body.querySelector('input');
      const results = body.querySelector('.results');
      body.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q.length < 3) {
          results.innerHTML = '<div class="state-msg">Saisissez au moins 3 caractères.</div>';
          return;
        }
        input.blur();
        results.innerHTML = `<div class="state-msg">${spinner()}Recherche…</div>`;
        try {
          const list = await searchAddress(q);
          if (!list.length) {
            results.innerHTML = '<div class="state-msg">Aucun résultat. Essayez une autre formulation.</div>';
            return;
          }
          results.innerHTML = '';
          for (const r of list) {
            const b = el(`<button class="result">${icon('pin', 18)}<span>${esc(r.label)}</span></button>`);
            b.addEventListener('click', () => {
              closeSheet(true);
              goTo(r.lat, r.lon, r.label);
            });
            results.append(b);
          }
        } catch {
          results.innerHTML = '<div class="state-msg">Recherche impossible. Vérifiez votre connexion et réessayez.</div>';
        }
      });
      openSheet({ title: 'Entrer une adresse', subtitle: 'Choisissez parmi les résultats proposés.', body });
      setTimeout(() => input.focus(), 300);
    };

    // Étape 2 : survol de la région (les nations voisines apparaissent), puis confirmation
    const goTo = async (lat, lon, label) => {
      showDock(`<div class="state-msg">${spinner()}Préparation de la carte…</div>`);
      await gmap.flyTo(lat, lon, 13.4, 1800);
      await gmap.idle(3500);
      game.previewArea(lat, lon, (a, b) => gmap.isWater(a, b));
      gmap.renderMarkers();
      await gmap.flyTo(lat, lon, CONFIG.MAP.capitalZoom - 0.3, 1400);
      setClick((p) => movePoint(p.lat, p.lon, 'Point choisi sur la carte'));
      movePoint(lat, lon, label);
    };

    const movePoint = async (lat, lon, label) => {
      point = { lat, lon };
      gmap.setPin(lat, lon, color);
      const check = await game.checkCapital(lat, lon);
      const err = check.ok ? '' : reasonText(game, check);
      const d = showDock(`
        <h3>Confirmer l'emplacement</h3>
        <div class="addr">${icon('pin', 18)}<span>${esc(label)}</span></div>
        ${err
          ? `<div class="note error" style="margin:0 0 12px">${icon('warn', 18)}<span>${err}</span></div>`
          : '<p>Touchez la carte pour déplacer le point. Le cercle montre votre zone protégée.</p>'}
        <div class="btns two">
          <button class="btn" data-a="back">Changer</button>
          <button class="btn btn-primary" data-a="ok" ${err ? 'disabled' : ''}>${icon('check', 20)}<span>Confirmer</span></button>
        </div>`);
      d.querySelector('[data-a="back"]').addEventListener('click', () => choose());
      const ok = d.querySelector('[data-a="ok"]');
      ok.addEventListener('click', async () => {
        ok.disabled = true;
        const r = await game.placeCapital(point.lat, point.lon);
        if (!r.ok) return movePoint(point.lat, point.lon, label);
        setClick(null);
        gmap.setPin(null);
        dock.remove();
        gmap.renderMarkers();
        await gmap.flyTo(point.lat, point.lon, CONFIG.MAP.capitalZoom, 1200);
        resolve();
      });
    };

    choose();
  });
}

function reasonText(game, check) {
  const n = game.state.nations[check.nationId];
  const name = n ? `<b>${esc(n.name)}</b>` : 'une autre nation';
  if (check.reason === 'near') return `Trop près de la capitale de ${name} (${CONFIG.CAPITAL.minDistanceM} m minimum). Touchez la carte pour déplacer le point.`;
  return `Ce lieu appartient déjà à ${name}. Touchez la carte pour déplacer le point.`;
}
