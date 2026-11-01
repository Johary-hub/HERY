import * as E from '../engine.js';
import { getHistory } from '../db.js';
import { makeChart, dateAxis, tooltipDate, pt, COLORS } from '../charts.js';
import { $, esc, fmtDate, fmtDuration, num, unitLabel } from '../ui.js';

export async function render({ app, program, param, navigate }) {
  const { workouts, sets } = await getHistory();
  const finished = E.finishedWorkouts(workouts);
  const finishedIds = new Set(finished.map((w) => w.id));
  const doneIds = [...new Set(sets.filter((s) => s.done && finishedIds.has(s.workoutId)).map((s) => s.exerciseId))]
    .filter((id) => program.exercises[id])
    .sort((a, b) => program.exercises[a].name.localeCompare(program.exercises[b].name, 'fr'));

  if (!doneIds.length) {
    app.innerHTML = `<h1>Progrès</h1><div class="card"><p>Pas encore de séance terminée.</p>
      <p class="muted">Les courbes et records apparaîtront après ta première séance.</p></div>`;
    return;
  }

  const selected = doneIds.includes(param) ? param : doneIds[0];
  const ex = program.exercises[selected];
  const series = E.exerciseSeries(selected, workouts, sets);
  const weighted = series.some((p) => p.maxWeight > 0);
  const records = E.personalRecords(program, workouts, sets);
  const unit = unitLabel(ex.unit);

  const recordText = (r) => (r.weightKg > 0 ? `${num(r.weightKg)} kg × ${num(r.value)} ${unitLabel(r.unit)}` : `${num(r.value)} ${unitLabel(r.unit)}`);

  app.innerHTML = `
    <h1>Progrès</h1>
    <label for="ex-select">Exercice</label>
    <select id="ex-select">${doneIds.map((id) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(program.exercises[id].name)}</option>`).join('')}</select>
    <div class="card">
      <div class="chart-box"><canvas id="c-ex" aria-label="Progression de ${esc(ex.name)}"></canvas></div>
      <p class="muted small">${series.length} séance${series.length > 1 ? 's' : ''} · ${weighted ? 'charge max (kg) et volume (charge × reps)' : `meilleure série (${esc(unit)}) et total`}</p>
    </div>
    <h2>Records personnels</h2>
    <div class="card"><ul class="list">${records.map((r) => `
      <li><span>${esc(r.name)}</span><span class="muted">${esc(recordText(r))} · ${esc(fmtDate(r.date, { weekday: false }))}</span></li>`).join('')}</ul></div>
    <h2>Dernières séances</h2>
    <div class="card"><ul class="list">${[...finished].reverse().slice(0, 15).map((w) => `
      <li><span>${esc(fmtDate(w.date))}<br><span class="muted small">${esc(program.sessions[w.templateId]?.name || w.templateId)}${w.minimum ? ' · minimum' : ''}${w.deload ? ' · décharge' : ''}</span></span>
        <span class="muted small" style="text-align:right">${w.startedAt && w.finishedAt ? fmtDuration(new Date(w.finishedAt) - new Date(w.startedAt)) : ''}${w.feeling ? `<br>ressenti ${w.feeling}/5` : ''}</span></li>
      ${w.note ? `<li class="muted small" style="border-top:0;padding-top:0">« ${esc(w.note)} »</li>` : ''}`).join('')}</ul></div>`;

  const chart = makeChart($('#c-ex', app), {
    type: 'line',
    data: {
      datasets: weighted
        ? [
            { label: 'Charge max (kg)', data: series.map((p) => pt(p.date, p.maxWeight)), borderColor: COLORS.accent, backgroundColor: COLORS.accent, borderWidth: 3, pointRadius: 4, yAxisID: 'y' },
            { label: 'Volume', data: series.map((p) => pt(p.date, p.volume)), borderColor: COLORS.info, backgroundColor: COLORS.info, borderWidth: 2, pointRadius: 3, borderDash: [6, 4], yAxisID: 'y2' },
          ]
        : [
            { label: `Meilleure série (${unit})`, data: series.map((p) => pt(p.date, p.bestValue)), borderColor: COLORS.accent, backgroundColor: COLORS.accent, borderWidth: 3, pointRadius: 4, yAxisID: 'y' },
            { label: `Total (${unit})`, data: series.map((p) => pt(p.date, p.totalValue)), borderColor: COLORS.info, backgroundColor: COLORS.info, borderWidth: 2, pointRadius: 3, borderDash: [6, 4], yAxisID: 'y2' },
          ],
    },
    options: {
      scales: {
        x: dateAxis(series.map((p) => pt(p.date, 0))),
        y: { position: 'left', title: { display: true, text: weighted ? 'kg' : unit } },
        y2: { position: 'right', grid: { display: false }, title: { display: true, text: weighted ? 'volume' : 'total' } },
      },
      plugins: { tooltip: tooltipDate(), legend: { position: 'bottom' } },
    },
  });

  $('#ex-select', app).addEventListener('change', (e) => navigate(`progress/${encodeURIComponent(e.target.value)}`));

  return () => chart.destroy();
}
