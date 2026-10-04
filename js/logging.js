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

// ---------------------------------------------------------------------------
// Workout sessions: Start workout, a running clock, Finish workout.
// A session is just { start, end } in milliseconds on the day's record. Logging sets works with or
// without one; the session only adds the clock and the summary.
// ---------------------------------------------------------------------------

import { exerciseProgress } from './stats.js';

export function startSession(record, now = Date.now()) {
  record.session = { start: now, end: null };
}

export function finishSession(record, now = Date.now()) {
  if (!record.session) record.session = { start: now, end: now };
  record.session.end = now;
}

/** Undo "Finish" so the clock keeps running (for when you tapped it too early). */
export function reopenSession(record) {
  if (record.session) record.session.end = null;
}

/** 'idle' (not started), 'active' (clock running) or 'finished'. */
export function sessionState(record) {
  const s = record && record.session;
  return !s ? 'idle' : s.end ? 'finished' : 'active';
}

/** How long the workout has run (or ran), in milliseconds. */
export function sessionMs(record, now = Date.now()) {
  const s = record && record.session;
  return s ? Math.max(0, (s.end || now) - s.start) : 0;
}

/** Totals for a day's workout: sets done, total sets, exercises done and total weight lifted (kg). */
export function workoutSummary(day, record) {
  let setsDone = 0;
  let setsTotal = 0;
  let exercisesDone = 0;
  let volumeKg = 0;
  for (const w of day.workout) {
    const p = exerciseProgress(w, record);
    setsDone += p.done;
    setsTotal += p.total;
    if (record.ticks && record.ticks[w.id]) exercisesDone++;
    for (const s of (record.sets && record.sets[w.id]) || []) if (s.done && s.w != null && s.r != null) volumeKg += s.w * s.r;
  }
  return { setsDone, setsTotal, exercisesDone, exercisesTotal: day.workout.length, volumeKg: Math.round(volumeKg) };
}

/** A rough length for the workout card: about 2.5 minutes a set including rest, to the nearest 5. */
export function estimateMinutes(day) {
  const sets = day.workout.reduce((t, w) => t + plannedSets(w), 0);
  return Math.max(10, Math.round((sets * 2.5) / 5) * 5);
}

/** The first exercise that isn't done yet (the one to open), or null when all are done. */
export function nextExercise(day, record) {
  return day.workout.find((w) => !(record.ticks && record.ticks[w.id])) || null;
}

/** 83 -> "1:23", 3725 -> "1:02:05" */
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
