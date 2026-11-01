// Minuteur de repos : basé sur une heure de fin (reste juste même si l'onglet est en arrière-plan).
let el = null;
let endAt = 0;
let total = 0;
let tick = null;
let audio = null;
let rang = false;

const R = 26;
const C = 2 * Math.PI * R;

function ensureEl() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'rest-timer';
  el.setAttribute('role', 'timer');
  el.innerHTML = `
    <div class="inner">
      <div class="ring" style="width:64px;height:64px">
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6"/>
          <circle class="arc" cx="32" cy="32" r="${R}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 32 32)" style="color:var(--accent);transition:stroke-dashoffset .25s linear"/>
        </svg>
        <div class="ring-inner"><span class="time" aria-live="off">0:00</span></div>
      </div>
      <div class="grow">
        <div class="lbl">Repos</div>
        <div class="sub">Bois une gorgée</div>
      </div>
      <button type="button" data-act="minus" aria-label="Retirer 15 secondes">−15</button>
      <button type="button" data-act="plus" aria-label="Ajouter 15 secondes">+15</button>
      <button type="button" class="primary" data-act="skip" aria-label="Fermer le minuteur">OK</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'plus') { endAt += 15000; total += 15000; rang = false; setFinished(false); }
    if (act === 'minus') { endAt -= 15000; }
    if (act === 'skip') stopRest();
    update();
  });
  document.body.appendChild(el);
  return el;
}

function setFinished(on) {
  el.classList.toggle('finished', on);
  el.querySelector('.lbl').textContent = on ? 'C’est reparti !' : 'Repos';
  el.querySelector('.sub').textContent = on ? 'Série suivante' : 'Bois une gorgée';
  el.querySelector('.arc').style.color = on ? 'var(--accent-ink)' : 'var(--accent)';
}

/** Doit être appelé pendant un geste utilisateur pour autoriser le son sur mobile. */
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}

function beep() {
  if (!audio) return;
  const t = audio.currentTime;
  [0, 0.35, 0.7].forEach((offset) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.3);
  });
}

function update() {
  if (!el) return;
  const left = Math.max(0, endAt - Date.now());
  const sec = Math.ceil(left / 1000);
  el.querySelector('.time').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  el.querySelector('.arc').setAttribute('stroke-dashoffset', String(C * (1 - (total ? left / total : 0))));
  if (left <= 0 && !rang) {
    rang = true;
    setFinished(true);
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    beep();
  }
}

export function startRest(seconds) {
  unlockAudio();
  ensureEl();
  total = seconds * 1000;
  endAt = Date.now() + total;
  rang = false;
  setFinished(false);
  el.classList.add('on');
  document.body.classList.add('timer-on');
  clearInterval(tick);
  tick = setInterval(update, 250);
  update();
}

export function stopRest() {
  clearInterval(tick);
  tick = null;
  if (el) el.classList.remove('on', 'finished');
  document.body.classList.remove('timer-on');
}

/* Garder l'écran allumé pendant la séance (Wake Lock API si disponible). */
let lock = null;
let wantLock = false;
async function acquire() {
  if (!wantLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { lock = await navigator.wakeLock.request('screen'); } catch { lock = null; }
}
function onVisible() { if (document.visibilityState === 'visible') acquire(); }

export function keepAwake() {
  wantLock = true;
  acquire();
  document.addEventListener('visibilitychange', onVisible);
}

export function releaseAwake() {
  wantLock = false;
  document.removeEventListener('visibilitychange', onVisible);
  lock?.release().catch(() => {});
  lock = null;
}
