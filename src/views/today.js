import * as E from '../engine.js';
import { loadContext, startWorkout } from '../session.js';
import { getActiveWorkout } from '../db.js';
import { esc, fmtDate, unitLabel, DAY_SHORT } from '../ui.js';
import { icon, ring } from '../icons.js';
import { openVideo } from '../video.js';

/** "Full-body A — Fondation" → ["Full-body A", "Fondation"] */
const splitName = (name) => {
  const [a, ...rest] = name.split(/\s+—\s+/);
  return [a, rest.join(' — ')];
};

function exerciseList(program, session) {
  return `<ul class="ex-list">${session.exercises.map((e, i) => {
    const ex = program.exercises[e.id];
    const r = e.range[0] === e.range[1] ? e.range[0] : `${e.range[0]}–${e.range[1]}`;
    return `<li><span class="num">${i + 1}</span>
      <div class="grow"><div class="n">${esc(ex.name)}</div><div class="m">${e.sets} séries × ${r} ${unitLabel(ex.unit)}</div></div>
      <button type="button" class="icon-btn" data-video="${esc(e.id)}" aria-label="Vidéo : ${esc(ex.name)}">${icon('play', 18)}</button></li>`;
  }).join('')}</ul>`;
}

function heroMeta(session) {
  const totalSets = session.exercises.reduce((t, e) => t + e.sets, 0);
  return `<div class="hero-meta">
    <span>${icon('dumbbell', 16)}${session.exercises.length} exercices</span>
    <span>${icon('target', 16)}${totalSets} séries</span>
    <span>${icon('bike', 16)}cardio ${session.cardioMin} min</span>
  </div>`;
}

/** Bandeau des 7 jours de la semaine du programme. */
function weekStrip(program, settings, workouts, date) {
  const raw = Math.max(1, E.rawWeek(date, settings.startDate));
  const { from } = E.programWeekBounds(settings, raw);
  const doneDates = new Set(E.finishedWorkouts(workouts).map((w) => w.date));
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = E.addDays(from, i);
    const train = E.isTrainingDay(program, settings, d);
    const done = doneDates.has(d);
    const missed = train && !done && d < date;
    const cls = ['d', d === date && 'today', train && 'train', done && 'done', missed && 'missed'].filter(Boolean).join(' ');
    const state = done ? ', séance faite' : missed ? ', séance ratée' : train ? ', entraînement prévu' : '';
    html += `<div class="${cls}" aria-label="${esc(fmtDate(d))}${state}"><span>${DAY_SHORT[E.isoWeekday(d) - 1]}</span><b>${Number(d.slice(8))}</b><i></i></div>`;
  }
  return `<div class="weekstrip">${html}</div>`;
}

export async function render({ app, program, navigate }) {
  const { settings, history, date } = await loadContext(program);
  const { workouts } = history;
  const plan = E.todayPlan(program, settings, workouts, date);
  const { info } = plan;
  const active = await getActiveWorkout();
  const tpl = program.sessions[plan.templateId];
  const [tplTitle, tplSub] = splitName(tpl.name);

  const header = `
    <header class="topbar">
      <div><p class="eyebrow">${esc(fmtDate(date))}</p><h1>Salut Abraham</h1></div>
      <div class="avatar" aria-hidden="true">A</div>
    </header>`;

  if (!info.started) {
    const session = E.buildSession(program, plan.templateId, 1);
    app.innerHTML = `${header}
      <section class="hero">
        <div class="hero-top"><span class="chip dark">${icon('calendar', 14)}${esc(fmtDate(settings.startDate))}</span></div>
        <p class="hero-eyebrow">Départ du programme</p>
        <h2 class="hero-title">${info.daysToStart === 1 ? 'Demain' : `J-${info.daysToStart}`}</h2>
        <p class="hero-sub">${esc(program.name)}</p>
        ${heroMeta(session)}
        <p class="small" style="position:relative;z-index:1;margin:0;font-weight:600">Première séance : ${esc(tpl.name)}</p>
      </section>
      <div class="alert info">${icon('scale', 20)}<div>Fais ta première pesée le matin du départ (écran <strong>Corps</strong>), à jeun.</div></div>
      <div class="section-title"><h2>Au programme</h2><span class="muted small">${esc(tplTitle)}</span></div>
      <div class="card">${exerciseList(program, session)}</div>`;
    return;
  }

  const phase = info.phase;
  const session = E.buildSession(program, plan.templateId, info.week);
  const doneToday = E.finishedWorkouts(workouts).some((w) => w.date === date);
  const wk = E.weekAdherence(program, settings, workouts, date);
  const streak = E.streak(program, settings, workouts, date);
  const missed = E.missedSession(program, settings, workouts, date);
  const next = E.nextTrainingDay(program, settings, date);
  const progress = Math.min(info.raw, program.totalWeeks) / program.totalWeeks;

  const chips = `
    <span class="chip dark">S${info.week} · ${esc(phase.name)}</span>
    ${info.deload ? '<span class="chip dark">Décharge</span>' : ''}
    ${plan.plan.fourDays ? '<span class="chip dark">4 jours</span>' : ''}`;

  let hero;
  if (active) {
    const [aTitle, aSub] = splitName(program.sessions[active.templateId]?.name || active.templateId);
    hero = `
      <section class="hero">
        <div class="hero-top">${chips}</div>
        <p class="hero-eyebrow">Séance en cours${active.minimum ? ' · minimum' : ''}</p>
        <h2 class="hero-title">${esc(aTitle)}</h2><p class="hero-sub">${esc(aSub)}</p>
        <div class="hero-meta"></div>
        <button class="hero-btn" data-act="resume">Reprendre<span class="go">${icon('arrow', 22)}</span></button>
      </section>`;
  } else if (doneToday) {
    hero = `
      <section class="hero dark">
        <div class="hero-top"><span class="chip accent">${icon('check', 14)}Terminée</span></div>
        <p class="hero-eyebrow">Séance du jour</p>
        <h2 class="hero-title">Bien joué 💪</h2>
        <p class="hero-sub muted">Prochaine : ${esc(tplTitle)}${next ? ` · ${esc(fmtDate(next))}` : ''}</p>
      </section>`;
  } else if (plan.trainingDay) {
    hero = `
      <section class="hero">
        <div class="hero-top">${chips}</div>
        <p class="hero-eyebrow">Séance du jour · RIR ${esc(phase.rir)}</p>
        <h2 class="hero-title">${esc(tplTitle)}</h2><p class="hero-sub">${esc(tplSub)}</p>
        ${heroMeta(session)}
        <button class="hero-btn" data-act="start">Commencer<span class="go">${icon('play', 22)}</span></button>
      </section>
      <button class="block" data-act="minimum">${icon('bolt', 18)}Séance minimum · ${program.minimumSession.exerciseCount} exos + ${program.minimumSession.cardioMin} min</button>`;
  } else {
    hero = `
      <section class="hero dark">
        <div class="hero-top"><span class="chip">${icon('walk', 14)}Récupération</span></div>
        <p class="hero-eyebrow">Jour off</p>
        <h2 class="hero-title">Marche 30 min</h2>
        <p class="hero-sub muted">conseillée aujourd’hui</p>
        <div class="hero-meta"><span>${icon('calendar', 16)}Prochaine : ${esc(tplTitle)}${next ? ` · ${esc(fmtDate(next))}` : ''}</span></div>
        <button class="hero-btn" data-act="start">M’entraîner quand même<span class="go">${icon('arrow', 22)}</span></button>
      </section>`;
  }

  const target = Math.round(program.tracking.adherenceTarget * 100);
  app.innerHTML = `${header}
    ${weekStrip(program, settings, workouts, date)}
    ${missed && !active && !doneToday ? `<div class="alert">${icon('warn', 20)}<div><strong>Règle des 2 jours</strong><br>
      Séance du ${esc(fmtDate(missed.missedDate))} ratée. Ne rate pas deux fois : ${plan.trainingDay ? 'fais au moins la séance minimum aujourd’hui.' : 'rattrape-la aujourd’hui si tu peux, même en version minimum.'}</div></div>` : ''}
    ${hero}
    ${info.override?.note ? `<div class="alert info">${icon('info', 20)}<div>${esc(info.override.note)}</div></div>` : ''}
    ${info.deload ? `<div class="alert info">${icon('info', 20)}<div><strong>Semaine de décharge</strong> : moitié moins de séries, charges −${Math.round((1 - program.deload.loadMultiplier) * 100)} %. On récupère, on ne s’arrête pas.</div></div>` : ''}
    <div class="tiles">
      <div class="tile">
        <span class="t-label">Programme</span>
        ${ring(progress, { size: 84, inner: `<div>S${info.raw}<small>/ ${program.totalWeeks}</small></div>` })}
        <span class="small muted">${esc(phase.id)} · ${esc(phase.name)}</span>
      </div>
      <div class="tile">
        <span class="t-label">Cette semaine</span>
        ${ring(wk.planned ? wk.done / wk.planned : 0, { size: 84, color: 'var(--violet)', inner: `<div>${wk.done}<small>/ ${wk.planned}</small></div>` })}
        <span class="small muted">séances faites</span>
      </div>
      <div class="tile wide">
        <span class="t-icon orange">${icon('flame', 22)}</span>
        <div class="grow"><div class="t-value">${streak}<small>sem.</small></div>
          <div class="t-label">d’affilée à ≥ ${target} % d’assiduité</div></div>
      </div>
    </div>
    ${!active && !doneToday ? `<div class="section-title"><h2>Au programme</h2><span class="muted small">${esc(tplTitle)}</span></div>
    <div class="card">${exerciseList(program, session)}</div>` : ''}`;

  app.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (btn?.dataset.video) return openVideo(program, btn.dataset.video);
    const act = btn?.dataset.act;
    if (!act) return;
    if (act === 'resume') return navigate('workout');
    btn.disabled = true;
    await startWorkout(program, { templateId: plan.templateId, minimum: act === 'minimum' });
    navigate('workout');
  });
}
