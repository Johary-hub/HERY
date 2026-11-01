import * as E from '../engine.js';
import { loadContext, startWorkout } from '../session.js';
import { getActiveWorkout } from '../db.js';
import { esc, fmtDate, unitLabel } from '../ui.js';

function sessionPreview(program, templateId, week, opts = {}) {
  const s = E.buildSession(program, templateId, week || 1, opts);
  return `<ul class="list small">${s.exercises.map((e) => {
    const ex = program.exercises[e.id];
    const r = e.range[0] === e.range[1] ? e.range[0] : `${e.range[0]}–${e.range[1]}`;
    return `<li><span>${esc(ex.name)}</span><span class="muted">${e.sets} × ${r} ${unitLabel(ex.unit)}</span></li>`;
  }).join('')}</ul>`;
}

export async function render({ app, program, navigate }) {
  const { settings, history, date } = await loadContext(program);
  const { workouts } = history;
  const plan = E.todayPlan(program, settings, workouts, date);
  const { info } = plan;
  const active = await getActiveWorkout();
  const tpl = program.sessions[plan.templateId];
  let html = `<p class="muted small">${esc(fmtDate(date, { year: true }))}</p>`;

  if (!info.started) {
    html += `
      <h1>Bientôt le départ 💪</h1>
      <div class="card highlight">
        <p>Le programme commence le <strong>${esc(fmtDate(settings.startDate, { year: true }))}</strong>
        (${info.daysToStart === 1 ? 'demain' : `dans ${info.daysToStart} jours`}).</p>
        <p class="muted small">${esc(program.name)}</p>
      </div>
      <h2>Première séance : ${esc(tpl.name)}</h2>
      <div class="card">${sessionPreview(program, plan.templateId, 1)}</div>
      <p class="muted small">Pense à faire une première pesée (écran Corps) le matin du départ.</p>`;
    app.innerHTML = html;
    return;
  }

  const phase = info.phase;
  const doneToday = E.finishedWorkouts(workouts).filter((w) => w.date === date);
  const wk = E.weekAdherence(program, settings, workouts, date);
  const streak = E.streak(program, settings, workouts, date);
  const missed = E.missedSession(program, settings, workouts, date);

  html += `
    <div class="row between">
      <h1>Semaine S${info.week}${info.cycle > 1 ? ` <span class="muted small">(cycle ${info.cycle})</span>` : ''}</h1>
      ${info.deload ? '<span class="badge warn">Décharge</span>' : ''}
    </div>
    <div class="row">
      <span class="badge accent">${esc(phase.id)} · ${esc(phase.name)}</span>
      <span class="badge">RIR ${esc(phase.rir)}</span>
      ${plan.plan.fourDays ? '<span class="badge info">4 jours</span>' : ''}
    </div>
    ${info.override?.note ? `<div class="alert info">${esc(info.override.note)}</div>` : ''}
    ${info.deload ? `<div class="alert info">Semaine de décharge : moitié moins de séries, charges −${Math.round((1 - program.deload.loadMultiplier) * 100)} %.</div>` : ''}`;

  if (missed && !active) {
    html += `<div class="alert"><strong>Règle des 2 jours</strong> — séance du ${esc(fmtDate(missed.missedDate))} ratée.
      Ne rate pas deux fois : ${plan.trainingDay ? 'fais au moins la séance minimum aujourd’hui.' : 'rattrape-la aujourd’hui si tu peux (même la séance minimum compte).'}</div>`;
  }

  if (active) {
    html += `
      <div class="card highlight">
        <h3>Séance en cours</h3>
        <p>${esc(program.sessions[active.templateId]?.name || active.templateId)}${active.minimum ? ' (minimum)' : ''}</p>
        <button class="primary block" data-act="resume">Reprendre la séance</button>
      </div>`;
  } else if (doneToday.length) {
    const next = E.nextTrainingDay(program, settings, date);
    html += `
      <div class="card">
        <h3>✅ Séance du jour terminée</h3>
        <p class="muted">Bravo. Prochaine séance : <strong>${esc(tpl.name)}</strong>${next ? ` — ${esc(fmtDate(next))}` : ''}</p>
      </div>`;
  } else if (plan.trainingDay) {
    html += `
      <div class="card highlight">
        <h3>Séance proposée : ${esc(tpl.name)}</h3>
        ${sessionPreview(program, plan.templateId, info.week)}
        <p class="muted small">Cardio : ${phase.cardioMin} min · repos ${phase.restSec} s</p>
        <div class="stack">
          <button class="primary block" data-act="start">Commencer</button>
          <button class="block" data-act="minimum">Séance minimum (${program.minimumSession.exerciseCount} exercices + ${program.minimumSession.cardioMin} min cardio)</button>
        </div>
      </div>`;
  } else {
    const next = E.nextTrainingDay(program, settings, date);
    html += `
      <div class="card">
        <h3>Jour off — marche 30 min conseillée 🚶</h3>
        <p class="muted">Prochaine séance prévue : <strong>${esc(tpl.name)}</strong>${next ? ` — ${esc(fmtDate(next))}` : ''}</p>
        <button class="block ghost" data-act="start">Faire la séance quand même</button>
      </div>`;
  }

  html += `
    <div class="stats">
      <div class="stat"><div class="v">${wk.done}/${wk.planned}</div><div class="l">Séances cette semaine</div></div>
      <div class="stat"><div class="v">${streak}</div><div class="l">Semaine${streak > 1 ? 's' : ''} d’affilée ≥ ${Math.round(program.tracking.adherenceTarget * 100)} %</div></div>
    </div>`;

  app.innerHTML = html;

  app.addEventListener('click', async (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (act === 'resume') return navigate('workout');
    e.target.disabled = true;
    await startWorkout(program, { templateId: plan.templateId, minimum: act === 'minimum' });
    navigate('workout');
  });
}
