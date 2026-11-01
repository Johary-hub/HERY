import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../src/engine.js';

const program = JSON.parse(readFileSync(fileURLToPath(new URL('../public/program.json', import.meta.url)), 'utf8'));
const settings = E.resolveSettings(program, {});

let seq = 0;
/** Crée une séance terminée et ses séries. sets: [{ id, weight, values[], planned? }] */
function makeWorkout(date, templateId, exercises = [], extra = {}) {
  const info = E.weekInfo(program, settings, date);
  const w = {
    id: `w${++seq}`, date, week: info.week, phaseId: info.phase.id, templateId,
    minimum: false, deload: info.deload,
    startedAt: `${date}T18:00:00`, finishedAt: `${date}T19:00:00`, ...extra,
  };
  const sets = [];
  for (const ex of exercises) {
    ex.values.forEach((v, i) => sets.push({
      id: `s${++seq}`, workoutId: w.id, exerciseId: ex.id, plannedExerciseId: ex.planned || ex.id,
      setIndex: i, weightKg: ex.weight, value: v, done: true,
    }));
  }
  return { workout: w, sets };
}

function history(...items) {
  return { workouts: items.map((i) => i.workout), sets: items.flatMap((i) => i.sets) };
}

const range = (tpl, id) => program.sessions[tpl].exercises.find((e) => e.id === id).range;

describe('dates', () => {
  it('jour ISO et clé de semaine', () => {
    expect(E.isoWeekday('2026-11-02')).toBe(1);
    expect(E.isoWeekday('2026-11-08')).toBe(7);
    expect(E.isoWeekKey('2026-11-02')).toBe('2026-W45');
    expect(E.isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(E.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('cas obligatoires', () => {
  it('2026-11-02 → S1, phase P1, séance A1, 2 séries max', () => {
    const p = E.todayPlan(program, settings, [], '2026-11-02');
    expect(p.info.week).toBe(1);
    expect(p.info.phase.id).toBe('P1');
    expect(p.trainingDay).toBe(true);
    expect(p.templateId).toBe('A1');
    const s = E.buildSession(program, 'A1', 1);
    expect(s.exercises.every((e) => e.sets <= 2)).toBe(true);
    expect(s.exercises[0].sets).toBe(2);
  });

  it('2026-11-04 (A1 terminée le 02) → B1, toujours 2 séries max', () => {
    const h = history(makeWorkout('2026-11-02', 'A1'));
    const p = E.todayPlan(program, settings, h.workouts, '2026-11-04');
    expect(p.info.week).toBe(1);
    expect(p.templateId).toBe('B1');
    expect(E.buildSession(program, 'B1', 1).exercises.map((e) => e.sets)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('2026-11-09 → S2, retour à 3 séries', () => {
    const p = E.todayPlan(program, settings, [], '2026-11-09');
    expect(p.info.week).toBe(2);
    expect(E.buildSession(program, 'A1', 2).exercises.map((e) => e.sets)).toEqual([3, 3, 3, 2, 2, 2]);
  });

  it('2026-11-30 → S5, phase P2, rotation A2/B2', () => {
    const h = history(makeWorkout('2026-11-27', 'B1'));
    const p = E.todayPlan(program, settings, h.workouts, '2026-11-30');
    expect(p.info.week).toBe(5);
    expect(p.info.phase.id).toBe('P2');
    expect(p.plan.rotation).toEqual(['A2', 'B2']);
    expect(p.templateId).toBe('A2'); // changement de phase → premier élément
    const h2 = history(makeWorkout('2026-11-30', 'A2'));
    expect(E.todayPlan(program, settings, h2.workouts, '2026-12-02').templateId).toBe('B2');
  });

  it('2026-12-21 → S8, décharge : 3 séries → 2, charge ×0,9 arrondie à 0,5 kg', () => {
    const p = E.todayPlan(program, settings, [], '2026-12-21');
    expect(p.info.week).toBe(8);
    expect(p.info.deload).toBe(true);
    const s = E.buildSession(program, 'A2', 8);
    expect(s.exercises.map((e) => e.sets)).toEqual([2, 2, 2, 2, 1, 2]);
    const h = history(makeWorkout('2026-12-18', 'B2', [{ id: 'leg_press', weight: 82.5, values: [11, 10, 10] }]));
    const sug = E.suggest(program, { exerciseId: 'leg_press', range: [10, 12], deload: true }, h.workouts, h.sets);
    expect(sug.mode).toBe('deload');
    expect(sug.weightKg).toBe(74.5); // 82,5 × 0,9 = 74,25 → 74,5
  });

  it('2027-01-25 → S13, phase P3', () => {
    const p = E.todayPlan(program, settings, [], '2027-01-25');
    expect(p.info.week).toBe(13);
    expect(p.info.phase.id).toBe('P3');
    expect(p.templateId).toBe('A3');
  });

  it('lundi raté, mercredi : la séance proposée est celle prévue lundi', () => {
    // Semaine 2 : A1 le 2, B1 le 4, A1 le 6. Lundi 9 raté.
    const h = history(makeWorkout('2026-11-02', 'A1'), makeWorkout('2026-11-04', 'B1'), makeWorkout('2026-11-06', 'A1'));
    const monday = E.todayPlan(program, settings, h.workouts, '2026-11-09').templateId;
    const wednesday = E.todayPlan(program, settings, h.workouts, '2026-11-11').templateId;
    expect(monday).toBe('B1');
    expect(wednesday).toBe(monday);
    // Premier lundi raté : mercredi propose toujours A1
    expect(E.todayPlan(program, settings, [], '2026-11-04').templateId).toBe('A1');
  });

  it('Presse à cuisses 3×12 à 80 kg (10–12) → 85 kg', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [{ id: 'leg_press', weight: 80, values: [12, 12, 12] }]));
    const sug = E.suggest(program, { exerciseId: 'leg_press', range: range('A1', 'leg_press') }, h.workouts, h.sets);
    expect(sug.mode).toBe('increase');
    expect(sug.weightKg).toBe(85);
    expect(sug.target).toBe(10);
  });

  it('Presse à cuisses 12/11/10 à 80 kg → 80 kg', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [{ id: 'leg_press', weight: 80, values: [12, 11, 10] }]));
    const sug = E.suggest(program, { exerciseId: 'leg_press', range: [10, 12] }, h.workouts, h.sets);
    expect(sug.mode).toBe('same');
    expect(sug.weightKg).toBe(80);
    expect(sug.target).toBe(12); // meilleures reps + 1, plafonnées à 12
  });

  it('Gainage 30/30 s (20–30) → cible 35 s', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [{ id: 'plank', weight: null, values: [30, 30] }]));
    const sug = E.suggest(program, { exerciseId: 'plank', range: [20, 30] }, h.workouts, h.sets);
    expect(sug.target).toBe(35);
  });

  it('exercice jamais fait → mode séance test', () => {
    const sug = E.suggest(program, { exerciseId: 'goblet_squat', range: [8, 12] }, [], []);
    expect(sug.mode).toBe('test');
    expect(sug.weightKg).toBeNull();
    expect(sug.message).toContain('8 reps');
  });

  it('dimanche → pas de jour d’entraînement', () => {
    expect(E.isTrainingDay(program, settings, '2026-11-08')).toBe(false);
    expect(E.todayPlan(program, settings, [], '2026-11-08').trainingDay).toBe(false);
  });
});

describe('semaines et phases', () => {
  it('avant le début → programme non commencé', () => {
    const p = E.todayPlan(program, settings, [], '2026-11-01');
    expect(p.info.started).toBe(false);
    expect(p.info.daysToStart).toBe(1);
    expect(p.templateId).toBe('A1');
  });

  it('au-delà de S24 → recommence la phase 3', () => {
    const d = E.addDays('2026-11-02', 24 * 7); // S25
    const info = E.weekInfo(program, settings, d);
    expect(info.raw).toBe(25);
    expect(info.week).toBe(13);
    expect(info.phase.id).toBe('P3');
    expect(info.cycle).toBe(2);
    expect(E.weekInfo(program, settings, E.addDays(d, 7 * 11)).week).toBe(24);
  });

  it('séance minimum : 3 exercices, cardio 10 min', () => {
    const s = E.buildSession(program, 'A2', 6, { minimum: true });
    expect(s.exercises.map((e) => e.id)).toEqual(['goblet_squat', 'db_bench', 'lat_pulldown']);
    expect(s.cardioMin).toBe(10);
  });

  it('séance minimum comptée comme terminée pour la rotation', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [], { minimum: true }));
    expect(E.todayPlan(program, settings, h.workouts, '2026-11-11').templateId).toBe('B1');
  });

  it('option 4 jours en phase 3 : rotation U/L et jours 1,2,4,5', () => {
    const s4 = { ...settings, fourDayOption: true };
    const p = E.todayPlan(program, s4, [], '2027-01-26'); // mardi S13
    expect(p.trainingDay).toBe(true);
    expect(p.templateId).toBe('U');
    // L'option n'a aucun effet en phase 2
    expect(E.todayPlan(program, s4, [], '2026-12-01').trainingDay).toBe(false);
  });

  it('séance non terminée ignorée pour la rotation', () => {
    const h = history(makeWorkout('2026-11-02', 'A1', [], { finishedAt: null }));
    expect(E.todayPlan(program, settings, h.workouts, '2026-11-04').templateId).toBe('A1');
  });
});

describe('suggestions', () => {
  it('ignore les séances de décharge pour la référence', () => {
    const h = history(
      makeWorkout('2026-12-18', 'B2', [{ id: 'leg_press', weight: 80, values: [12, 12, 12] }]),
      makeWorkout('2026-12-21', 'B2', [{ id: 'leg_press', weight: 72, values: [10, 10] }]),
    );
    expect(h.workouts[1].deload).toBe(true);
    const sug = E.suggest(program, { exerciseId: 'leg_press', range: [10, 12] }, h.workouts, h.sets);
    expect(sug.weightKg).toBe(85);
  });

  it('changement de fourchette entre phases → même charge, bas de la nouvelle fourchette', () => {
    // seated_row : B1 [10,12] → B2 [8,12]
    const h = history(makeWorkout('2026-11-27', 'B1', [{ id: 'seated_row', weight: 50, values: [12, 12, 12] }]));
    const sug = E.suggest(program, { exerciseId: 'seated_row', range: [8, 12] }, h.workouts, h.sets);
    expect(sug.mode).toBe('newRange');
    expect(sug.weightKg).toBe(50);
    expect(sug.target).toBe(8);
  });

  it('remplacement enregistré sous l’id du substitut', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [{ id: 'goblet_squat', planned: 'leg_press', weight: 20, values: [12, 12, 12] }]));
    expect(E.suggest(program, { exerciseId: 'leg_press', range: [10, 12] }, h.workouts, h.sets).mode).toBe('test');
    const sub = E.suggest(program, { exerciseId: 'goblet_squat', range: [10, 12] }, h.workouts, h.sets);
    expect(sub.weightKg).toBe(25);
  });

  it('incréments par catégorie : haut du corps +2,5, isolation +1', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [
      { id: 'chest_press_machine', weight: 40, values: [12, 12, 12] },
      { id: 'leg_curl', weight: 30, values: [15, 15] },
    ]));
    expect(E.suggest(program, { exerciseId: 'chest_press_machine', range: [10, 12] }, h.workouts, h.sets).weightKg).toBe(42.5);
    expect(E.suggest(program, { exerciseId: 'leg_curl', range: [12, 15] }, h.workouts, h.sets).weightKg).toBe(31);
  });

  it('farmer walk : distance inchangée, +2 kg', () => {
    const h = history(makeWorkout('2026-12-04', 'B2', [{ id: 'farmer_carry', weight: 20, values: [30, 30, 30] }]));
    const sug = E.suggest(program, { exerciseId: 'farmer_carry', range: [30, 30] }, h.workouts, h.sets);
    expect(sug.weightKg).toBe(22);
    expect(sug.target).toBe(30);
  });

  it('séries non validées ignorées', () => {
    const h = history(makeWorkout('2026-11-09', 'A1', [{ id: 'leg_press', weight: 80, values: [12, 12, 12] }]));
    h.sets[2].done = false;
    h.sets[2].value = 6;
    expect(E.suggest(program, { exerciseId: 'leg_press', range: [10, 12] }, h.workouts, h.sets).weightKg).toBe(85);
  });
});

describe('assiduité', () => {
  it('semaine 2/3 et règle des 2 jours', () => {
    const h = history(makeWorkout('2026-11-02', 'A1'), makeWorkout('2026-11-04', 'B1'));
    const a = E.weekAdherence(program, settings, h.workouts, '2026-11-07');
    expect(a).toMatchObject({ planned: 3, done: 2 });
    expect(E.missedSession(program, settings, h.workouts, '2026-11-07')).toEqual({ missedDate: '2026-11-06' });
    expect(E.missedSession(program, settings, h.workouts, '2026-11-05')).toBeNull();
  });

  it('série de semaines consécutives', () => {
    const h = history(
      makeWorkout('2026-11-02', 'A1'), makeWorkout('2026-11-04', 'B1'), makeWorkout('2026-11-06', 'A1'),
      makeWorkout('2026-11-09', 'B1'), makeWorkout('2026-11-11', 'A1'), makeWorkout('2026-11-13', 'B1'),
      makeWorkout('2026-11-16', 'A1'),
    );
    expect(E.streak(program, settings, h.workouts, '2026-11-17')).toBe(2);
    expect(E.streak(program, settings, [], '2026-11-17')).toBe(0);
  });

  it('option 4 jours verrouillée avant S13 et selon l’assiduité', () => {
    const u = E.fourDayUnlock(program, settings, [], '2026-11-20');
    expect(u.unlocked).toBe(false);
    const all = [];
    for (let d = '2026-11-02'; d < '2027-01-25'; d = E.addDays(d, 1)) {
      if (E.isTrainingDay(program, settings, d)) all.push(makeWorkout(d, 'A1').workout);
    }
    const ok = E.fourDayUnlock(program, settings, all, '2027-01-25');
    expect(ok.planned).toBe(36);
    expect(ok.unlocked).toBe(true);
  });
});

describe('corps', () => {
  const entries = (list) => list.map(([date, weightKg]) => ({ date, weightKg }));

  it('moyenne hebdomadaire par semaine ISO', () => {
    const w = E.weeklyAverages(entries([['2026-11-02', 115], ['2026-11-04', 114], ['2026-11-09', 113.5]]));
    expect(w).toEqual([
      { week: '2026-W45', monday: '2026-11-02', avg: 114.5, n: 2 },
      { week: '2026-W46', monday: '2026-11-09', avg: 113.5, n: 1 },
    ]);
  });

  it('alerte stagnation après 3 semaines sans baisse', () => {
    const base = entries([['2026-11-02', 115], ['2026-11-09', 114], ['2026-11-16', 114.2], ['2026-11-23', 114.1]]);
    expect(E.stallAlert(E.weeklyAverages(base))).toBe(false);
    const stalled = [...base, ...entries([['2026-11-30', 114.3]])];
    expect(E.stallAlert(E.weeklyAverages(stalled))).toBe(true);
    const gap = entries([['2026-11-02', 115], ['2026-11-09', 115], ['2026-11-30', 115], ['2026-12-07', 115]]);
    expect(E.stallAlert(E.weeklyAverages(gap))).toBe(false);
  });
});

describe('progrès', () => {
  it('séries et records', () => {
    const h = history(
      makeWorkout('2026-11-02', 'A1', [{ id: 'leg_press', weight: 80, values: [12, 12] }]),
      makeWorkout('2026-11-09', 'A1', [{ id: 'leg_press', weight: 85, values: [10, 9, 9] }]),
    );
    const s = E.exerciseSeries('leg_press', h.workouts, h.sets);
    expect(s.map((x) => x.maxWeight)).toEqual([80, 85]);
    expect(s[0].volume).toBe(1920);
    const pr = E.personalRecords(program, h.workouts, h.sets);
    expect(pr[0]).toMatchObject({ exerciseId: 'leg_press', weightKg: 85, value: 10 });
  });
});
