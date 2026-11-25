// Icônes SVG au trait (24 × 24), couleur héritée.
const P = {
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  troops: '<path d="M5 12.5l7-6 7 6M5 18.5l7-6 7 6"/>',
  cells: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  factory: '<path d="M3 20V10.5l5 3v-3l5 3v-3l5 3V4h3v16zM3 20h18"/>',
  city: '<path d="M3 20h18M5 20V9.5L9.5 7v13M9.5 20V4h6v16M15.5 20v-9H19v9"/>',
  base: '<path d="M6 21V3.5M6 4.5h11l-2.6 4 2.6 4H6"/>',
  capital: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  build: '<path d="M14.5 3.5l6 6-2.8 2.8-6-6zM11.7 6.3l-8 8a2.1 2.1 0 003 3l8-8"/>',
  center: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.6"/>',
  sim: '<path d="M12 3l7 18-7-4.2L5 21z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  attack: '<path d="M5 19L19 5M14 5h5v5M19 19L5 5M10 5H5v5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.2v.1"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 4l16 16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  split: '<path d="M12 21v-8M12 13L6.5 5M12 13l5.5-8M4 5h5M15 5h5"/>',
  retreat: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3"/>',
  play: '<path d="M7 4.5l12.5 7.5L7 19.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  gps: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
};

export function icon(name, size = 22, cls = '') {
  const filled = name === 'capital' || name === 'play';
  return `<svg class="i ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}
