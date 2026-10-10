// merge.js
// Bring the progress of one plan into another, so switching plans never leaves your history behind.
// Pure functions (no DOM), easy to test.
//
// Progress is saved per plan, and a day's ticks point at that plan's own exercises and meals ("w1", "m2").
// Copying them across as they are would tick the wrong things in the new plan. So each copied day keeps
// exactly the exercises and meals it had in the old plan: they become that date's picks in the new plan
// (library.js), and every tick and logged set is moved to the matching item. The new plan's own days and
// everything already logged in it stay as they are.

import { addDays, diffDays } from './dates.js';
import { dayFor, plannedDay, weeklyWeekdays } from './schedule.js';
import { pickItems } from './library.js';

/** Did anything happen on this day? (A tick, a done set, water, a note, a workout clock or typed numbers.) */
export function hasProgress(rec) {
  if (!rec) return false;
  if (rec.ticks && Object.values(rec.ticks).some(Boolean)) return true;
  if (rec.sets && Object.values(rec.sets).some((list) => (list || []).some((s) => s && s.done))) return true;
  return !!(rec.waterMl > 0 || (rec.notes && String(rec.notes).trim()) || rec.session || rec.manual);
}

/** How many days of a plan's records have progress. */
export const loggedDays = (records) => Object.values(records || {}).filter(hasProgress).length;

/** Copy an object keyed by item id, renaming the keys with `map` and dropping the ones it doesn't know. */
function remap(obj, map) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (map[k]) out[map[k]] = v;
  return out;
}

/**
 * Copy every day with progress from `from` into `to`. Days that already have progress in `to` are left alone,
 * so running it twice changes nothing. `from` and its records are not touched.
 * Changes `to` (picks, library, maybe an earlier start date) and `toRecords` in place.
 * Returns { copied, skipped, earliest }.
 */
export function mergeProgress(from, fromRecords, to, toRecords) {
  let copied = 0;
  let skipped = 0;
  let earliest = null;
  for (const date of Object.keys(fromRecords || {}).sort()) {
    const rec = fromRecords[date];
    if (!hasProgress(rec)) continue;
    if (hasProgress(toRecords[date])) {
      skipped++;
      continue;
    }
    const oldDay = dayFor(from, date);
    const map = {};
    for (const kind of ['workout', 'meals']) {
      const ids = pickItems(to, date, kind, oldDay[kind]);
      oldDay[kind].forEach((it, i) => (map[it.id] = ids[i]));
    }
    // Supplements are ticked by position ("s1"): keep a tick only where the new plan lists the same thing.
    const newSupps = plannedDay(to, date).extras.supplements;
    oldDay.extras.supplements.forEach((name, i) => {
      if (newSupps[i] === name) map[`s${i + 1}`] = `s${i + 1}`;
    });
    const copy = JSON.parse(JSON.stringify(rec));
    copy.ticks = remap(copy.ticks, map);
    copy.sets = remap(copy.sets, map);
    copy.weights = remap(copy.weights, map);
    toRecords[date] = copy;
    copied++;
    if (!earliest || date < earliest) earliest = date;
  }

  // Days before a plan's start date are ignored everywhere (streaks, summaries, the calendar), so start earlier.
  // A cycle plan moves back by whole cycles, so today is still the same plan day.
  if (earliest && earliest < to.startDate) {
    if (weeklyWeekdays(to)) to.startDate = earliest;
    else {
      const n = to.days.length;
      const cycles = Math.ceil(diffDays(earliest, to.startDate) / n);
      to.startDate = addDays(to.startDate, -cycles * n);
    }
  }
  return { copied, skipped, earliest };
}
