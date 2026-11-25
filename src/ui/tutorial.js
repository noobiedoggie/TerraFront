// Tutoriel court (premier lancement, revisitable depuis le menu).
import { icon } from './icons.js';
import { el, ui } from './kit.js';

const STEPS = [
  { i: 'capital', t: 'Votre capitale', p: 'Sa zone de 100 m est protégée : personne ne pourra jamais la prendre. Le reste de votre territoire, si.' },
  { i: 'pin', t: 'Marchez pour conquérir', p: 'Appli ouverte, chaque case libre (15 m) que vous parcourez devient la vôtre. À pied uniquement : en véhicule ou avec un GPS imprécis, rien n’est compté.' },
  { i: 'build', t: 'Construisez', p: 'Usine : des pièces. Ville : des troupes. Base d’attaque : elle étend votre territoire toute seule, même appli fermée. Touchez un bâtiment pour l’améliorer.' },
  { i: 'attack', t: 'Attaquez les voisins', p: 'Touchez une nation qui partage une frontière avec vous, puis « Attaquer ». En bataille, prenez l’ennemi de flanc ou de dos (×1,5) et encerclez-le.' },
];

export function tutorial() {
  return new Promise((resolve) => {
    let i = 0;
    const dim = el('<div class="tuto-dim"></div>');
    const card = el('<div class="tuto" role="dialog" aria-live="polite"></div>');
    ui().append(dim, card);
    const render = () => {
      const s = STEPS[i];
      card.innerHTML = `
        <div class="tuto-head"><div class="ti">${icon(s.i, 22)}</div><h3>${s.t}</h3></div>
        <p>${s.p}</p>
        <div class="tuto-foot">
          <div class="steps">${STEPS.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
          <div style="display:flex;gap:8px">
            ${i < STEPS.length - 1 ? '<button class="btn btn-sm btn-ghost" data-a="skip">Passer</button>' : ''}
            <button class="btn btn-sm btn-primary" data-a="next">${i < STEPS.length - 1 ? 'Suivant' : 'Jouer'}</button>
          </div>
        </div>`;
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
      card.querySelector('[data-a="next"]').addEventListener('click', () => (++i < STEPS.length ? render() : done()));
      card.querySelector('[data-a="skip"]')?.addEventListener('click', done);
    };
    const done = () => {
      dim.remove();
      card.remove();
      resolve();
    };
    render();
  });
}
