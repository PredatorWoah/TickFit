// steps.js
// Android app only: today's steps (and the last week's) from Health Connect, Android's own health store that
// Google Fit, Samsung Health, Fitbit and most watches write into. TickFit only READS step counts, nothing
// else, and only after you turn it on in More and allow it. Nothing leaves the phone.
//
// Uses the Health plugin (@capgo/capacitor-health). Counts are kept in state.stepLog { "YYYY-MM-DD": 8412 }
// so they show offline and go into the backup and the spreadsheet export.

import { getState, setSetting, setSteps } from './store.js';
import { todayStr, addDays, fromStr } from './dates.js';
import { isNative, nativePlugin } from './platform.js';

const DAYS_BACK = 7;

export const stepsAvailable = () => isNative() && !!nativePlugin('Health');
export const stepsOn = () => stepsAvailable() && getState().settings.steps === true;

/** A plain number of steps, or null for anything odd. Pure. */
export function validSteps(v) {
  const n = Math.round(Number(v));
  return isFinite(n) && n >= 0 && n < 200000 ? n : null;
}

/** "8,412" Pure. */
export const stepsText = (n) => Number(n).toLocaleString('en');

/** Local midnight of a date as an ISO time, for the Health Connect query. Pure. */
export function midnightIso(date) {
  const d = fromStr(date); // midday
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Turn steps on: checks Health Connect is there and asks for permission to read steps.
 * Returns { ok, message }.
 */
export async function connectSteps() {
  const Health = nativePlugin('Health');
  if (!isNative() || !Health) return { ok: false, message: 'Steps work in the TickFit Android app.' };
  try {
    const a = await Health.isAvailable();
    if (!a || !a.available) return { ok: false, message: 'Health Connect is not on this phone. Install "Health Connect by Android" from the Play Store (Android 14 and newer have it built in), then try again.' };
    const s = await Health.requestAuthorization({ read: ['steps'] });
    if (!s || !(s.readAuthorized || []).includes('steps')) return { ok: false, message: 'TickFit was not allowed to read steps. You can allow it in Health Connect.' };
    setSetting('steps', true);
    await refreshSteps();
    return { ok: true, message: 'Steps connected' };
  } catch (e) {
    return { ok: false, message: (e && e.message) || 'Could not connect to Health Connect.' };
  }
}

export function stopSteps() {
  setSetting('steps', false);
}

let busy = false;

/** Read the last week's steps into stepLog. Quietly does nothing when off or when anything goes wrong. */
export async function refreshSteps() {
  const Health = nativePlugin('Health');
  if (!stepsOn() || !Health || busy) return false;
  busy = true;
  try {
    const today = todayStr();
    for (let i = DAYS_BACK - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      // one query per day, exactly from local midnight to midnight, so the day never shifts with time zones
      const { samples = [] } = await Health.queryAggregated({ dataType: 'steps', startDate: midnightIso(date), endDate: midnightIso(addDays(date, 1)), bucket: 'day', aggregation: 'sum' });
      const n = validSteps(samples.reduce((t, s) => t + (Number(s.value) || 0), 0));
      if (n !== null && (n > 0 || date === today)) setSteps(date, n);
    }
    return true;
  } catch {
    return false;
  } finally {
    busy = false;
  }
}

/** Steps for a date from the log, or null. */
export const stepsFor = (date) => {
  const v = (getState().stepLog || {})[date];
  return typeof v === 'number' ? v : null;
};

let listening = false;
/** Refresh on start and whenever the app comes back to the front. */
export function startSteps(onChange) {
  if (listening || !isNative()) return;
  listening = true;
  const run = async () => (await refreshSteps()) && onChange && onChange();
  run();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
}
