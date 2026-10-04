// logging.js
// How set by set logging changes a day's record. Pure functions, no DOM, so they are easy to test.
//
// A record's "sets" looks like:   sets: { w1: [ { w: 20, r: 12, done: true }, { w: 20, r: 12, done: false } ] }
// The exercise counts as done (record.ticks[id]) exactly when every set is done.
// Old records that only have a tick and one weight keep working: see rowsFor().

import { weightNumber, repsTarget, plannedSets } from './stats.js';

/**
 * The rows to show for an exercise: your saved sets if you have any, otherwise sensible
 * starting values (what you did last time, else the plan's target).
 * `last` is the result of lastPerformance(), or null.
 */
export function rowsFor(record, w, last) {
  const saved = record.sets && record.sets[w.id];
  if (saved && saved.length) return saved.map((s) => ({ w: s.w ?? null, r: s.r ?? null, done: !!s.done }));

  const legacyWeight = record.weights && record.weights[w.id] != null ? record.weights[w.id] : null;
  const wasTicked = !!(record.ticks && record.ticks[w.id]); // an old style tick counts as all sets done
  const n = Math.max(plannedSets(w), last ? last.sets.length : 0);
  const targetW = weightNumber(w.weight);
  const targetR = repsTarget(w.reps);

  const rows = [];
  for (let i = 0; i < n; i++) {
    const prev = last ? last.sets[Math.min(i, last.sets.length - 1)] : null;
    rows.push({
      w: legacyWeight ?? (prev && prev.w != null ? prev.w : targetW),
      r: prev && prev.r != null ? prev.r : targetR,
      done: wasTicked,
    });
  }
  return rows;
}

/** Save rows into the record and set or clear the exercise tick to match. */
export function saveRows(record, w, rows) {
  record.sets ||= {};
  record.ticks ||= {};
  record.sets[w.id] = rows.map((s) => ({ w: s.w ?? null, r: s.r ?? null, done: !!s.done }));
  if (rows.length && rows.every((s) => s.done)) record.ticks[w.id] = true;
  else delete record.ticks[w.id];
}

/** The quick tick on the exercise row: mark every set done, or if already done, undo them all. */
export function toggleExercise(record, w, last) {
  const rows = rowsFor(record, w, last);
  const allDone = rows.length > 0 && rows.every((s) => s.done);
  saveRows(record, w, rows.map((s) => ({ ...s, done: !allDone })));
}
