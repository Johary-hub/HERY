import * as E from '../engine.js';
import { getHistory } from '../db.js';
import { makeChart, dateAxis, tooltipDate, pt, COLORS, fade } from '../charts.js';
import { $, esc, fmtDate, fmtDuration, num, unitLabel } from '../ui.js';
import { icon } from '../icons.js';

export async function render({ app, program, param, navigate }) {
  const { workouts, sets } = await getHistory();
  const finished = E.finishedWorkouts(workouts);
  const finishedIds = new Set(finished.map((w) => w.id));
  const doneIds = [...new Set(sets.filter((s) => s.done && finishedIds.has(s.workoutId)).map((s) => s.exerciseId))]
    .filter((id) => program.exercises[id])
    .sort((a, b) => program.exercises[a].name.localeCompare(program.exercises[b].name, 'fr'));

  const header = `<header class="topbar"><div><p class="eyebrow">Statistiques</p><h1>Progrès</h1></div>
    <span class="icon-btn" aria-hidden="true">${icon('chart', 22)}</span></header>`;

  if (!doneIds.length) {
    app.innerHTML = `${header}
      <section class="hero dark">
        <div class="hero-top"><span class="chip">${icon('trophy', 14)}Records</span></div>
        <p class="hero-eyebrow">Pas encore de données</p>
        <h2 class="hero-title">Première séance ?</h2>
        <p class="hero-sub muted">Les courbes et les records apparaîtront après ta première séance terminée.</p>
      </section>`;
    return;
  }

  const selected = doneIds.includes(param) ? param : doneIds[0];
  const ex = program.exercises[selected];
  const series = E.exerciseSeries(selected, workouts, sets);
  const weighted = series.some((p) => p.maxWeight > 0);
  const records = E.personalRecords(program, workouts, sets);
  const unit = unitLabel(ex.unit);
  const first = series[0];
  const last = series[series.length - 1];
  const gain = weighted ? last.maxWeight - first.maxWeight : last.bestValue - first.bestValue;
  const totalMin = finished.reduce((t, w) => t + (w.startedAt && w.finishedAt ? new Date(w.finishedAt) - new Date(w.startedAt) : 0), 0);

  const recordText = (r) => (r.weightKg > 0 ? `${num(r.weightKg)} kg × ${num(r.value)}` : `${num(r.value)} ${unitLabel(r.unit)}`);

  app.innerHTML = `${header}
    <div class="tiles">
      <div class="tile lime">
        <span class="t-label">Séances terminées</span>
        <div class="t-value">${finished.length}</div>
        <span class="t-label">${esc(fmtDuration(totalMin))} au total</span>
      </div>
      <div class="tile">
        <span class="t-icon orange">${icon('trophy', 20)}</span>
        <div class="t-value">${records.length}</div>
        <span class="t-label">exercices avec record</span>
      </div>
    </div>

    <div class="section-title"><h2>Par exercice</h2></div>
    <label for="ex-select" class="sr">Exercice</label>
    <select id="ex-select">${doneIds.map((id) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(program.exercises[id].name)}</option>`).join('')}</select>
    <section class="card">
      <div class="row between nowrap">
        <div><div class="muted small">${weighted ? 'Charge max' : 'Meilleure série'}</div>
          <div class="big-number" style="font-size:2.6rem">${num(weighted ? last.maxWeight : last.bestValue)}<small>${weighted ? 'kg' : esc(unit)}</small></div></div>
        ${series.length > 1 ? `<span class="delta ${gain >= 0 ? 'down' : 'up'}">${gain >= 0 ? '+' : '−'}${num(Math.abs(gain))} ${weighted ? 'kg' : esc(unit)}</span>` : ''}
      </div>
      <div class="chart-box" style="margin-top:14px"><canvas id="c-ex" aria-label="Progression de ${esc(ex.name)}"></canvas></div>
      <p class="muted small">${series.length} séance${series.length > 1 ? 's' : ''} · ${weighted ? 'charge max (kg) et volume (charge × reps)' : `meilleure série et total (${esc(unit)})`}</p>
    </section>

    <div class="section-title"><h2>Records personnels</h2></div>
    <div class="card"><ul class="list">${records.map((r) => `
      <li><div class="li-main"><span class="li-ico">${icon('trophy', 18)}</span>
        <div><div>${esc(r.name)}</div><div class="muted small">${esc(fmtDate(r.date, { weekday: false }))}</div></div></div>
        <strong style="white-space:nowrap">${esc(recordText(r))}</strong></li>`).join('')}</ul></div>

    <div class="section-title"><h2>Dernières séances</h2></div>
    <div class="card"><ul class="list">${[...finished].reverse().slice(0, 15).map((w) => `
      <li><div class="li-main"><span class="li-ico">${icon(w.minimum ? 'bolt' : 'dumbbell', 18)}</span>
        <div><div>${esc(fmtDate(w.date))}</div>
        <div class="muted small">${esc(program.sessions[w.templateId]?.name || w.templateId)}${w.minimum ? ' · minimum' : ''}${w.deload ? ' · décharge' : ''}</div>
        ${w.note ? `<div class="muted small">« ${esc(w.note)} »</div>` : ''}</div></div>
        <div class="muted small" style="text-align:right;white-space:nowrap">${w.startedAt && w.finishedAt ? fmtDuration(new Date(w.finishedAt) - new Date(w.startedAt)) : ''}${w.feeling ? `<br>${'●'.repeat(w.feeling)}${'○'.repeat(5 - w.feeling)}` : ''}</div></li>`).join('')}</ul></div>`;

  const chart = makeChart($('#c-ex', app), {
    type: 'line',
    data: {
      datasets: [
        { label: weighted ? 'Charge max (kg)' : `Meilleure série (${unit})`, data: series.map((p) => pt(p.date, weighted ? p.maxWeight : p.bestValue)),
          borderColor: COLORS.accent, backgroundColor: fade(), fill: 'start', borderWidth: 3, pointRadius: 4, pointBackgroundColor: COLORS.accent, tension: 0.35, yAxisID: 'y' },
        { label: weighted ? 'Volume' : `Total (${unit})`, data: series.map((p) => pt(p.date, weighted ? p.volume : p.totalValue)),
          borderColor: COLORS.info, backgroundColor: COLORS.info, borderWidth: 2, pointRadius: 3, borderDash: [6, 5], tension: 0.35, yAxisID: 'y2' },
      ],
    },
    options: {
      scales: {
        x: dateAxis(series.map((p) => pt(p.date, 0))),
        y: { position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } },
        y2: { position: 'right', grid: { display: false }, border: { display: false } },
      },
      plugins: { tooltip: tooltipDate(), legend: { position: 'bottom' } },
    },
  });

  $('#ex-select', app).addEventListener('change', (e) => navigate(`progress/${encodeURIComponent(e.target.value)}`));

  return () => chart.destroy();
}
