// Moteur métier pur : aucun accès DOM ni IndexedDB.
// Toutes les dates sont des chaînes ISO "AAAA-MM-JJ" (jour calendaire local, sans heure).
// Tout ce qui concerne le programme (exercices, séries, fourchettes, dates) vient de program.json.

const DAY_MS = 86400000;

/* ───────────────────────── Dates ───────────────────────── */

/** "AAAA-MM-JJ" → nombre de jours depuis l'époque (UTC, insensible à l'heure d'été). */
export function dayNumber(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export const addDays = (iso, n) => fromDayNumber(dayNumber(iso) + n);
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);

/** Jour ISO 8601 : 1 = lundi … 7 = dimanche. */
export function isoWeekday(iso) {
  const js = new Date(dayNumber(iso) * DAY_MS).getUTCDay(); // 0 = dimanche
  return js === 0 ? 7 : js;
}

export const mondayOf = (iso) => addDays(iso, 1 - isoWeekday(iso));

/** Clé de semaine ISO, ex. "2026-W45". */
export function isoWeekKey(iso) {
  const thursday = addDays(iso, 4 - isoWeekday(iso));
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Date locale du jour (téléphone) au format ISO. */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const round05 = (x) => Math.round(x * 2) / 2;

/* ───────────────────────── Réglages ───────────────────────── */

/** Complète les réglages enregistrés avec les valeurs par défaut du programme. */
export function resolveSettings(program, saved = {}) {
  return {
    startDate: saved.startDate || program.startDate,
    trainingDays: Array.isArray(saved.trainingDays) && saved.trainingDays.length
      ? [...saved.trainingDays].sort((a, b) => a - b)
      : [...program.defaultTrainingDays],
    fourDayOption: Boolean(saved.fourDayOption),
  };
}

/* ───────────────────────── Semaines & phases ───────────────────────── */

/** Semaine brute : floor((date − début) / 7) + 1. ≤ 0 avant le début. */
export function rawWeek(date, startDate) {
  return Math.floor(daysBetween(startDate, date) / 7) + 1;
}

/** Au-delà de totalWeeks, on recommence la dernière phase (phase 3) en boucle. */
export function effectiveWeek(program, raw) {
  if (raw <= program.totalWeeks) return raw;
  const [from, to] = program.phases[program.phases.length - 1].weeks;
  const len = to - from + 1;
  return from + ((raw - from) % len);
}

export function phaseForWeek(program, week) {
  return program.phases.find((p) => p.weeks[0] <= week && week <= p.weeks[1]) || null;
}

export const isDeload = (program, week) => program.deload.weeks.includes(week);

/** Résumé complet de la semaine du programme pour une date donnée. */
export function weekInfo(program, settings, date) {
  const raw = rawWeek(date, settings.startDate);
  if (raw < 1) {
    return { started: false, raw, week: 0, cycle: 0, phase: null, deload: false, override: null,
      daysToStart: daysBetween(date, settings.startDate) };
  }
  const week = effectiveWeek(program, raw);
  const last = program.phases[program.phases.length - 1];
  const cycle = raw <= program.totalWeeks ? 1 : Math.floor((raw - last.weeks[0]) / (last.weeks[1] - last.weeks[0] + 1)) + 1;
  return {
    started: true, raw, week, cycle,
    phase: phaseForWeek(program, week),
    deload: isDeload(program, week),
    override: program.weekOverrides?.[String(week)] || null,
  };
}

/** Plan actif d'une phase : jours d'entraînement + rotation (option 4 jours en phase 3). */
export function activePlan(phase, settings) {
  if (phase?.option4days && settings.fourDayOption) {
    return { trainingDays: phase.option4days.trainingDays, rotation: phase.option4days.rotation, fourDays: true };
  }
  return { trainingDays: settings.trainingDays, rotation: phase?.rotation || [], fourDays: false };
}

/** Jour d'entraînement prévu ? (tient compte de la phase de la date et de l'option 4 jours) */
export function isTrainingDay(program, settings, date) {
  const info = weekInfo(program, settings, date);
  if (!info.started) return false;
  return activePlan(info.phase, settings).trainingDays.includes(isoWeekday(date));
}

/** Prochaine date d'entraînement prévue strictement après `date`. */
export function nextTrainingDay(program, settings, date) {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(date, i);
    if (isTrainingDay(program, settings, d)) return d;
  }
  return null;
}

/* ───────────────────────── Historique ───────────────────────── */

export const isFinished = (w) => Boolean(w && w.finishedAt);

const finishKey = (w) => w.finishedAt || `${w.date}T23:59:59`;

/** Séances terminées, de la plus ancienne à la plus récente. */
export function finishedWorkouts(workouts) {
  return workouts.filter(isFinished).sort((a, b) => finishKey(a).localeCompare(finishKey(b)));
}

function setsByWorkout(sets) {
  const map = new Map();
  for (const s of sets) {
    if (!map.has(s.workoutId)) map.set(s.workoutId, []);
    map.get(s.workoutId).push(s);
  }
  for (const list of map.values()) list.sort((a, b) => a.setIndex - b.setIndex);
  return map;
}

/* ───────────────────────── Séance proposée ───────────────────────── */

/**
 * Séance suivante dans la rotation de la phase, après la DERNIÈRE SÉANCE TERMINÉE
 * (une séance ratée n'est jamais sautée). Changement de phase → premier élément.
 */
export function proposedTemplate(phase, rotation, workouts) {
  if (!rotation.length) return null;
  const done = finishedWorkouts(workouts);
  const last = done[done.length - 1];
  if (!last || last.phaseId !== phase.id) return rotation[0];
  const idx = rotation.indexOf(last.templateId);
  return idx === -1 ? rotation[0] : rotation[(idx + 1) % rotation.length];
}

/** Nombre de séries d'un exercice pour une semaine. */
export function setsFor(program, week, baseSets) {
  let n = baseSets;
  const maxSets = program.weekOverrides?.[String(week)]?.maxSets;
  if (maxSets) n = Math.min(n, maxSets);
  if (isDeload(program, week)) n = Math.ceil(n * program.deload.setsMultiplier);
  return n;
}

/** Construit la séance (exercices + nombre de séries) pour une semaine donnée. */
export function buildSession(program, templateId, week, { minimum = false } = {}) {
  const tpl = program.sessions[templateId];
  if (!tpl) throw new Error(`Séance inconnue : ${templateId}`);
  const phase = phaseForWeek(program, week);
  let list = tpl.exercises;
  if (minimum) list = list.slice(0, program.minimumSession.exerciseCount);
  return {
    templateId,
    name: tpl.name,
    minimum,
    deload: isDeload(program, week),
    restSec: phase?.restSec ?? 90,
    cardioMin: minimum ? program.minimumSession.cardioMin : phase?.cardioMin ?? 0,
    exercises: list.map((e) => ({
      id: e.id,
      range: e.range,
      baseSets: e.sets,
      sets: setsFor(program, week, e.sets),
    })),
  };
}

/** Ce que l'écran « Aujourd'hui » doit proposer pour une date. */
export function todayPlan(program, settings, workouts, date) {
  const info = weekInfo(program, settings, date);
  if (!info.started) {
    const firstPhase = program.phases[0];
    return { info, trainingDay: false, templateId: firstPhase.rotation[0], plan: activePlan(firstPhase, settings) };
  }
  const plan = activePlan(info.phase, settings);
  return {
    info,
    plan,
    trainingDay: plan.trainingDays.includes(isoWeekday(date)),
    templateId: proposedTemplate(info.phase, plan.rotation, workouts),
  };
}

/* ───────────────────────── Charges suggérées ───────────────────────── */

/** Fourchette prévue pour un exercice dans la séance où il a été fait. */
function plannedRange(program, workout, set) {
  const tpl = program.sessions[workout.templateId];
  const pid = set.plannedExerciseId || set.exerciseId;
  return tpl?.exercises.find((e) => e.id === pid)?.range || null;
}

/** Dernière séance terminée hors décharge contenant au moins une série validée de l'exercice. */
export function lastPerformance(exerciseId, workouts, sets) {
  const byW = setsByWorkout(sets);
  const done = finishedWorkouts(workouts).filter((w) => !w.deload);
  for (let i = done.length - 1; i >= 0; i--) {
    const w = done[i];
    const s = (byW.get(w.id) || []).filter((x) => x.exerciseId === exerciseId && x.done);
    if (s.length) return { workout: w, sets: s };
  }
  return null;
}

/**
 * Double progression.
 * @returns {{ mode, weightKg, target, message, last? }}
 *  mode : 'test' | 'increase' | 'same' | 'newRange' | 'deload'
 */
export function suggest(program, { exerciseId, range, deload = false }, workouts, sets) {
  const ex = program.exercises[exerciseId];
  if (!ex) throw new Error(`Exercice inconnu : ${exerciseId}`);
  const [low, high] = range;
  const unit = ex.unit;
  const inc = program.progression.increments;
  const last = lastPerformance(exerciseId, workouts, sets);

  // 2. Jamais fait → séance test
  if (!last) {
    let message;
    if (unit === 'seconds') message = `Séance test : tiens ${low} s en gardant de la marge`;
    else if (unit === 'meters') message = `Séance test : trouve une charge pour faire ${low} m en gardant 3–4 reps en réserve`;
    else message = `Trouve une charge où tu fais ${low} reps en gardant 3–4 reps en réserve`;
    return { mode: 'test', weightKg: null, target: low, message };
  }

  const values = last.sets.map((s) => Number(s.value) || 0);
  const weights = last.sets.map((s) => (s.weightKg == null || s.weightKg === '' ? null : Number(s.weightKg)));
  const known = weights.filter((w) => w != null);
  const lastWeight = known.length ? Math.max(...known) : null;
  const best = Math.max(...values);
  const lastInfo = { date: last.workout.date, weightKg: lastWeight, values };

  // 6. Fourchette différente de la dernière fois → garder la charge, viser le bas de la nouvelle
  const prevRange = plannedRange(program, last.workout, last.sets[0]);
  const rangeChanged = prevRange && (prevRange[0] !== low || prevRange[1] !== high);

  // 5. Décharge → charge × loadMultiplier (arrondie à 0,5 kg), sans viser plus haut
  if (deload) {
    const w = lastWeight == null ? null : round05(lastWeight * program.deload.loadMultiplier);
    const target = rangeChanged ? low : Math.min(Math.max(best, low), high);
    return { mode: 'deload', weightKg: w, target, last: lastInfo,
      message: `Décharge : charge −${Math.round((1 - program.deload.loadMultiplier) * 100)} %, sans forcer` };
  }

  if (rangeChanged) {
    return { mode: 'newRange', weightKg: lastWeight, target: low, last: lastInfo,
      message: `Nouvelle fourchette (${low}–${high}) : même charge, vise ${low}` };
  }

  const allTop = values.every((v) => v >= high);

  // 3. Toutes les séries validées en haut de fourchette → progression
  if (allTop) {
    if (unit === 'seconds') {
      return { mode: 'increase', weightKg: lastWeight, target: best + inc.time, last: lastInfo,
        message: `Haut de fourchette atteint : +${inc.time} s` };
    }
    if (unit === 'meters') {
      const w = lastWeight == null ? null : lastWeight + 2;
      return { mode: 'increase', weightKg: w, target: high, last: lastInfo,
        message: 'Distance atteinte : +2 kg aux haltères, même distance' };
    }
    const step = inc[ex.category];
    if (step && lastWeight != null) {
      return { mode: 'increase', weightKg: lastWeight + step, target: low, last: lastInfo,
        message: `Haut de fourchette atteint : +${String(step).replace('.', ',')} kg, vise ${low}` };
    }
    return { mode: 'same', weightKg: lastWeight, target: high, last: lastInfo,
      message: 'Haut de fourchette atteint : rends l’exercice plus difficile (tempo lent, lest)' };
  }

  // 4. Sinon → même charge, meilleures reps + 1 (plafonnées au haut de la fourchette)
  const target = Math.min(best + 1, high);
  return { mode: 'same', weightKg: lastWeight, target, last: lastInfo,
    message: `Même charge, vise ${target}` };
}

/* ───────────────────────── Assiduité ───────────────────────── */

/** Séances prévues et terminées entre deux dates incluses. */
export function adherence(program, settings, workouts, from, to) {
  let planned = 0;
  if (dayNumber(from) < dayNumber(settings.startDate)) from = settings.startDate;
  for (let d = from; dayNumber(d) <= dayNumber(to); d = addDays(d, 1)) {
    if (isTrainingDay(program, settings, d)) planned++;
  }
  const done = finishedWorkouts(workouts).filter((w) => w.date >= from && w.date <= to).length;
  return { planned, done, rate: planned ? Math.min(done / planned, 1) : null };
}

/** Bornes (dates) d'une semaine brute du programme. */
export function programWeekBounds(settings, raw) {
  const from = addDays(settings.startDate, (raw - 1) * 7);
  return { from, to: addDays(from, 6) };
}

/** Assiduité de la semaine du programme en cours (ex. 2/3). */
export function weekAdherence(program, settings, workouts, date) {
  const raw = rawWeek(date, settings.startDate);
  if (raw < 1) return { planned: 0, done: 0, rate: null };
  const { from, to } = programWeekBounds(settings, raw);
  return adherence(program, settings, workouts, from, to);
}

/** Semaines consécutives (programme) où l'assiduité atteint l'objectif. */
export function streak(program, settings, workouts, date) {
  const target = program.tracking.adherenceTarget;
  const raw = rawWeek(date, settings.startDate);
  let count = 0;
  for (let w = raw; w >= 1; w--) {
    const { from, to } = programWeekBounds(settings, w);
    const a = adherence(program, settings, workouts, from, to);
    const ok = a.planned > 0 && a.done / a.planned >= target;
    if (ok) count++;
    else if (w === raw) continue; // semaine en cours pas encore finie : on ne casse pas la série
    else break;
  }
  return count;
}

/**
 * Règle des 2 jours : la dernière séance prévue (avant aujourd'hui) a été ratée
 * et rien n'a été fait depuis (ni aujourd'hui).
 */
export function missedSession(program, settings, workouts, date) {
  let prev = null;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i);
    if (dayNumber(d) < dayNumber(settings.startDate)) break;
    if (isTrainingDay(program, settings, d)) { prev = d; break; }
  }
  if (!prev) return null;
  const caughtUp = finishedWorkouts(workouts).some((w) => w.date >= prev && w.date <= date);
  return caughtUp ? null : { missedDate: prev };
}

/** Déverrouillage de l'option 4 jours : assiduité sur S1–S12 ≥ seuil (90 %). */
export function fourDayUnlock(program, settings, workouts, date) {
  const p3 = program.phases.find((p) => p.option4days);
  if (!p3) return { available: false };
  const threshold = 0.9;
  const lastWeek = p3.weeks[0] - 1; // S12
  const { to: endS12 } = programWeekBounds(settings, lastWeek);
  const yesterday = addDays(date, -1);
  const to = dayNumber(yesterday) < dayNumber(endS12) ? yesterday : endS12;
  const a = dayNumber(to) >= dayNumber(settings.startDate)
    ? adherence(program, settings, workouts, settings.startDate, to)
    : { planned: 0, done: 0, rate: null };
  const complete = rawWeek(date, settings.startDate) > lastWeek;
  return { available: true, ...a, threshold, complete, unlocked: complete && a.rate != null && a.rate >= threshold };
}

/* ───────────────────────── Corps ───────────────────────── */

/** Moyennes hebdomadaires du poids (semaine ISO), triées. */
export function weeklyAverages(entries) {
  const map = new Map();
  for (const e of entries) {
    if (e.weightKg == null || e.weightKg === '') continue;
    const key = isoWeekKey(e.date);
    if (!map.has(key)) map.set(key, { week: key, monday: mondayOf(e.date), sum: 0, n: 0 });
    const g = map.get(key);
    g.sum += Number(e.weightKg);
    g.n++;
  }
  return [...map.values()]
    .sort((a, b) => a.monday.localeCompare(b.monday))
    .map((g) => ({ week: g.week, monday: g.monday, avg: Math.round((g.sum / g.n) * 100) / 100, n: g.n }));
}

/**
 * Stagnation : sur les 3 dernières semaines consécutives, aucune moyenne n'est
 * descendue sous la moyenne de la semaine de référence qui les précède.
 */
export function stallAlert(weekly) {
  if (weekly.length < 4) return false;
  const last4 = weekly.slice(-4);
  for (let i = 1; i < 4; i++) {
    if (daysBetween(last4[i - 1].monday, last4[i].monday) !== 7) return false;
  }
  const ref = last4[0].avg;
  return last4.slice(1).every((w) => w.avg >= ref);
}

/* ───────────────────────── Progrès ───────────────────────── */

/** Série temporelle d'un exercice : charge max, volume, meilleure valeur par séance. */
export function exerciseSeries(exerciseId, workouts, sets) {
  const byW = setsByWorkout(sets);
  const out = [];
  for (const w of finishedWorkouts(workouts)) {
    const s = (byW.get(w.id) || []).filter((x) => x.exerciseId === exerciseId && x.done);
    if (!s.length) continue;
    const weights = s.map((x) => Number(x.weightKg) || 0);
    out.push({
      date: w.date,
      workoutId: w.id,
      maxWeight: Math.max(...weights),
      volume: s.reduce((t, x) => t + (Number(x.weightKg) || 0) * (Number(x.value) || 0), 0),
      bestValue: Math.max(...s.map((x) => Number(x.value) || 0)),
      totalValue: s.reduce((t, x) => t + (Number(x.value) || 0), 0),
    });
  }
  return out;
}

/** Records personnels : meilleure série (charge max, puis valeur max) par exercice. */
export function personalRecords(program, workouts, sets) {
  const finished = new Map(finishedWorkouts(workouts).map((w) => [w.id, w]));
  const best = new Map();
  for (const s of sets) {
    const w = finished.get(s.workoutId);
    if (!w || !s.done) continue;
    const weight = Number(s.weightKg) || 0;
    const value = Number(s.value) || 0;
    const cur = best.get(s.exerciseId);
    if (!cur || weight > cur.weightKg || (weight === cur.weightKg && value > cur.value)) {
      best.set(s.exerciseId, { exerciseId: s.exerciseId, weightKg: weight, value, date: w.date });
    }
  }
  return [...best.values()]
    .map((r) => ({ ...r, name: program.exercises[r.exerciseId]?.name || r.exerciseId, unit: program.exercises[r.exerciseId]?.unit }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
