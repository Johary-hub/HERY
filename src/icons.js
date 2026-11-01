// Icônes SVG en ligne (trait 2 px, style « sport »). Aucune ressource externe.
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  chart: '<path d="M4 19h16"/><path d="m5 15 4.5-5 3.5 3 6-7"/><path d="M15 6h4v4"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8.5 9.5a5 5 0 0 1 7 0"/><path d="m12 12 1.5-2.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6l2.4 1.6M17.4 16.4l2.4 1.6M4.2 18l2.4-1.6M17.4 7.6 19.8 6M2.5 12h3M18.5 12h3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-8.3.5 1.8 1.6 2.9 2.6 3.4.2-2.6 1.6-5.3 3.8-6.9-.3 2.7.8 4.6 2.1 6.3 1 1.4 1.9 3 1.9 5.2C19.5 18.3 16 21 12 21z"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m10.5 21 2-6 2.5 2.5V21M8 12l2-4.5 3.5 1 2.5 3 2.5.5M12.5 15 10 9.5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  swap: '<path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  bolt: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/>',
  warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4v1.5A3.5 3.5 0 0 0 7.8 11M16.5 6H20v1.5a3.5 3.5 0 0 1-3.8 3.5M12 13.5V17M8 20.5h8M9.5 17h5v3.5h-5z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 15.5V4.5M7 9l5-5 5 5M4.5 19.5h15"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="2.5"/><path d="M7 8v3.5M11 8v2.5M15 8v3.5M19 8v2.5"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="m6 16 4-8h5l3 8M10 8 8.5 5.5H7M12.5 16 15 8"/>',
};

export function icon(name, size = 22, cls = '') {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** Anneau de progression SVG. value ∈ [0, 1]. */
export function ring(value, { size = 76, stroke = 8, color = 'var(--accent)', track = 'var(--surface-3)', inner = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg><div class="ring-inner">${inner}</div></div>`;
}
