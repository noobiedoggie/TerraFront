// Recherche d'adresse via Nominatim (OpenStreetMap), selon sa politique d'usage :
// - 1 requête par seconde maximum (file d'attente + délai) ;
// - User-Agent identifiant l'appli (requête native sur Android ; le navigateur envoie son Referer) ;
// - pas d'autocomplétion à la frappe : recherche explicite, résultats proposés en liste ; mise en cache.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { CONFIG } from '../config.js';

const G = CONFIG.GEOCODER;
const cache = new Map();
let queue = Promise.resolve();
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(q) {
  const params = { q, format: 'jsonv2', limit: '5', 'accept-language': 'fr' };
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({
      url: G.url, params,
      headers: { 'User-Agent': G.userAgent, Accept: 'application/json' },
      connectTimeout: 10000, readTimeout: 10000,
    });
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
  const r = await fetch(G.url + '?' + new URLSearchParams(params), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export function searchAddress(text) {
  const q = text.trim();
  if (q.length < 3) return Promise.resolve([]);
  if (cache.has(q)) return Promise.resolve(cache.get(q));
  const job = queue.then(async () => {
    const wait = last + G.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const data = await request(q);
    const results = (Array.isArray(data) ? data : []).map((d) => ({ label: d.display_name, lat: +d.lat, lon: +d.lon }));
    cache.set(q, results);
    return results;
  });
  queue = job.catch(() => {});
  return job;
}
