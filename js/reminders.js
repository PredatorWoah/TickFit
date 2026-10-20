// reminders.js
// Android app only: phone notifications at the times you choose, made on the phone itself (nothing is sent
// anywhere). Three kinds, each off until you turn it on in More:
//   workout  "Time to train: Push day, 5 exercises" at your workout time, only on days with a workout
//   water    "Water break" every few hours between two times, on days that have a water target
//   meals    at each meal's own time from the plan ("8:00 AM Breakfast: Poha, Milk")
//
// The next 7 days are scheduled each time the app opens or comes back, so they follow plan changes and
// skip days that are done. Uses Capacitor's Local Notifications plugin (like the rest timer alert).

import { getState, getActivePlan, setSetting } from './store.js';
import { toStr, addDays, fromStr } from './dates.js';
import { dayFor } from './schedule.js';
import { isNative, nativePlugin } from './platform.js';

const FIRST_ID = 5000; // ids 5000 to 5999 belong to reminders (the rest alert uses 4201)
const LAST_ID = 5999;
const DAYS = 7;
const CHANNEL = 'tickfit-reminders';

export const DEFAULT_REMINDERS = { workout: { on: false, time: '18:00' }, water: { on: false, from: '09:00', to: '21:00', every: 2 }, meals: { on: false } };

export const remindersAvailable = () => isNative() && !!nativePlugin('LocalNotifications');

/** The reminder settings with defaults filled in. */
export function reminderSettings(settings = getState().settings) {
  const r = settings.reminders || {};
  return {
    workout: { ...DEFAULT_REMINDERS.workout, ...(r.workout || {}) },
    water: { ...DEFAULT_REMINDERS.water, ...(r.water || {}) },
    meals: { ...DEFAULT_REMINDERS.meals, ...(r.meals || {}) },
  };
}

/** Minutes after midnight from "8:00 AM", "8 am", "13:00", "1.30pm", "07:45". Null if it isn't a time. Pure. */
export function parseTime(text) {
  const m = String(text ?? '').trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let hr = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = m[3] ? m[3][0] : null;
  if (min > 59) return null;
  if (ap) {
    if (hr < 1 || hr > 12) return null;
    if (ap === 'p' && hr !== 12) hr += 12;
    if (ap === 'a' && hr === 12) hr = 0;
  } else if (!m[2] || hr > 23) return null; // a bare "8" is too vague
  return hr * 60 + min;
}

const at = (date, minutes) => {
  const d = fromStr(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
};

/**
 * Every reminder to schedule for the next `days` days from `now`, in time order. Pure.
 * @returns [{ id, at: Date, title, body }]
 */
export function reminderList(plan, records, settings, now = new Date(), days = DAYS) {
  if (!plan) return [];
  const r = reminderSettings(settings);
  const today = toStr(now);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const day = dayFor(plan, date);
    const rec = (records || {})[date] || {};
    const ticks = rec.ticks || {};
    const base = FIRST_ID + i * 100;
    let n = 0;
    const add = (when, title, body) => {
      if (when > now && n < 100) out.push({ id: base + n, at: when, title, body });
      n++;
    };

    if (r.workout.on && day.workout.length && !day.workout.every((w) => ticks[w.id])) {
      const t = parseTime(r.workout.time);
      const label = String(day.label || '').trim();
      if (t !== null) add(at(date, t), 'Time to train', `${label ? label + ': ' : ''}${day.workout.length} exercise${day.workout.length === 1 ? '' : 's'}`);
    }

    if (r.meals.on) {
      for (const m of day.meals) {
        const t = parseTime(m.time);
        if (t === null || ticks[m.id]) continue;
        add(at(date, t), m.name || 'Meal time', (m.items || []).join(', ').slice(0, 120) || 'Tick it off in TickFit');
      }
    }

    if (r.water.on && day.extras && day.extras.waterLiters) {
      const from = parseTime(r.water.from);
      const to = parseTime(r.water.to);
      const every = Math.max(1, Math.min(6, Number(r.water.every) || 2)) * 60;
      const reached = (rec.waterMl || 0) >= day.extras.waterLiters * 1000;
      if (from !== null && to !== null && to > from && !reached) {
        for (let t = from; t <= to; t += every) add(at(date, t), 'Water break', `Your target today is ${day.extras.waterLiters} L. Have a glass.`);
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Change one kind's settings: setReminder('water', { on: true }). */
export function setReminder(kind, patch) {
  const r = reminderSettings();
  r[kind] = { ...r[kind], ...patch };
  setSetting('reminders', r);
}

/** Ask for the notification permission (from a tap). True when allowed. */
export async function prepareReminders() {
  const LN = nativePlugin('LocalNotifications');
  if (!remindersAvailable()) return false;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LN.createChannel({ id: CHANNEL, name: 'Reminders', description: 'Workout, water and meal reminders you turned on', importance: 4, visibility: 1, vibration: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

let running = null;

/** Replace every scheduled reminder with the current list. Safe to call often. */
export function scheduleReminders() {
  if (!remindersAvailable()) return Promise.resolve(false);
  // one at a time, so two quick calls never leave doubles behind
  running = (running || Promise.resolve()).then(async () => {
    const LN = nativePlugin('LocalNotifications');
    try {
      const { notifications = [] } = await LN.getPending();
      const old = notifications.filter((x) => x.id >= FIRST_ID && x.id <= LAST_ID).map((x) => ({ id: x.id }));
      if (old.length) await LN.cancel({ notifications: old });
      const plan = getActivePlan();
      const list = plan ? reminderList(plan, getState().progress[plan.id], getState().settings) : [];
      if (!list.length) return true;
      const perm = await LN.checkPermissions();
      if (perm.display !== 'granted') return false;
      await LN.schedule({ notifications: list.map((x) => ({ id: x.id, title: x.title, body: x.body, channelId: CHANNEL, schedule: { at: x.at, allowWhileIdle: true }, autoCancel: true })) });
      return true;
    } catch {
      return false;
    }
  });
  return running;
}

let listening = false;
export function startReminders() {
  if (listening || !isNative()) return;
  listening = true;
  scheduleReminders();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && scheduleReminders());
}
