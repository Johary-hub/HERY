import * as E from '../engine.js';
import { getAll, put, del } from '../db.js';
import { today } from '../clock.js';
import { makeChart, dateAxis, tooltipDate, pt, COLORS } from '../charts.js';
import { $, esc, fmtDate, num, toast, uuid } from '../ui.js';

const parseNum = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

/** Texte du rappel de stagnation, tiré de program.json (partie après « rappel : »). */
function stallText(program) {
  const raw = program.tracking.stallAlert || '';
  const m = raw.match(/rappel\s*:\s*(.+)$/i);
  const t = (m ? m[1] : raw).trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export async function render({ app, program }) {
  let charts = [];
  const destroy = () => { charts.forEach((c) => c.destroy()); charts = []; };

  async function draw() {
    destroy();
    const entries = (await getAll('body')).sort((a, b) => a.date.localeCompare(b.date));
    const weights = entries.filter((e) => e.weightKg != null);
    const waists = entries.filter((e) => e.waistCm != null);
    const weekly = E.weeklyAverages(entries);
    const stall = E.stallAlert(weekly);
    const lastAvg = weekly[weekly.length - 1];
    const delta = weekly.length > 1 ? lastAvg.avg - weekly[0].avg : null;

    app.innerHTML = `
      <h1>Corps</h1>
      ${stall ? `<div class="alert"><strong>Stagnation :</strong> ta moyenne hebdomadaire ne baisse plus depuis 3 semaines. ${esc(stallText(program))}</div>` : ''}
      <form class="card stack" id="body-form" novalidate>
        <div><label for="b-date">Date</label><input id="b-date" type="date" required value="${today()}" max="${today()}" /></div>
        <div class="row">
          <div class="grow"><label for="b-weight">Poids (kg)</label><input id="b-weight" inputmode="decimal" placeholder="ex. 114,6" autocomplete="off" /></div>
          <div class="grow"><label for="b-waist">Tour de taille (cm)</label><input id="b-waist" inputmode="decimal" placeholder="ex. 118" autocomplete="off" /></div>
        </div>
        <button class="primary block" type="submit">Enregistrer</button>
        <p class="muted small">Pesée : ${esc(program.tracking.bodyWeight.frequency)} · Tour de taille : ${esc(program.tracking.waist.frequency)}</p>
      </form>
      <div class="stats">
        <div class="stat"><div class="v">${lastAvg ? num(lastAvg.avg) + ' kg' : '—'}</div><div class="l">Moyenne de la dernière semaine</div></div>
        <div class="stat"><div class="v">${delta == null ? '—' : (delta > 0 ? '+' : '') + num(delta) + ' kg'}</div><div class="l">Depuis la 1ʳᵉ semaine</div></div>
      </div>
      <h2>Poids</h2>
      ${weights.length ? '<div class="card"><div class="chart-box"><canvas id="c-weight" aria-label="Graphique du poids"></canvas></div></div>' : '<p class="muted">Aucune pesée pour l’instant.</p>'}
      ${waists.length ? '<h2>Tour de taille</h2><div class="card"><div class="chart-box"><canvas id="c-waist" aria-label="Graphique du tour de taille"></canvas></div></div>' : ''}
      ${entries.length ? `<h2>Historique</h2><div class="card"><ul class="list">${[...entries].reverse().slice(0, 30).map((e) => `
        <li><span>${esc(fmtDate(e.date, { year: true }))}</span>
          <span class="muted">${e.weightKg != null ? num(e.weightKg) + ' kg' : ''}${e.weightKg != null && e.waistCm != null ? ' · ' : ''}${e.waistCm != null ? num(e.waistCm) + ' cm' : ''}</span>
          <button class="small-btn ghost" data-del="${esc(e.id)}" aria-label="Supprimer la mesure du ${esc(e.date)}">✕</button></li>`).join('')}</ul></div>` : ''}`;

    if (weights.length) {
      charts.push(makeChart($('#c-weight', app), {
        type: 'line',
        data: { datasets: [
          { type: 'scatter', label: 'Pesées', data: weights.map((e) => pt(e.date, e.weightKg)), pointRadius: 3, backgroundColor: COLORS.muted, borderColor: COLORS.muted },
          // Ligne principale : moyenne hebdomadaire, placée au milieu de la semaine (jeudi)
          { label: 'Moyenne hebdo', data: weekly.map((w) => pt(E.addDays(w.monday, 3), w.avg)), borderColor: COLORS.accent, backgroundColor: COLORS.accent, borderWidth: 3, pointRadius: 4, tension: 0.2 },
        ] },
        options: { scales: { x: dateAxis(weights.map((e) => pt(e.date, 0))), y: { title: { display: true, text: 'kg' } } }, plugins: { tooltip: tooltipDate(), legend: { position: 'bottom' } } },
      }));
    }
    if (waists.length) {
      charts.push(makeChart($('#c-waist', app), {
        type: 'line',
        data: { datasets: [{ label: 'Tour de taille', data: waists.map((e) => pt(e.date, e.waistCm)), borderColor: COLORS.info, backgroundColor: COLORS.info, borderWidth: 2, pointRadius: 4 }] },
        options: { scales: { x: dateAxis(waists.map((e) => pt(e.date, 0))), y: { title: { display: true, text: 'cm' } } }, plugins: { tooltip: tooltipDate(), legend: { display: false } } },
      }));
    }
  }

  await draw();

  app.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = $('#b-date', app).value;
    const weightKg = parseNum($('#b-weight', app).value);
    const waistCm = parseNum($('#b-waist', app).value);
    if (!date) return toast('Indique une date');
    if (Number.isNaN(weightKg) || Number.isNaN(waistCm)) return toast('Valeur invalide');
    if (weightKg == null && waistCm == null) return toast('Saisis un poids ou un tour de taille');
    // Une mesure par jour : on complète l'entrée existante
    const existing = (await getAll('body')).find((x) => x.date === date);
    const entry = existing || { id: uuid(), date };
    if (weightKg != null) entry.weightKg = weightKg;
    if (waistCm != null) entry.waistCm = waistCm;
    await put('body', entry);
    toast('Mesure enregistrée');
    await draw();
  });

  app.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-del]')?.dataset.del;
    if (!id || !confirm('Supprimer cette mesure ?')) return;
    await del('body', id);
    await draw();
  });

  return destroy;
}
