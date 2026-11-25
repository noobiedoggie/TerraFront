// Sauvegarde locale (Capacitor Preferences : SharedPreferences sur Android, localStorage sur le web).
import { Preferences } from '@capacitor/preferences';
import { deserialize, serialize } from '../engine/state.js';

const KEY = 'terrafront.state';
let chain = Promise.resolve();

export async function loadState() {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return null;
  try {
    return deserialize(value);
  } catch (e) {
    // Sauvegarde illisible : on la met de côté au lieu de l'écraser.
    await Preferences.set({ key: KEY + '.corrupt.' + Date.now(), value });
    console.error('Sauvegarde illisible', e);
    return null;
  }
}

// Écritures sérialisées : jamais deux sauvegardes en parallèle.
export function saveState(state) {
  const value = serialize(state);
  chain = chain.then(() => Preferences.set({ key: KEY, value })).catch((e) => console.error('Sauvegarde impossible', e));
  return chain;
}

export function clearState() {
  chain = chain.then(() => Preferences.remove({ key: KEY }));
  return chain;
}
