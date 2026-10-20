// gym.js
// The gym maths behind the Workout screen. All pure functions, so they are tested in tests/gym.mjs.
//
//   suggestNext   "go heavier" hints: progressive overload from what you did last time
//   platesPerSide what to load on each side of the bar
//   warmupSets    a short warm-up ramp before your working weight
//   bestBefore / isRecord / recordHistory   personal records, by estimated 1 rep max (e1RM)
//   supersetGroups  which exercises are done back to back

import { addDays } from './dates.js';
import { dayFor } from './schedule.js';
import { oneRepMax } from './lift.js';
import { repsTarget, plannedSets } from './stats.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const round = (x, step) => Math.round(x / step) * step;
const fix = (x) => Math.round(x * 100) / 100;

/** The lowest number in a reps text like "8 to 12" (the bottom of the range), or null. */
export function repsLow(text) {
  if (repsTarget(text) === null) return null; // timed work like "30 sec"
  const nums = String(text).match(/\d+/g);
  return nums ? Math.min(...nums.map(Number)) : null;
}

/** How much to add: small jumps for light weights, 2.5 kg from 10 kg up. */
export const stepFor = (kg) => (kg < 10 ? 1 : 2.5);

/**
 * What to lift today, from last time. Returns null when there is nothing to go on, else
 *   { kind: 'up', kg, text }    every planned set reached the top of the rep range: go a step heavier
 *   { kind: 'stay', kg, text }  some sets fell short of the bottom of the range: same weight, chase the reps
 *   { kind: 'same', kg, text }  in between: same weight, add a rep
 * @param w     the exercise (sets, reps)
 * @param last  lastPerformance(): { sets: [{ w, r }] }
 */
export function suggestNext(w, last) {
  if (!last || !last.sets || !last.sets.length) return null;
  const top = repsTarget(w.reps);
  const low = repsLow(w.reps);
  const weighted = last.sets.filter((s) => s.w > 0 && s.r > 0);
  if (!top || !weighted.length) return null;
  const kg = Math.max(...weighted.map((s) => s.w));
  const atTop = weighted.filter((s) => s.w >= kg);
  const enoughSets = atTop.length >= plannedSets(w);
  if (enoughSets && atTop.every((s) => s.r >= top)) {
    const next = fix(round(kg + stepFor(kg), stepFor(kg) === 1 ? 0.5 : 1.25));
    return { kind: 'up', kg: next, text: `You hit ${top} reps on every set last time. Try ${next} kg today.` };
  }
  if (low && atTop.some((s) => s.r < low)) return { kind: 'stay', kg, text: `Stay at ${kg} kg until every set reaches ${low} reps.` };
  return { kind: 'same', kg, text: `Same ${kg} kg, aim for one more rep than last time.` };
}

/**
 * Plates for each side of the bar, heaviest first. Returns { plates: [25, 10, 2.5], left } where `left` is
 * whatever the available plates cannot make (0 when it adds up exactly), or null if the weight is below the bar.
 */
export function platesPerSide(total, bar = 20, available = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  if (!(total >= bar)) return null;
  let side = fix((total - bar) / 2);
  const plates = [];
  for (const p of [...available].sort((a, b) => b - a)) {
    while (side + 1e-9 >= p) {
      plates.push(p);
      side = fix(side - p);
    }
  }
  return { plates, left: fix(side * 2) };
}

/**
 * A warm-up ramp for a working weight: about 50% x 8, 70% x 5, 85% x 3 (an empty bar first for heavy lifts),
 * rounded to 2.5 kg and never below the bar. Empty when the weight is too light to need one.
 */
export function warmupSets(workKg, bar = 20) {
  if (!(workKg >= bar + 10)) return [];
  const out = [];
  if (workKg >= 60) out.push({ w: bar, r: 10 });
  for (const [pct, r] of [[0.5, 8], [0.7, 5], [0.85, 3]]) {
    const w = Math.max(bar, round(workKg * pct, 2.5));
    if (w < workKg && !out.some((x) => x.w === w)) out.push({ w, r });
  }
  return out;
}

/**
 * Every logged set before `date`, grouped by exercise name: { name -> [{ date, w, r, e1rm }] }.
 * A screen update asks for this once per exercise; building it once and sharing it for the rest of that
 * update (it is dropped right after, so a new tick is never missed) keeps ticking a set quick on phones.
 */
let shared = null;
function historyIndex(plan, records, date, maxBack) {
  if (shared && shared.plan === plan && shared.records === records && shared.date === date && shared.maxBack === maxBack) return shared.index;
  const index = new Map();
  const from = addDays(date, -maxBack);
  // only the days that have a record (walking every calendar day was slow on phones)
  for (const d of Object.keys(records || {})) {
    if (d >= date || d < from || d < plan.startDate) continue;
    const rec = records[d];
    if (!rec || !rec.sets) continue;
    for (const ex of dayFor(plan, d).workout) {
      const done = (rec.sets[ex.id] || []).filter((s) => s && s.done && s.w > 0 && s.r > 0);
      if (!done.length) continue;
      const key = norm(ex.exercise);
      if (!index.has(key)) index.set(key, []);
      for (const s of done) index.get(key).push({ date: d, w: s.w, r: s.r, e1rm: oneRepMax(s.w, s.r) });
    }
  }
  shared = { plan, records, date, maxBack, index };
  queueMicrotask(() => (shared = null));
  return index;
}

/** Every logged set of an exercise before `date` (newest first is not needed). */
function setsBefore(plan, records, date, name, maxBack = 400) {
  return (historyIndex(plan, records, date, maxBack).get(norm(name)) || []).slice();
}

/** Your best set of this exercise before that day, by estimated 1 rep max. Null if you never logged it. */
export function bestBefore(plan, records, date, name) {
  const all = setsBefore(plan, records, date, name);
  return all.length ? all.reduce((a, b) => (b.e1rm > a.e1rm || (b.e1rm === a.e1rm && b.w > a.w) ? b : a)) : null;
}

/** Is this set a personal record compared with `best`? The first ever set is not called a record. */
export function isRecord(set, best) {
  if (!best || !(set.w > 0 && set.r > 0)) return false;
  return oneRepMax(set.w, set.r) > best.e1rm + 0.05;
}

/**
 * Personal records over time for every exercise: each time a session's best set beat everything before it.
 * Returns [{ date, exercise, w, r, e1rm, before }] newest first. The first session of an exercise is the
 * starting point, not a record.
 */
export function recordHistory(plan, records, today) {
  const best = new Map();
  const out = [];
  const days = Object.keys(records || {}).filter((d) => d >= plan.startDate && d <= today).sort();
  for (const d of days) {
    const rec = records[d];
    if (!rec || !rec.sets) continue;
    for (const ex of dayFor(plan, d).workout) {
      const key = norm(ex.exercise);
      let top = null;
      for (const s of rec.sets[ex.id] || []) {
        if (!(s && s.done && s.w > 0 && s.r > 0)) continue;
        const e = oneRepMax(s.w, s.r);
        if (!top || e > top.e1rm) top = { w: s.w, r: s.r, e1rm: e };
      }
      if (!top) continue;
      const prev = best.get(key);
      if (prev && top.e1rm > prev.e1rm + 0.05) out.push({ date: d, exercise: ex.exercise, ...top, before: prev.e1rm });
      if (!prev || top.e1rm > prev.e1rm) best.set(key, { e1rm: top.e1rm });
    }
  }
  return out.reverse();
}

/** The best e1RM per session for one exercise, oldest first: [{ date, e1rm, w, r }] (for its chart). */
export function e1rmSeries(plan, records, today, name) {
  const key = norm(name);
  const out = [];
  for (const d of Object.keys(records || {}).filter((x) => x >= plan.startDate && x <= today).sort()) {
    const rec = records[d];
    if (!rec || !rec.sets) continue;
    let top = null;
    for (const ex of dayFor(plan, d).workout) {
      if (norm(ex.exercise) !== key) continue;
      for (const s of rec.sets[ex.id] || []) {
        if (!(s && s.done && s.w > 0 && s.r > 0)) continue;
        const e = oneRepMax(s.w, s.r);
        if (!top || e > top.e1rm) top = { date: d, e1rm: e, w: s.w, r: s.r };
      }
    }
    if (top) out.push(top);
  }
  return out;
}

/**
 * Supersets: neighbouring exercises with the same "superset" letter. Returns, for each exercise index, its
 * group { letter, first, last, size } or null.
 */
export function supersetGroups(workout) {
  const out = workout.map(() => null);
  for (let i = 0; i < workout.length; ) {
    const L = workout[i].superset;
    let j = i;
    while (L && j + 1 < workout.length && workout[j + 1].superset === L) j++;
    if (L && j > i) for (let k = i; k <= j; k++) out[k] = { letter: L, first: i, last: j, size: j - i + 1 };
    i = j + 1;
  }
  return out;
}
