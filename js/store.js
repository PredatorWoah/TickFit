// store.js
// All app data lives in ONE localStorage key, as one JSON object. Nothing ever leaves the device.
//
// Shape:
//   {
//     version: 1,
//     activePlanId: "p_abc",
//     plans:    [ { id, name, startDate, days: [...] } ],
//     progress: { [planId]: { "2026-10-04": { ticks, weights, waterMl, notes } } },
//     bodyLog:  { "2026-10-04": 72.4 },   // body weight in kg, one per day
//     settings: { theme: "dark", lang: "en" }
//   }

import { todayStr } from './dates.js';
import { validWeight, cleanLog } from './weight.js';

const KEY = 'tickfit:v1';

let state = defaults();
let storageWorks = true;

function defaults() {
  return { version: 1, activePlanId: null, plans: [], progress: {}, bodyLog: {}, settings: { theme: 'dark', autoRest: true } };
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
  return (state.progress[planId] && state.progress[planId][date]) || { ticks: {}, weights: {}, sets: {}, waterMl: 0, notes: '' };
}

/** Change a day's record: update(planId, date, (rec) => { rec.ticks.w1 = true; }) */
export function updateRecord(planId, date, fn) {
  const plan = (state.progress[planId] ||= {});
  const rec = (plan[date] ||= { ticks: {}, weights: {}, sets: {}, waterMl: 0, notes: '' });
  rec.ticks ||= {};
  rec.weights ||= {};
  rec.sets ||= {};
  fn(rec);
  save();
  return rec;
}

// ----- editing plans -----

/** Call after you change a plan object in place (the editor does this). */
export function savePlans() {
  save();
}

/** Short unique id for a new exercise or meal, like "w_k3f9". Unique within the given list. */
export function newItemId(prefix, existing) {
  const used = new Set(existing.map((x) => x.id));
  let id;
  do id = `${prefix}_${Math.random().toString(36).slice(2, 6)}`;
  while (used.has(id));
  return id;
}

// ----- settings -----

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

// ----- backup -----

/** Everything the app knows, wrapped so we can recognise our own files later. */
export function exportBackup() {
  return { app: 'tickfit', backupVersion: 1, exportedAt: new Date().toISOString(), data: state };
}

/** Quick check that a parsed file is one of our backups (used before asking "replace everything?"). */
export function looksLikeBackup(obj) {
  return !!(obj && obj.app === 'tickfit' && obj.data && Array.isArray(obj.data.plans));
}

/**
 * Replace ALL data with a backup file's contents. Plans are re-checked with the same
 * validator as imports, so a hand edited or damaged file can't break the app.
 * Returns { ok: true } or { ok: false, error }.
 */
export function importBackup(obj, validatePlan) {
  if (!looksLikeBackup(obj)) {
    return { ok: false, error: 'That does not look like a TickFit backup file.' };
  }
  const plans = [];
  for (const p of obj.data.plans) {
    const check = validatePlan(p);
    if (!check.ok) return { ok: false, error: `The plan "${(p && p.name) || '?'}" in this backup is damaged: ${check.errors[0]}` };
    plans.push({ ...check.plan, id: String(p.id || uid()), startDate: typeof p.startDate === 'string' ? p.startDate : todayStr() });
  }
  const ids = new Set(plans.map((p) => p.id));
  const progress = {};
  for (const [planId, days] of Object.entries(obj.data.progress || {})) if (ids.has(planId) && days && typeof days === 'object') progress[planId] = days;

  state = {
    ...defaults(),
    plans,
    progress,
    bodyLog: cleanLog(obj.data.bodyLog),
    activePlanId: ids.has(obj.data.activePlanId) ? obj.data.activePlanId : plans[0] ? plans[0].id : null,
    settings: { ...defaults().settings, ...(obj.data.settings || {}) },
  };
  save();
  return { ok: true, plans: plans.length };
}

// ----- keeping data safe -----

let persistedResult = null; // true / false once we know, null if the browser can't say

/**
 * Ask the browser to treat our data as important so it isn't cleared when the phone is low on
 * space. Browsers may say no (Chrome decides by how much you use the site, Safari mostly by
 * whether it's installed to the Home Screen). Never throws.
 */
export async function protectStorage() {
  try {
    if (navigator.storage && navigator.storage.persisted) {
      persistedResult = await navigator.storage.persisted();
      if (!persistedResult && navigator.storage.persist) persistedResult = await navigator.storage.persist();
    }
  } catch {
    persistedResult = null;
  }
  return persistedResult;
}

export const isStoragePersisted = () => persistedResult;

/** Roughly how much space our data takes, in KB. */
export function dataSizeKb() {
  try {
    return Math.max(1, Math.round(((localStorage.getItem(KEY) || '').length * 2) / 1024));
  } catch {
    return 0;
  }
}

/** Remember that a backup was just made (a date, so we can say "12 days ago"). */
export function markBackedUp() {
  state.settings.lastBackup = todayStr();
  state.settings.backupSnoozeUntil = null;
  save();
}

export function snoozeBackupNudge(untilDate) {
  state.settings.backupSnoozeUntil = untilDate;
  save();
}

// ----- body weight log -----

/** Save (or with null, delete) the body weight for a date. Returns the saved number, or null if it was not a sane weight. */
export function setBodyWeight(date, value) {
  if (!state.bodyLog) state.bodyLog = {};
  if (value === null) {
    delete state.bodyLog[date];
    save();
    return null;
  }
  const kg = validWeight(value);
  if (kg === null) return null;
  state.bodyLog[date] = kg;
  save();
  return kg;
}
