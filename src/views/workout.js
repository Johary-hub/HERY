import * as E from '../engine.js';
import { getActiveWorkout, getWorkoutSets, getHistory, put, deleteWorkout, saveWorkoutWithSets } from '../db.js';
import { suggestionFor } from '../session.js';
import { nowStamp } from '../clock.js';
import { startRest, stopRest, keepAwake, releaseAwake } from '../timer.js';
import { $, $$, esc, fmtDuration, unitLabel, toast } from '../ui.js';

const parseNum = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n) => (n == null ? '' : String(n).replace('.', ','));
const elapsed = (w) => Math.max(0, Date.now() - new Date(w.startedAt).getTime());

export async function render({ app, program, navigate }) {
  const workout = await getActiveWorkout();
  if (!workout) {
    app.innerHTML = `
      <h1>Séance</h1>
      <div class="card"><p>Aucune séance en cours.</p>
      <a class="btn primary block" href="#/today">Voir la séance du jour</a></div>`;
    return;
  }

  const session = E.buildSession(program, workout.templateId, workout.week, { minimum: workout.minimum });
  const phase = E.phaseForWeek(program, workout.week);
  let sets = await getWorkoutSets(workout.id);
  const history = await getHistory();
  const openSubs = new Set(); // cartes dont la liste de remplacement est ouverte

  const setsOf = (plannedId) => sets.filter((s) => s.plannedExerciseId === plannedId).sort((a, b) => a.setIndex - b.setIndex);

  function exerciseCard(planned) {
    const list = setsOf(planned.id);
    const currentId = list[0]?.exerciseId || planned.id;
    const ex = program.exercises[currentId];
    const plannedEx = program.exercises[planned.id];
    const unit = unitLabel(ex.unit);
    const r = planned.range[0] === planned.range[1] ? planned.range[0] : `${planned.range[0]}–${planned.range[1]}`;
    const doneCount = list.filter((s) => s.done).length;
    return `
      <section class="card exercise" data-planned="${esc(planned.id)}">
        <div class="head">
          <div>
            <div class="name">${esc(ex.name)}</div>
            ${currentId !== planned.id ? `<div class="meta">remplace ${esc(plannedEx.name)}</div>` : ''}
            <div class="meta">${list.length} × ${r} ${unit}</div>
          </div>
          <span class="badge${doneCount === list.length ? ' accent' : ''}" data-count>${doneCount}/${list.length}</span>
        </div>
        ${suggestionLine(planned, currentId)}
        <details><summary>Consigne technique</summary><p>${esc(ex.cue)}</p></details>
        ${replaceBlock(planned, currentId)}
        <div class="set-head"><span>#</span><span>Charge (kg)</span><span>${esc(unit)}</span><span>✓</span></div>
        ${list.map((s) => setRow(s, planned)).join('')}
      </section>`;
  }

  function suggestionLine(planned, exerciseId) {
    const sug = suggestionFor(program, workout, planned, exerciseId, history);
    const unit = unitLabel(program.exercises[exerciseId].unit);
    let last = '';
    if (sug.last) {
      const w = sug.last.weightKg != null ? `${fmtNum(sug.last.weightKg)} kg × ` : '';
      last = `<div class="suggest">Dernière fois : ${w}${sug.last.values.join('/')} ${esc(unit)}</div>`;
    }
    const target = sug.weightKg != null ? `${fmtNum(sug.weightKg)} kg × ${sug.target} ${unit}` : `${sug.target} ${unit}`;
    return `${last}<div class="suggest${sug.mode === 'test' ? ' test' : ''}">
      ${sug.mode === 'test' ? '🧪 <strong>Séance test</strong> — ' : `🎯 <strong>${esc(target)}</strong> — `}${esc(sug.message)}</div>`;
  }

  function replaceBlock(planned, currentId) {
    const plannedEx = program.exercises[planned.id];
    const options = [...(plannedEx.substitutes || [])];
    if (currentId !== planned.id) options.unshift(planned.id);
    const choices = options.filter((id) => id !== currentId && program.exercises[id]);
    if (!choices.length) return '';
    const open = openSubs.has(planned.id);
    return `
      <button type="button" class="small-btn ghost" data-act="toggle-subs" aria-expanded="${open}">⇄ Remplacer</button>
      ${open ? `<div class="subs">${choices.map((id) => `
        <button type="button" class="small-btn" data-sub="${esc(id)}">${id === planned.id ? '↩ ' : ''}${esc(program.exercises[id].name)}</button>`).join('')}</div>` : ''}`;
  }

  function setRow(s, planned) {
    return `
      <div class="set-row${s.done ? ' done' : ''}" data-set="${esc(s.id)}">
        <span class="idx">${s.setIndex + 1}</span>
        <input data-field="weightKg" inputmode="decimal" autocomplete="off" aria-label="Charge série ${s.setIndex + 1}"
          value="${esc(fmtNum(s.weightKg))}" placeholder="kg" />
        <input data-field="value" inputmode="numeric" autocomplete="off" aria-label="Valeur série ${s.setIndex + 1}"
          value="${esc(fmtNum(s.value))}" placeholder="${esc(planned.range[0])}" />
        <button type="button" class="check" data-check aria-pressed="${s.done}" aria-label="Valider la série ${s.setIndex + 1}">${s.done ? '✓' : ''}</button>
      </div>`;
  }

  function draw() {
    const tplName = program.sessions[workout.templateId]?.name || workout.templateId;
    app.innerHTML = `
      <div class="row between">
        <h1>${esc(tplName)}</h1>
        <span class="badge" id="elapsed">${fmtDuration(elapsed(workout))}</span>
      </div>
      <div class="row">
        <span class="badge accent">S${workout.week} · ${esc(phase?.name || '')}</span>
        ${workout.deload ? '<span class="badge warn">Décharge</span>' : ''}
        ${workout.minimum ? '<span class="badge info">Séance minimum</span>' : ''}
        <span class="badge">RIR ${esc(phase?.rir || '')}</span>
      </div>
      <div class="alert info"><strong>Échauffement :</strong> ${esc(program.warmup)}</div>
      ${session.exercises.map(exerciseCard).join('')}
      <div class="alert ok"><strong>Cardio :</strong> ${session.cardioMin} min en fin de séance.</div>
      <div class="stack">
        <button class="primary block" data-act="finish">Terminer la séance</button>
        <button class="danger block" data-act="abandon">Abandonner</button>
      </div>
      <dialog id="finish-dlg">
        <form method="dialog" class="stack">
          <h2>Terminer la séance</h2>
          <p class="muted" id="finish-summary"></p>
          <div><label>Ressenti (1 = dur, 5 = excellent)</label>
            <div class="feeling">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-feel="${n}">${n}</button>`).join('')}</div></div>
          <div><label for="finish-note">Note (optionnelle)</label><textarea id="finish-note" maxlength="1000"></textarea></div>
          <div class="row"><button type="button" class="grow" data-act="cancel-finish">Annuler</button>
            <button type="button" class="primary grow" data-act="confirm-finish">Enregistrer</button></div>
        </form>
      </dialog>`;
  }

  draw();
  keepAwake();
  const clock = setInterval(() => {
    const el = $('#elapsed', app);
    if (el) el.textContent = fmtDuration(elapsed(workout));
  }, 30000);

  async function saveSet(s) {
    await put('sets', s);
  }

  function refreshCount(card) {
    const list = setsOf(card.dataset.planned);
    const done = list.filter((s) => s.done).length;
    const badge = $('[data-count]', card);
    badge.textContent = `${done}/${list.length}`;
    badge.classList.toggle('accent', done === list.length);
  }

  app.addEventListener('change', async (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const s = sets.find((x) => x.id === input.closest('[data-set]').dataset.set);
    s[input.dataset.field] = parseNum(input.value);
    input.value = fmtNum(s[input.dataset.field]);
    await saveSet(s);
  });

  let feeling = null;
  app.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.hasAttribute('data-check')) {
      const row = btn.closest('[data-set]');
      const s = sets.find((x) => x.id === row.dataset.set);
      const [wIn, vIn] = $$('input', row);
      s.weightKg = parseNum(wIn.value);
      s.value = parseNum(vIn.value) ?? parseNum(vIn.placeholder);
      vIn.value = fmtNum(s.value);
      s.done = !s.done;
      row.classList.toggle('done', s.done);
      btn.textContent = s.done ? '✓' : '';
      btn.setAttribute('aria-pressed', String(s.done));
      await saveSet(s);
      refreshCount(row.closest('[data-planned]'));
      if (s.done) startRest(phase?.restSec ?? 90);
      return;
    }

    if (btn.dataset.feel) {
      feeling = Number(btn.dataset.feel);
      $$('[data-feel]', app).forEach((b) => b.classList.toggle('sel', b === btn));
      return;
    }

    if (btn.dataset.sub) {
      const card = btn.closest('[data-planned]');
      const planned = session.exercises.find((x) => x.id === card.dataset.planned);
      const newId = btn.dataset.sub;
      const sug = suggestionFor(program, workout, planned, newId, history);
      const list = setsOf(planned.id);
      for (const s of list) {
        s.exerciseId = newId; // le remplacement est enregistré sous l'id du substitut
        if (!s.done) { s.weightKg = sug.weightKg; s.value = sug.target; }
      }
      await saveWorkoutWithSets(workout, list);
      openSubs.delete(planned.id);
      card.outerHTML = exerciseCard(planned);
      toast(`Remplacé par ${program.exercises[newId].name}`);
      return;
    }

    const act = btn.dataset.act;
    if (act === 'toggle-subs') {
      const card = btn.closest('[data-planned]');
      const id = card.dataset.planned;
      if (openSubs.has(id)) openSubs.delete(id); else openSubs.add(id);
      card.outerHTML = exerciseCard(session.exercises.find((x) => x.id === id));
      return;
    }
    if (act === 'finish') {
      const done = sets.filter((s) => s.done).length;
      $('#finish-summary', app).textContent = `${done} série${done > 1 ? 's' : ''} validée${done > 1 ? 's' : ''} sur ${sets.length} · durée ${fmtDuration(elapsed(workout))}`;
      $('#finish-dlg', app).showModal();
    }
    if (act === 'cancel-finish') $('#finish-dlg', app).close();
    if (act === 'confirm-finish') {
      if (!sets.some((s) => s.done) && !confirm('Aucune série validée. Terminer quand même ?')) return;
      workout.finishedAt = nowStamp();
      workout.feeling = feeling;
      workout.note = $('#finish-note', app).value.trim();
      await put('workouts', workout);
      $('#finish-dlg', app).close();
      stopRest();
      toast('Séance enregistrée 💪');
      navigate('today');
    }
    if (act === 'abandon') {
      if (!confirm('Abandonner cette séance ? Les séries saisies seront supprimées.')) return;
      await deleteWorkout(workout.id);
      stopRest();
      navigate('today');
    }
  });

  return () => {
    clearInterval(clock);
    releaseAwake();
  };
}
