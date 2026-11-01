// Chargement de program.json (source de vérité). Le fichier est précaché par le service worker.
let cache = null;

export async function loadProgram() {
  if (cache) return cache;
  const res = await fetch(`${import.meta.env.BASE_URL}program.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`program.json introuvable (${res.status})`);
  cache = await res.json();
  return cache;
}
