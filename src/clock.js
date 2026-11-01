// Date du jour. « ?date=AAAA-MM-JJ » dans l'URL permet de simuler un jour (tests, démonstration).
import { todayISO } from './engine.js';

export function today() {
  const forced = new URLSearchParams(location.search).get('date');
  return forced && /^\d{4}-\d{2}-\d{2}$/.test(forced) ? forced : todayISO();
}

/** Horodatage réel (ISO). La date de la séance, elle, suit today(). */
export const nowStamp = () => new Date().toISOString();
