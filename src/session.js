// Orchestration des séances : relie le moteur pur (engine.js) et le stockage (db.js).
import * as E from './engine.js';
import { getSettings, getHistory, saveWorkoutWithSets } from './db.js';
import { today, nowStamp } from './clock.js';
import { uuid } from './ui.js';

export async function loadContext(program) {
  const settings = E.resolveSettings(program, await getSettings());
  const history = await getHistory();
  return { settings, history, date: today() };
}

/** Crée la séance (et toutes ses séries, non validées) puis l'enregistre. */
export async function startWorkout(program, { templateId, minimum = false }) {
  const { settings, history, date } = await loadContext(program);
  const info = E.weekInfo(program, settings, date);
  if (!info.started) throw new Error('Le programme n’a pas encore commencé.');
  const session = E.buildSession(program, templateId, info.week, { minimum });
  const workout = {
    id: uuid(), date, week: info.week, phaseId: info.phase.id, templateId,
    minimum, deload: info.deload, startedAt: nowStamp(), finishedAt: null, feeling: null, note: '',
  };
  const sets = [];
  for (const ex of session.exercises) {
    // Pré-remplissage avec la suggestion du moteur de progression
    const sug = suggestionFor(program, workout, ex, ex.id, history);
    for (let i = 0; i < ex.sets; i++) {
      sets.push({ id: uuid(), workoutId: workout.id, exerciseId: ex.id, plannedExerciseId: ex.id,
        setIndex: i, weightKg: sug.weightKg, value: sug.target, done: false });
    }
  }
  await saveWorkoutWithSets(workout, sets);
  return workout;
}

/** Suggestion pour un exercice (prévu ou substitut) dans le contexte d'une séance. */
export function suggestionFor(program, workout, planned, exerciseId, history) {
  return E.suggest(program, { exerciseId, range: planned.range, deload: workout.deload }, history.workouts, history.sets);
}
