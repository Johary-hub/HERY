import * as E from '../engine.js';
import { getAll, put, del } from '../db.js';
import { today } from '../clock.js';
import { makeChart, dateAxis, tooltipDate, pt, COLORS, fade } from '../charts.js';
import { $, esc, fmtDate, num, toast, uuid } from '../ui.js';
import { icon } from '../icons.js';

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

const signed = (raw) => {
  const d = Math.round(raw * 10) / 10; // arrondi avant le signe : pas de « +0 »
  return `${d > 0 ? '+' : d < 0 ? '−' : ''}${num(Math.abs(d))}`;
};

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
    const prevAvg = weekly[weekly.length - 2];
    const total = weekly.length > 1 ? lastAvg.avg - weekly[0].avg : null;
    const week = prevAvg ? lastAvg.avg - prevAvg.avg : null;
    const waistDelta = waists.length > 1 ? waists[waists.length - 1].waistCm - waists[0].waistCm : null;

    app.innerHTML = `
      <header class="topbar"><div><p class="eyebrow">Suivi</p><h1>Corps</h1></div>
        <span class="icon-btn" aria-hidden="true">${icon('scale', 22)}</span></header>

      ${stall ? `<div class="alert">${icon('warn', 20)}<div><strong>Stagnation</strong><br>Ta moyenne hebdomadaire ne baisse plus depuis 3 semaines. ${esc(stallText(program))}</div></div>` : ''}

      <section class="card">
        <div class="row between nowrap">
          <span class="muted small">Moyenne de la semaine</span>
          ${week != null ? `<span class="delta ${week <= 0 ? 'down' : 'up'}">${signed(week)} kg</span>` : ''}
        </div>
        <div class="big-number" style="margin:10px 0 4px">${lastAvg ? num(lastAvg.avg) : '—'}<small>kg</small></div>
        <p class="muted small">${lastAvg ? `${lastAvg.n} pesée${lastAvg.n > 1 ? 's' : ''} cette semaine-là` : 'Aucune pesée pour l’instant'}</p>
        ${weights.length ? '<div class="chart-box" style="margin-top:14px"><canvas id="c-weight" aria-label="Graphique du poids"></canvas></div>' : ''}
      </section>

      <div class="tiles">
        <div class="tile">
          <span class="t-icon accent">${icon('chart', 20)}</span>
          <div class="t-value">${total == null ? '—' : signed(total)}<small>kg</small></div>
          <span class="t-label">depuis la 1ʳᵉ semaine</span>
        </div>
        <div class="tile">
          <span class="t-icon violet">${icon('ruler', 20)}</span>
          <div class="t-value">${waists.length ? num(waists[waists.length - 1].waistCm) : '—'}<small>cm</small></div>
          <span class="t-label">tour de taille${waistDelta != null ? ` (${signed(waistDelta)})` : ''}</span>
        </div>
      </div>

      <div class="section-title"><h2>Nouvelle mesure</h2></div>
      <form class="card stack" id="body-form" novalidate>
        <div><label for="b-date">Date</label><input id="b-date" type="date" required value="${today()}" max="${today()}" /></div>
        <div class="row nowrap">
          <div class="grow"><label for="b-weight">Poids (kg)</label><input id="b-weight" inputmode="decimal" placeholder="114,6" autocomplete="off" /></div>
          <div class="grow"><label for="b-waist">Taille (cm)</label><input id="b-waist" inputmode="decimal" placeholder="118" autocomplete="off" /></div>
        </div>
        <button class="primary block" type="submit">Enregistrer</button>
        <p class="muted small">Pesée ${esc(program.tracking.bodyWeight.frequency)} · tour de taille ${esc(program.tracking.waist.frequency)}.</p>
      </form>

      ${waists.length > 1 ? `<div class="section-title"><h2>Tour de taille</h2></div>
        <div class="card"><div class="chart-box" style="height:200px"><canvas id="c-waist" aria-label="Graphique du tour de taille"></canvas></div></div>` : ''}

      ${entries.length ? `<div class="section-title"><h2>Historique</h2><span class="muted small">${entries.length} mesures</span></div>
        <div class="card"><ul class="list">${[...entries].reverse().slice(0, 30).map((e) => `
        <li><div class="li-main"><span class="li-ico">${icon(e.weightKg != null ? 'scale' : 'ruler', 18)}</span>
            <div><div>${esc(fmtDate(e.date))}</div>
            <div class="muted small">${e.weightKg != null ? num(e.weightKg) + ' kg' : ''}${e.weightKg != null && e.waistCm != null ? ' · ' : ''}${e.waistCm != null ? num(e.waistCm) + ' cm' : ''}</div></div></div>
          <button class="icon-btn" data-del="${esc(e.id)}" aria-label="Supprimer la mesure du ${esc(e.date)}">${icon('trash', 18)}</button></li>`).join('')}</ul></div>` : ''}`;

    if (weights.length) {
      charts.push(makeChart($('#c-weight', app), {
        type: 'line',
        data: { datasets: [
          // Ligne principale : moyenne hebdomadaire, placée au milieu de la semaine (jeudi)
          { label: 'Moyenne hebdo', data: weekly.map((w) => pt(E.addDays(w.monday, 3), w.avg)), borderColor: COLORS.accent, backgroundColor: fade(), fill: 'start', borderWidth: 3, pointRadius: 4, pointBackgroundColor: COLORS.accent, tension: 0.35 },
          { type: 'scatter', label: 'Pesées', data: weights.map((e) => pt(e.date, e.weightKg)), pointRadius: 3, backgroundColor: COLORS.muted, borderColor: 'transparent' },
        ] },
        options: {
          scales: { x: dateAxis(weights.map((e) => pt(e.date, 0))), y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } } },
          plugins: { tooltip: tooltipDate(), legend: { position: 'bottom' } },
        },
      }));
    }
    if (waists.length > 1) {
      charts.push(makeChart($('#c-waist', app), {
        type: 'line',
        data: { datasets: [{ label: 'Tour de taille', data: waists.map((e) => pt(e.date, e.waistCm)), borderColor: COLORS.info, backgroundColor: fade('165,148,255'), fill: 'start', borderWidth: 3, pointRadius: 4, pointBackgroundColor: COLORS.info, tension: 0.35 }] },
        options: { scales: { x: dateAxis(waists.map((e) => pt(e.date, 0))), y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } } }, plugins: { tooltip: tooltipDate(), legend: { display: false } } },
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
