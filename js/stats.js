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
