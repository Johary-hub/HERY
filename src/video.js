// Vidéos de démonstration des exercices.
// Aucune vidéo n'est embarquée (l'app doit rester légère et hors ligne) :
//  1. lien choisi par l'utilisateur (réglage « videos », exporté avec la sauvegarde),
//  2. sinon champ optionnel `video` de l'exercice dans program.json,
//  3. sinon recherche YouTube pré-remplie.
import { getSettings, saveSetting } from './db.js';
import { esc, toast } from './ui.js';
import { icon } from './icons.js';

/** Extrait l'identifiant d'une URL YouTube (watch, youtu.be, shorts, embed). null si invalide. */
export function youtubeId(url) {
  if (!url) return null;
  const s = String(url).trim();
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : null;
}

export function searchUrl(exercise) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} exercice technique`)}`;
}

async function savedVideos() {
  const v = (await getSettings()).videos;
  return v && typeof v === 'object' ? v : {};
}

/** Ouvre la fiche vidéo d'un exercice (fenêtre modale). */
export async function openVideo(program, exerciseId) {
  const ex = program.exercises[exerciseId];
  if (!ex) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'video-sheet';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());

  async function draw(editing = false) {
    const videos = await savedVideos();
    const custom = videos[exerciseId];
    const id = youtubeId(custom) || youtubeId(ex.video);
    const online = navigator.onLine !== false;
    let player;
    if (id && !editing) {
      player = online
        ? `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0&playsinline=1&modestbranding=1"
             title="Démonstration : ${esc(ex.name)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
             allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`
        : `<div class="alert info">${icon('info', 20)}<div>Vidéo indisponible hors connexion. La consigne ci-dessous reste valable.</div></div>`;
    } else {
      player = `
        <div class="video-empty">
          <span class="t-ico">${icon('play', 22)}</span>
          <p><strong>${id ? 'Changer la vidéo' : 'Pas encore de vidéo'}</strong><br>
          <span class="muted small">1. Cherche une démo sur YouTube · 2. Copie son lien (Partager → Copier le lien) · 3. Colle-le ici.</span></p>
        </div>
        <a class="btn block" href="${esc(searchUrl(ex))}" target="_blank" rel="noopener">${icon('arrow', 18)}Chercher sur YouTube</a>
        <form class="row nowrap" data-form>
          <input name="url" inputmode="url" autocomplete="off" placeholder="https://youtu.be/…" aria-label="Lien de la vidéo YouTube" value="${esc(custom || '')}" />
          <button class="primary" type="submit">OK</button>
        </form>
        ${!online ? `<p class="muted small">Pas de connexion : la recherche et la lecture nécessitent Internet.</p>` : ''}`;
    }
    dlg.innerHTML = `
      <div class="stack">
        <div class="row between nowrap">
          <div class="grow"><p class="eyebrow">Démonstration</p><h2 style="margin:0">${esc(ex.name)}</h2></div>
          <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('close', 20)}</button>
        </div>
        ${player}
        <div class="target"><span class="t-ico">${icon('info', 20)}</span><div><div class="t-sub">Consigne</div><div>${esc(ex.cue)}</div></div></div>
        ${id && !editing ? `<div class="row nowrap">
          <button type="button" class="small-btn grow" data-edit>${icon('swap', 16)}Changer</button>
          ${custom ? `<button type="button" class="small-btn danger grow" data-remove>${icon('trash', 16)}Retirer</button>` : ''}
        </div>` : ''}
      </div>`;
  }

  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
    if (e.target.closest('[data-edit]')) return draw(true);
    if (e.target.closest('[data-remove]')) {
      const videos = await savedVideos();
      delete videos[exerciseId];
      await saveSetting('videos', videos);
      toast('Vidéo retirée');
      return draw();
    }
  });
  dlg.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    if (!youtubeId(url)) return toast('Lien YouTube non reconnu', 3000);
    const videos = await savedVideos();
    videos[exerciseId] = url;
    await saveSetting('videos', videos);
    toast('Vidéo enregistrée pour cet exercice');
    draw();
  });

  await draw();
  dlg.showModal();
}
