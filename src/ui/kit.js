// Petits outils d'interface : création DOM, panneaux du bas, notifications.
import { icon } from './icons.js';

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => Math.floor(n).toLocaleString('fr-FR');
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
export const ui = () => document.getElementById('ui');

export function duration(s) {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;
  return `${Math.floor(s / 86400)} j`;
}

// ── Panneau du bas (un seul à la fois) ──
let current = null;

export function openSheet({ title = '', subtitle = '', body = '', actions = [], dismissable = true, onClose = null, className = '' }) {
  closeSheet(true);
  const root = el(`
    <div class="sheet-wrap ${className}">
      <div class="backdrop"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        ${dismissable ? `<button class="sheet-close" aria-label="Fermer">${icon('close', 20)}</button>` : ''}
        ${title ? `<h2 class="sheet-title">${title}</h2>` : ''}
        ${subtitle ? `<p class="sheet-sub">${subtitle}</p>` : ''}
        <div class="sheet-body"></div>
        <div class="sheet-actions"></div>
      </section>
    </div>`);
  const bodyEl = root.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);
  const actionsEl = root.querySelector('.sheet-actions');
  const sheet = { root, body: bodyEl, close: () => closeSheet(), onClose, buttons: [] };
  for (const a of actions) {
    const b = el(`<button class="btn btn-${a.kind || 'ghost'}" ${a.disabled ? 'disabled' : ''}>${a.icon ? icon(a.icon, 20) : ''}<span>${a.label}</span></button>`);
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      const keep = await a.onClick?.(sheet);
      if (keep !== false && current === sheet) closeSheet();
    });
    actionsEl.append(b);
    sheet.buttons.push(b);
  }
  if (!actions.length) actionsEl.remove();
  if (dismissable) {
    root.querySelector('.backdrop').addEventListener('click', () => closeSheet());
    root.querySelector('.sheet-close').addEventListener('click', () => closeSheet());
  }
  ui().append(root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  current = sheet;
  return sheet;
}

export function closeSheet(silent = false) {
  if (!current) return;
  const s = current;
  current = null;
  s.root.classList.remove('open');
  setTimeout(() => s.root.remove(), 260);
  if (!silent) s.onClose?.();
  else s.onClose?.('replaced');
}

export const sheetOpen = () => !!current;

// ── Notifications ──
export function toast(message, kind = 'info', ms = 2800) {
  let box = document.querySelector('.toasts');
  if (!box) ui().append((box = el('<div class="toasts" aria-live="polite"></div>')));
  const ic = { info: 'info', ok: 'check', warn: 'warn', error: 'warn' }[kind] || 'info';
  const t = el(`<div class="toast toast-${kind}">${icon(ic, 18)}<span>${message}</span></div>`);
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function spinner() {
  return '<span class="spinner" aria-hidden="true"></span>';
}
