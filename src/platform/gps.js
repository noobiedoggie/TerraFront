// GPS (watchPosition haute précision) et maintien de l'écran allumé.
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';

const toPoint = (p) => ({
  lat: p.coords.latitude,
  lon: p.coords.longitude,
  accuracy: p.coords.accuracy,
  speed: p.coords.speed ?? null,
  time: p.timestamp || Date.now(),
});

export function errorKind(err) {
  const msg = String(err?.message || err || '');
  if (err?.code === 1 || /denied|permission/i.test(msg)) return 'denied';
  if (err?.code === 3 || /timeout/i.test(msg)) return 'timeout';
  return 'unavailable';
}

export async function ensurePermission() {
  if (!Capacitor.isNativePlatform()) return true; // le navigateur demande lui-même
  try {
    let p = await Geolocation.checkPermissions();
    if (p.location !== 'granted' && p.coarseLocation !== 'granted') p = await Geolocation.requestPermissions();
    return p.location === 'granted' || p.coarseLocation === 'granted';
  } catch {
    return false;
  }
}

export async function currentPosition() {
  if (!(await ensurePermission())) throw Object.assign(new Error('permission denied'), { code: 1 });
  return toPoint(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }));
}

let watchId = null;

export async function startWatch(onPoint, onError) {
  if (watchId) return;
  if (!(await ensurePermission())) return onError({ code: 1 });
  watchId = 'pending';
  try {
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }, (pos, err) => {
      if (err) onError(err);
      else if (pos) onPoint(toPoint(pos));
    });
    if (watchId === 'pending') watchId = id;
    else Geolocation.clearWatch({ id }); // arrêté entre-temps
  } catch (e) {
    watchId = null;
    onError(e);
  }
}

export async function stopWatch() {
  const id = watchId;
  watchId = null;
  if (id && id !== 'pending') await Geolocation.clearWatch({ id }).catch(() => {});
}

export async function keepAwake(on) {
  try {
    if (on) await KeepAwake.keepAwake();
    else await KeepAwake.allowSleep();
  } catch {
    // non supporté (certains navigateurs) : sans conséquence
  }
}
