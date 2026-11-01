// Petits utilitaires d'interface (aucune dépendance).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const num = (n) => (n == null || Number.isNaN(n) ? '—' : nf.format(n));

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** "2026-11-02" → "lundi 2 nov." */
export function fmtDate(iso, { weekday = true, year = false } = {}) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${weekday ? DAYS[wd] + ' ' : ''}${d} ${MONTHS[m - 1]}${year ? ' ' + y : ''}`;
}

export function fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export function unitLabel(unit) {
  return { reps: 'reps', reps_per_side: 'reps/côté', seconds: 's', meters: 'm' }[unit] || unit;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
