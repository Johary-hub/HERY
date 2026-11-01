// Accès IndexedDB (base « hery », version 1). Aucune donnée ne quitte le téléphone.
import { openDB } from 'idb';

export const STORES = ['workouts', 'sets', 'body', 'settings'];
let dbPromise = null;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB('hery', 1, {
      upgrade(d) {
        const w = d.createObjectStore('workouts', { keyPath: 'id' });
        w.createIndex('date', 'date');
        const s = d.createObjectStore('sets', { keyPath: 'id' });
        s.createIndex('workoutId', 'workoutId');
        s.createIndex('exerciseId', 'exerciseId');
        const b = d.createObjectStore('body', { keyPath: 'id' });
        b.createIndex('date', 'date');
        d.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export const getAll = async (store) => (await db()).getAll(store);
export const put = async (store, value) => (await db()).put(store, value);
export const get = async (store, key) => (await db()).get(store, key);
export const del = async (store, key) => (await db()).delete(store, key);

/* Réglages : une ligne { key, value } par réglage. */
export async function getSettings() {
  const rows = await getAll('settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export const saveSetting = (key, value) => put('settings', { key, value });

/** Historique complet utilisé par le moteur. */
export async function getHistory() {
  const [workouts, sets] = await Promise.all([getAll('workouts'), getAll('sets')]);
  return { workouts, sets };
}

/** Séance commencée mais pas terminée (la plus récente). */
export async function getActiveWorkout() {
  const all = await getAll('workouts');
  return all.filter((w) => !w.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] || null;
}

export async function getWorkoutSets(workoutId) {
  const list = await (await db()).getAllFromIndex('sets', 'workoutId', workoutId);
  return list.sort((a, b) => a.setIndex - b.setIndex);
}

/** Enregistre une séance et ses séries dans une seule transaction. */
export async function saveWorkoutWithSets(workout, sets) {
  const tx = (await db()).transaction(['workouts', 'sets'], 'readwrite');
  tx.objectStore('workouts').put(workout);
  for (const s of sets) tx.objectStore('sets').put(s);
  await tx.done;
}

export async function deleteWorkout(id) {
  const d = await db();
  const sets = await d.getAllKeysFromIndex('sets', 'workoutId', id);
  const tx = d.transaction(['workouts', 'sets'], 'readwrite');
  tx.objectStore('workouts').delete(id);
  for (const k of sets) tx.objectStore('sets').delete(k);
  await tx.done;
}

/* Export / import / réinitialisation */
export async function exportAll() {
  const [workouts, sets, body, settings] = await Promise.all(STORES.map(getAll));
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), workouts, sets, body, settings };
}

export function validateExport(data) {
  if (!data || typeof data !== 'object') throw new Error('Fichier illisible');
  if (data.schemaVersion !== 1) throw new Error(`Version de sauvegarde non prise en charge (${data.schemaVersion})`);
  for (const s of STORES) if (!Array.isArray(data[s])) throw new Error(`Section « ${s} » manquante`);
  return true;
}

export async function importAll(data) {
  validateExport(data);
  const tx = (await db()).transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const store = tx.objectStore(s);
    store.clear();
    for (const row of data[s]) store.put(row);
  }
  await tx.done;
}

export async function resetAll() {
  const tx = (await db()).transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  await tx.done;
}
