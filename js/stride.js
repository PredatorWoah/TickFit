// stride.js
// Workouts from Stride (a companion planner app). Stride exports a day or a week as
//
//   { "app": "tickfit", "format": "stride-workout", "version": 1, "scope": "day" | "week",
//     "plan": { "name": "...", "startDate": "2026-11-13",
//               "days": [ { "date": "2026-11-13", "label": "Upper body", "workout": [ ... ], "meals": [] } ] } }
//
// TickFit does not make a new plan from it. It replaces the exercises on those dates in the plan you use, through
// the same per-date lists as "Choose exercises" (plan.picks), so your meals, your other days, your exercise
// versions and everything you logged stay as they are. A Stride rest day clears that date's exercises.
// Dates that already have logged sets or ticked exercises, and dates before today, never get other exercises.
// A replaced date also takes Stride's name for the day ("Chest + Shoulders"), kept with its exercises in plan.picks.
//
// Pure functions, no DOM: node tests/stride.mjs

import { parsePlanText, slug } from './parser.js';
import { savePick } from './library.js';
import { dayFor } from './schedule.js';
import { muscleGroup } from './lift.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A Stride day name, short enough for a heading: "Chest · Upper + Chest · Middle + Triceps" -> "Chest + Triceps".
 */
export function shortLabel(label) {
  const parts = String(label || '')
    .split(/\s*\+\s*/)
    .map((x) => x.split('·')[0].trim())
    .filter(Boolean);
  return [...new Set(parts)].join(' + ').slice(0, 80) || 'Workout';
}

/** Is this parsed JSON a Stride export? */
export const isStrideExport = (obj) => !!obj && typeof obj === 'object' && obj.format === 'stride-workout' && !!obj.plan && Array.isArray(obj.plan.days);

/**
 * Read a Stride export from text. Returns null when the text is not one, otherwise
 * { scope, name, days: [{ date, label, workout }], errors } with every exercise checked like any plan's.
 */
export function readStride(text) {
  let obj;
  try {
    obj = JSON.parse(String(text || '').replace(/^﻿/, '').trim());
  } catch {
    return null;
  }
  if (!isStrideExport(obj)) return null;
  const errors = [];
  if (obj.version !== 1) errors.push(`This Stride file is version ${obj.version}. TickFit reads version 1. Update TickFit, then try again.`);
  const raw = obj.plan.days.filter((d) => d && DATE.test(String(d.date || '')));
  if (raw.length < obj.plan.days.length) errors.push('Some days in the Stride file have no date, so they were left out.');
  if (raw.length > MAX_DAYS) errors.push(`The Stride file has ${raw.length} days. TickFit takes up to ${MAX_DAYS} at a time.`);
  const kept = raw.slice(0, MAX_DAYS);
  // the normal plan check cleans every exercise (names, sets, reps, rest, links) the same way as any import
  const checked = parsePlanText(JSON.stringify({ name: 'Stride', days: kept.map((d) => ({ label: String(d.label || 'Workout'), workout: Array.isArray(d.workout) ? d.workout : [], meals: [] })) }));
  if (!checked.ok) return { scope: obj.scope, name: obj.plan.name, days: [], errors: [...errors, ...checked.errors] };
  const days = kept.map((d, i) => ({ date: d.date, label: shortLabel(d.label), workout: checked.plan.days[i].workout }));
  const dates = new Set();
  for (const d of days) {
    if (dates.has(d.date)) errors.push(`${d.date} is in the Stride file twice. The last one is used.`);
    dates.add(d.date);
  }
  return { scope: obj.scope === 'day' ? 'day' : 'week', name: String(obj.plan.name || 'Stride'), days, errors };
}

/** Did anything get logged on this date? (a ticked exercise or a done set) */
function started(rec, workout) {
  if (!rec) return false;
  if (rec.sets && Object.values(rec.sets).some((l) => Array.isArray(l) && l.some((s) => s && s.done))) return true;
  return !!rec.ticks && workout.some((w) => rec.ticks[w.id]);
}

/**
 * What importing would do, date by date, without changing anything:
 * [{ date, label, workout, now: [names], action: 'replace' | 'clear' | 'same' | 'logged' | 'past' | 'before-start' }]
 */
export function previewStride(plan, records, stride, today) {
  const last = new Map(stride.days.map((d) => [d.date, d])); // a date given twice: the last one wins
  return [...last.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const shown = dayFor(plan, d.date);
      const current = shown.workout;
      const now = current.map((w) => w.exercise);
      const base = { date: d.date, label: d.label, workout: d.workout, now };
      if (d.date < today) return { ...base, action: 'past' };
      if (d.date < plan.startDate) return { ...base, action: 'before-start' };
      const same = current.length === d.workout.length && current.every((w, i) => norm(w.exercise) === norm(d.workout[i].exercise) && w.sets === d.workout[i].sets && w.reps === d.workout[i].reps);
      // the same exercises under another name (imported before days took Stride's name): only the name changes,
      // which is safe even on a day with logged sets
      if (same) return { ...base, action: shown.label === d.label ? 'same' : 'rename' };
      if (started((records || {})[d.date], current)) return { ...base, action: 'logged' };
      return { ...base, action: d.workout.length ? 'replace' : 'clear' };
    });
}

const prescription = (w) => JSON.stringify([norm(w.exercise), w.sets, w.reps, w.rest || '', w.notes || '']);

/**
 * The library id for a Stride exercise: an exercise already in the library with the same name and the same sets,
 * reps, rest and notes is reused (so a week imported twice adds nothing); anything else gets its own entry, so
 * dates already planned with an older version keep exactly what they had.
 */
function libraryId(plan, w) {
  plan.library ||= { exercises: [], meals: [] };
  plan.library.exercises ||= [];
  plan.library.meals ||= [];
  const list = plan.library.exercises;
  const same = list.find((x) => prescription(x) === prescription(w));
  if (same) return same.id;
  const used = new Set([...list, ...plan.library.meals].map((x) => x.id));
  const base = `lx-${slug(w.exercise)}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  const { id: _old, ...rest } = w;
  list.push({ ...rest, id, category: muscleGroup(w.exercise), from: 'stride' });
  return id;
}

/**
 * Replace the exercises on every date the preview marks 'replace' or 'clear', and rename the 'rename' ones. Changes `plan` in place.
 * Returns { changed: [dates], kept: [{ date, action }] }.
 */
export function applyStride(plan, records, stride, today) {
  const changed = [];
  const kept = [];
  for (const row of previewStride(plan, records, stride, today)) {
    if (row.action === 'rename') {
      plan.picks ||= {};
      const pick = { ...(plan.picks[row.date] || {}) };
      pick.workout ||= dayFor(plan, row.date).workout.map((w) => w.base || w.id); // keep exactly the exercises it has
      pick.label = row.label;
      plan.picks[row.date] = pick;
      changed.push(row.date);
      continue;
    }
    if (row.action !== 'replace' && row.action !== 'clear') {
      kept.push({ date: row.date, action: row.action });
      continue;
    }
    // an empty list is stored as an empty pick, so a Stride rest day really clears the date
    savePick(plan, row.date, 'workout', row.workout.map((w) => ({ id: libraryId(plan, w), item: w, source: 'library' })));
    // the date takes Stride's name too, so "Friday Back + Triceps" becomes "Chest + Shoulders" on that day only
    if (plan.picks && plan.picks[row.date] && Array.isArray(plan.picks[row.date].workout)) plan.picks[row.date].label = row.label;
    changed.push(row.date);
  }
  return { changed, kept };
}

/** What a preview row will do, in words, for the import screen. */
export function describeRow(row) {
  const n = row.workout.length;
  const was = row.now.length ? `${row.now.length} exercise${row.now.length === 1 ? '' : 's'} now` : 'nothing planned now';
  switch (row.action) {
    case 'replace':
      return `${row.label}: ${n} exercise${n === 1 ? '' : 's'} (replaces ${was})`;
    case 'clear':
      return `${row.label}: no exercises (${row.now.length ? `removes the ${was.replace(' now', '')}` : 'already empty'})`;
    case 'same':
      return `${row.label}: already the same, nothing to change`;
    case 'rename':
      return `${row.label}: same exercises, the day takes this name`;
    case 'logged':
      return `${row.label}: kept as it is, you already logged sets that day`;
    case 'past':
      return `${row.label}: kept as it is, that day has passed`;
    default:
      return `${row.label}: kept as it is, it is before your plan starts`;
  }
}

/** A Stride file as a plan of its own (used when there is no plan to put it in, or when asked). */
export function strideAsPlan(stride) {
  return {
    name: stride.name || 'Stride',
    startDate: stride.days.length ? stride.days[0].date : undefined,
    days: stride.days.map((d) => ({ label: d.label, workout: d.workout, meals: [] })),
  };
}

/**
 * Put a one-day Stride file on another date (the Workout screen's "From Stride" for the day you are looking at).
 * A week file is left as it is. Returns a new stride object; `from` says which date Stride had made it for.
 */
export function retargetStride(stride, date) {
  if (!stride || stride.days.length !== 1 || !DATE.test(String(date || '')) || stride.days[0].date === date) return stride;
  return { ...stride, days: [{ ...stride.days[0], date, from: stride.days[0].date }] };
}

/** Only the given dates of a Stride file (the tick boxes on the import screen). */
export const onlyDates = (stride, dates) => ({ ...stride, days: stride.days.filter((d) => dates.includes(d.date)) });
