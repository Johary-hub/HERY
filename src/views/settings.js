import * as E from '../engine.js';
import { getSettings, saveSetting, getHistory, exportAll, importAll, resetAll, validateExport } from '../db.js';
import { today } from '../clock.js';
import { $, $$, esc, fmtDate, toast, DAY_SHORT } from '../ui.js';
import { icon, ring } from '../icons.js';

const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)} %`);

export async function render({ app, program, navigate }) {
  const saved = await getSettings();
  const settings = E.resolveSettings(program, saved);
  const { workouts } = await getHistory();
  const date = today();
  const unlock = E.fourDayUnlock(program, settings, workouts, date);
  const p3 = program.phases.find((p) => p.option4days);
  const canToggle4 = unlock.unlocked || settings.fourDayOption;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;

  app.innerHTML = `
    <header class="topbar"><div><p class="eyebrow">Préférences</p><h1>Réglages</h1></div>
      <span class="icon-btn" aria-hidden="true">${icon('settings', 22)}</span></header>

    <section class="card stack">
      <div class="row nowrap"><span class="li-ico" style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)">${icon('calendar', 20)}</span><h3 style="margin:0">Programme</h3></div>
      <div><label for="s-start">Date de début</label>
        <input id="s-start" type="date" value="${esc(settings.startDate)}" /></div>
      <p class="muted small">Par défaut : ${esc(fmtDate(program.startDate, { year: true }))}. ${program.totalWeeks} semaines.</p>
      <div><label>Jours d’entraînement</label>
        <div class="days">${DAY_SHORT.map((d, i) => {
          const n = i + 1;
          const on = settings.trainingDays.includes(n);
          return `<label class="${on ? 'on' : ''}"><input type="checkbox" data-day="${n}" ${on ? 'checked' : ''} />${d}</label>`;
        }).join('')}</div></div>
      <button type="button" class="small-btn ghost" data-act="default-days">Revenir aux jours par défaut</button>
    </section>

    ${p3 ? `
    <section class="card stack">
      <div class="toggle">
        <div><h3>Option 4 jours (${esc(p3.name)})</h3>
          <p class="muted small">Rotation ${esc(p3.option4days.rotation.join(' / '))}, jours ${p3.option4days.trainingDays.map((d) => DAY_SHORT[d - 1]).join(' ')}.</p></div>
        <label class="switch" style="margin:0"><input type="checkbox" id="s-four" ${settings.fourDayOption ? 'checked' : ''} ${canToggle4 ? '' : 'disabled'} aria-label="Activer l’option 4 jours" /><span></span></label>
      </div>
      <div class="row nowrap" style="gap:14px">
        ${ring(unlock.rate || 0, { size: 64, stroke: 7, color: unlock.rate != null && unlock.rate >= unlock.threshold ? 'var(--accent)' : 'var(--orange)', inner: `<span style="font-size:.85rem">${pct(unlock.rate)}</span>` })}
        <p class="small grow" style="margin:0">Assiduité S1–S12 : <strong>${unlock.done}/${unlock.planned}</strong> séances · seuil ${pct(unlock.threshold)}</p>
      </div>
      <p class="muted small">Condition : ${esc(p3.option4days.unlockCondition)}${unlock.complete ? '' : ` — décision possible à partir de S${p3.weeks[0]}`}.</p>
      ${unlock.unlocked ? `<div class="alert ok">${icon('check', 20)}<div>Condition remplie 🎉</div></div>` : ''}
    </section>` : ''}

    <section class="card stack">
      <h3>Sauvegarde</h3>
      <p class="muted small">Toutes les données restent sur ce téléphone. Exporte régulièrement (changement de téléphone, réinstallation).</p>
      <button type="button" class="primary block" data-act="export">${icon('download', 20)}Exporter (JSON)</button>
      <label class="btn block" for="s-import" style="margin:0;color:var(--text)">${icon('upload', 20)}Importer une sauvegarde</label>
      <input type="file" id="s-import" accept="application/json,.json" hidden />
      ${persisted === false ? '<button type="button" class="block ghost small-btn" data-act="persist">Protéger le stockage contre l’effacement automatique</button>' : ''}
      ${persisted ? '<p class="muted small">Stockage protégé ✓</p>' : ''}
    </section>

    <section class="card stack">
      <h3>Zone dangereuse</h3>
      <button type="button" class="danger block" data-act="reset">${icon('trash', 20)}Réinitialiser toutes les données</button>
    </section>

    <p class="muted small" style="text-align:center">${esc(program.name)} · programme v${esc(program.version)}</p>`;

  const rerender = () => navigate('settings');

  $('#s-start', app).addEventListener('change', async (e) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return toast('Date invalide');
    await saveSetting('startDate', e.target.value);
    toast('Date de début enregistrée');
  });

  app.addEventListener('change', async (e) => {
    if (e.target.matches('[data-day]')) {
      const days = $$('[data-day]', app).filter((c) => c.checked).map((c) => Number(c.dataset.day));
      if (!days.length) {
        e.target.checked = true;
        return toast('Garde au moins un jour');
      }
      e.target.closest('label').classList.toggle('on', e.target.checked);
      await saveSetting('trainingDays', days);
    }
    if (e.target.id === 's-four') {
      await saveSetting('fourDayOption', e.target.checked);
      toast(e.target.checked ? 'Option 4 jours activée' : 'Option 4 jours désactivée');
      rerender();
    }
    if (e.target.id === 's-import') {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        validateExport(data);
        const msg = `Importer ${data.workouts.length} séance(s) et ${data.body.length} mesure(s) du ${data.exportedAt?.slice(0, 10) || '?'} ?\nToutes les données actuelles seront remplacées.`;
        if (!confirm(msg)) return;
        await importAll(data);
        toast('Sauvegarde restaurée');
        rerender();
      } catch (err) {
        toast(`Import impossible : ${err.message}`, 4000);
      }
    }
  });

  app.addEventListener('click', async (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'default-days') {
      await saveSetting('trainingDays', [...program.defaultTrainingDays]);
      rerender();
    }
    if (act === 'export') {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hery-sauvegarde-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Sauvegarde téléchargée');
    }
    if (act === 'persist') {
      const ok = await navigator.storage.persist();
      toast(ok ? 'Stockage protégé' : 'Le navigateur a refusé (installe l’app sur l’écran d’accueil)', 3500);
      rerender();
    }
    if (act === 'reset') {
      if (!confirm('Effacer TOUTES les données (séances, mesures, réglages) ?')) return;
      if (!confirm('Dernière confirmation : cette action est irréversible. As-tu exporté une sauvegarde ?')) return;
      await resetAll();
      toast('Données réinitialisées');
      navigate('today');
    }
  });
}
