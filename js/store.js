// store.js
// All app data lives in ONE localStorage key, as one JSON object. Nothing ever leaves the device.
//
// Shape:
//   {
//     version: 1,
//     activePlanId: "p_abc",
//     plans:    [ { id, name, startDate, days: [...] } ],
//     progress: { [planId]: { "2026-10-04": { ticks, weights, waterMl, notes } } },
//     settings: { theme: "dark", lang: "en" }
//   }

import { todayStr } from './dates.js';

const KEY = 'tickfit:v1';

let state = defaults();
let storageWorks = true;

function defaults() {
  return { version: 1, activePlanId: null, plans: [], progress: {}, settings: { theme: 'dark', lang: 'en' } };
}

/** Read everything from localStorage. Never throws; falls back to an empty state. */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...defaults(), ...parsed, settings: { ...defaults().settings, ...(parsed.settings || {}) } };
    }
  } catch (e) {
    // Corrupted data or storage blocked. Keep a copy of the bad data so nothing is lost silently.
    try {
      const bad = localStorage.getItem(KEY);
      if (bad) localStorage.setItem(KEY + ':corrupt', bad);
    } catch {
      storageWorks = false;
    }
    state = defaults();
  }
  return state;
}

/** Write everything. If storage is blocked (private mode, full), the app keeps working in memory. */
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
}

export const isPersistent = () => storageWorks;
export const getState = () => state;

const uid = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ----- plans -----

export function getActivePlan() {
  return state.plans.find((p) => p.id === state.activePlanId) || state.plans[0] || null;
}

/** Add a validated plan (from parser.js) and make it active. Returns the stored plan. */
export function addPlan(plan, startDate) {
  const stored = { ...plan, id: uid(), startDate: startDate || plan.startDate || todayStr() };
  state.plans.push(stored);
  state.activePlanId = stored.id;
  save();
  return stored;
}

export function setActivePlan(id) {
  if (state.plans.some((p) => p.id === id)) {
    state.activePlanId = id;
    save();
  }
}

export function removePlan(id) {
  state.plans = state.plans.filter((p) => p.id !== id);
  delete state.progress[id];
  if (state.activePlanId === id) state.activePlanId = state.plans[0] ? state.plans[0].id : null;
  save();
}

export function setStartDate(id, startDate) {
  const p = state.plans.find((x) => x.id === id);
  if (p) {
    p.startDate = startDate;
    save();
  }
}

// ----- progress -----

/** Read a day's record. Returns an empty (unsaved) record if there is none. */
export function getRecord(planId, date) {
  return (state.progress[planId] && state.progress[planId][date]) || { ticks: {}, weights: {}, waterMl: 0, notes: '' };
}

/** Change a day's record: update(planId, date, (rec) => { rec.ticks.w1 = true; }) */
export function updateRecord(planId, date, fn) {
  const plan = (state.progress[planId] ||= {});
  const rec = (plan[date] ||= { ticks: {}, weights: {}, waterMl: 0, notes: '' });
  rec.ticks ||= {};
  rec.weights ||= {};
  fn(rec);
  save();
  return rec;
}
