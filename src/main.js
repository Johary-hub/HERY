import './styles.css';
import { loadProgram } from './program.js';
import { $$, esc } from './ui.js';
import * as today from './views/today.js';
import * as workout from './views/workout.js';
import * as progress from './views/progress.js';
import * as body from './views/body.js';
import * as settings from './views/settings.js';

const routes = { today, workout, progress, body, settings };
const app = document.getElementById('app');
let program = null;
let renderToken = 0;

function currentRoute() {
  const m = location.hash.match(/^#\/([a-z]+)(?:\/(.*))?$/);
  const name = m && routes[m[1]] ? m[1] : 'today';
  return { name, param: m?.[2] ? decodeURIComponent(m[2]) : null };
}

export function navigate(path) {
  if (location.hash === `#/${path}`) route();
  else location.hash = `#/${path}`;
}

async function route() {
  const { name, param } = currentRoute();
  const token = ++renderToken;
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  const view = routes[name];
  try {
    // Chaque vue peut exposer une fonction de nettoyage (minuteur, wake lock…)
    if (route.cleanup) { route.cleanup(); route.cleanup = null; }
    const cleanup = await view.render({ app, program, param, navigate, isCurrent: () => token === renderToken });
    if (typeof cleanup === 'function') route.cleanup = cleanup;
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="alert danger"><strong>Erreur :</strong> ${esc(err.message)}</div>`;
  }
}

async function start() {
  try {
    program = await loadProgram();
  } catch (err) {
    app.innerHTML = `<div class="alert danger">Impossible de charger le programme : ${esc(err.message)}</div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/today');
  route();
}

// Service worker (cache hors ligne complet). Absent en mode dev.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

start();
