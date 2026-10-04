// stats.js
// Pure functions that count what is done in a day. No DOM, easy to test.
//
// A progress "record" for one date looks like:
//   { ticks: { w1: true, m2: true, s1: true }, weights: { w1: 20 }, waterMl: 1500, notes: "..." }

import { addDays } from './dates.js';
import { dayFor } from './schedule.js';

export const WATER_STEP_ML = 250;

/** Everything that can be ticked in a day: [{id, kind}] */
export function dayItems(day) {
  const items = [];
  day.workout.forEach((w) => items.push({ id: w.id, kind: 'workout' }));
  day.meals.forEach((m) => items.push({ id: m.id, kind: 'meal' }));
  day.extras.supplements.forEach((_, i) => items.push({ id: `s${i + 1}`, kind: 'supp' }));
  if (day.extras.waterLiters) items.push({ id: 'water', kind: 'water' });
  return items;
}

/** Is one item done? Water counts as done once the target is reached. */
export function isDone(day, record, item) {
  if (item.kind === 'water') {
    return (record.waterMl || 0) >= day.extras.waterLiters * 1000;
  }
  return !!(record.ticks && record.ticks[item.id]);
}

/** { done, total, pct } for a day. A day with nothing to do is 0 of 0. */
export function dayStats(day, record) {
  const items = dayItems(day);
  const done = items.filter((it) => isDone(day, record || {}, it)).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

/** Calories and protein: planned total and eaten (ticked meals). Null when the plan has none. */
export function mealTotals(day, record) {
  const sum = (key, onlyEaten) => {
    let any = false;
    let total = 0;
    for (const m of day.meals) {
      if (typeof m[key] !== 'number') continue;
      if (onlyEaten && !(record.ticks && record.ticks[m.id])) {
        any = true;
        continue;
      }
      any = true;
      total += m[key];
    }
    return any ? total : null;
  };
  return {
    calories: sum('calories', false),
    caloriesEaten: sum('calories', true),
    protein: sum('protein', false),
    proteinEaten: sum('protein', true),
  };
}

// ----- streaks and weekly numbers -----
// "records" below is progress[planId]: { "YYYY-MM-DD": record }

/** A day counts toward your streak when at least this much of it is done. Change to taste. */
export const STREAK_MIN_PCT = 50;

/**
 * Completion % of one calendar date for a plan, or null when that day has nothing to tick
 * (like the Sunday of a Monday to Saturday plan). Null days are skipped by the numbers below,
 * so a rest day never breaks your streak or drags down your week.
 */
export function pctFor(plan, records, date) {
  const stats = dayStats(dayFor(plan, date), (records || {})[date]);
  return stats.total === 0 ? null : stats.pct;
}

/**
 * Current streak: consecutive days (ending today) that reached STREAK_MIN_PCT.
 * Today being unfinished doesn't break the streak, it simply isn't counted yet.
 */
export function currentStreak(plan, records, today) {
  let n = 0;
  for (let d = today; d >= plan.startDate; d = addDays(d, -1)) {
    const pct = pctFor(plan, records, d);
    if (pct === null) continue; // nothing to tick: neither helps nor hurts
    if (pct >= STREAK_MIN_PCT) n++;
    else if (d !== today) break; // a missed past day ends it
  }
  return n;
}

/** Longest run of qualifying days from the plan's start until today. */
export function longestStreak(plan, records, today) {
  let best = 0;
  let run = 0;
  for (let d = plan.startDate; d <= today; d = addDays(d, 1)) {
    const pct = pctFor(plan, records, d);
    if (pct === null) continue;
    run = pct >= STREAK_MIN_PCT ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Average completion % over the last 7 days (only days since the plan started). Null if none yet. */
export function weekPercent(plan, records, today) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    if (d < plan.startDate) break;
    const pct = pctFor(plan, records, d);
    if (pct === null) continue;
    sum += pct;
    count++;
  }
  return count ? Math.round(sum / count) : null;
}

// ----- exercises: targets, set progress, "last time" -----

/** A number from a weight like "20 kg" or 20. "bodyweight" gives null. */
export function weightNumber(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  const m = String(v ?? '').replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * The rep number to pre-fill from a reps target: "12" -> 12, "8 to 10" -> 10 (the upper end).
 * Timed holds like "30 sec" or "1 min" give null, because those are not rep counts.
 */
export function repsTarget(text) {
  const t = String(text ?? '').toLowerCase();
  if (!t || /\b(s|sec|secs|second|seconds|min|mins|minute|minutes)\b|\d\s*s\b/.test(t)) return null;
  const nums = t.match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** How many sets this exercise has: what the plan says, at least 1. */
export const plannedSets = (w) => Math.max(1, Math.round(w.sets || 1));

/** { done, total } sets for one exercise on one day. Old records that only have a tick count as all done. */
export function exerciseProgress(w, record) {
  const sets = record && record.sets && record.sets[w.id];
  if (sets && sets.length) return { done: sets.filter((s) => s.done).length, total: sets.length };
  const total = plannedSets(w);
  return { done: record && record.ticks && record.ticks[w.id] ? total : 0, total };
}

/**
 * What you did the last time you did this exercise (matched by name, so it works across
 * different days of the plan). Looks back up to `maxBack` days before `date`.
 * Returns { date, sets: [{ w, r }] } or null.
 */
export function lastPerformance(plan, records, date, exerciseName, maxBack = 120) {
  const key = norm(exerciseName);
  for (let i = 1; i <= maxBack; i++) {
    const d = addDays(date, -i);
    if (d < plan.startDate) break;
    const rec = records && records[d];
    if (!rec) continue;
    for (const ex of dayFor(plan, d).workout) {
      if (norm(ex.exercise) !== key) continue;
      const done = ((rec.sets && rec.sets[ex.id]) || []).filter((s) => s.done && (s.w != null || s.r != null));
      if (done.length) return { date: d, sets: done.map((s) => ({ w: s.w ?? null, r: s.r ?? null })) };
      // Older records stored one weight for the whole exercise.
      if (rec.weights && rec.weights[ex.id] != null && rec.ticks && rec.ticks[ex.id]) return { date: d, sets: [{ w: rec.weights[ex.id], r: null }] };
    }
  }
  return null;
}

/** "20 × 12, 20 × 12, 20 × 10" (kg is implied). Repeats are folded: "3 sets of 20 × 12". */
export function formatSets(sets) {
  const one = (s) => (s.w != null && s.r != null ? `${s.w} × ${s.r}` : s.w != null ? `${s.w} kg` : s.r != null ? `${s.r} reps` : '');
  const parts = sets.map(one).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p === parts[0])) return `${parts.length} sets of ${parts[0]}`;
  return parts.join(', ');
}
