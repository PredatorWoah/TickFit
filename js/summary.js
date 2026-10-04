// summary.js
// Weekly and monthly summaries. Pure functions (no DOM), so they are easy to test.
//
// IMPORTANT: calories burnt are an ESTIMATE. Without a heart-rate watch nobody can know the real
// number. We use the standard "MET" method:  kcal = MET x body weight (kg) x hours.
// Lifting weights is about 5 MET. Real burn can be 30% either way, so the app says "about".

import { addDays, fromStr, toStr } from './dates.js';
import { dayFor } from './schedule.js';
import { workoutSummary, sessionState, sessionMs } from './logging.js';
import { dayStats, mealTotals, weightNumber } from './stats.js';

export const LIFTING_MET = 5;
export const DEFAULT_BODY_KG = 70;
const MIN_PER_SET = 2.5; // set + rest, used when there is no stopwatch time
const MAX_SESSION_MIN = 240; // a clock left running all day is not a 20 hour workout

/** The Monday-to-Sunday week or calendar month around `anchor`, plus the one before it. */
export function periodRange(kind, anchor) {
  const d = fromStr(anchor);
  let start;
  let end;
  if (kind === 'month') {
    start = toStr(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    end = toStr(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  } else {
    start = addDays(anchor, -((d.getDay() + 6) % 7)); // back to Monday
    end = addDays(start, 6);
  }
  const prevEnd = addDays(start, -1);
  const prevStart = kind === 'month' ? toStr(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)) : addDays(start, -7);
  return { kind, start, end, prevStart, prevEnd };
}

/** Move the anchor one period back (-1) or forward (+1). */
export function shiftAnchor(kind, anchor, delta) {
  const d = fromStr(anchor);
  return kind === 'month' ? toStr(new Date(d.getFullYear(), d.getMonth() + delta, 1, 12)) : addDays(anchor, 7 * delta);
}

/** Minutes of training on one day: the stopwatch if you finished a session, else about 2.5 per set. */
export function workoutMinutes(record, setsDone) {
  if (!setsDone) return 0;
  if (sessionState(record) === 'finished') {
    const m = Math.round(sessionMs(record) / 60000);
    if (m >= 1) return Math.min(m, MAX_SESSION_MIN);
  }
  return Math.round(setsDone * MIN_PER_SET);
}

/** Estimated calories for a workout of `minutes` at the given body weight. */
export const kcalBurnt = (minutes, bodyKg) => Math.round(LIFTING_MET * (bodyKg || DEFAULT_BODY_KG) * (minutes / 60));

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The heaviest finished set per exercise name in [from, to]: Map name -> { name, w, r }. Heaviest weight wins, then most reps. */
export function bestLifts(plan, records, from, to) {
  const best = new Map();
  for (const date of Object.keys(records || {})) {
    if (date < from || date > to) continue;
    const rec = records[date];
    for (const ex of dayFor(plan, date).workout) {
      for (const s of (rec.sets && rec.sets[ex.id]) || []) {
        const w = weightNumber(s.w);
        if (!s.done || w === null || w <= 0) continue;
        const key = norm(ex.exercise);
        const cur = best.get(key);
        if (!cur || w > cur.w || (w === cur.w && (s.r || 0) > (cur.r || 0))) best.set(key, { name: ex.exercise, w, r: s.r ?? null });
      }
    }
  }
  return best;
}

/** Totals for one stretch of days. */
function totals(plan, records, from, to, bodyKg, today) {
  const t = { days: [], workouts: 0, minutes: 0, sets: 0, volumeKg: 0, kcal: 0, loggedDays: 0, pctSum: 0, pctDays: 0, eatenKcal: 0, eatenDays: 0, protein: 0, waterMl: 0, waterDays: 0 };
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const rec = (records && records[date]) || null;
    const day = { date, minutes: 0, kcal: 0 };
    t.days.push(day);
    if (!rec || date > today || date < plan.startDate) continue;
    const d = dayFor(plan, date);
    const ws = workoutSummary(d, rec);
    const stats = dayStats(d, rec);
    if (stats.done > 0 || rec.waterMl || ws.setsDone) t.loggedDays++;
    if (stats.total) {
      t.pctSum += stats.pct;
      t.pctDays++;
    }
    if (ws.setsDone) {
      day.minutes = workoutMinutes(rec, ws.setsDone);
      day.kcal = kcalBurnt(day.minutes, bodyKg);
      t.workouts++;
      t.sets += ws.setsDone;
      t.volumeKg += ws.volumeKg;
      t.minutes += day.minutes;
      t.kcal += day.kcal;
    }
    const meals = mealTotals(d, rec);
    if (meals.caloriesEaten) {
      t.eatenKcal += meals.caloriesEaten;
      t.eatenDays++;
      t.protein += meals.proteinEaten || 0;
    }
    if (rec.waterMl) {
      t.waterMl += rec.waterMl;
      t.waterDays++;
    }
  }
  return t;
}

/** Change from `before` to `now` as a whole percent, or null when there is nothing to compare. */
const change = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * Everything the Progress summary shows for one week or month.
 * Returns totals, per-day bars, "vs last period" changes and strength gains per exercise.
 */
export function summarize(plan, records, range, bodyKg, today) {
  const cur = totals(plan, records, range.start, range.end, bodyKg, today);
  const prev = totals(plan, records, range.prevStart, range.prevEnd, bodyKg, today);

  // Strength: heaviest set this period against the heaviest ever before it.
  const now = bestLifts(plan, records, range.start, range.end);
  const before = bestLifts(plan, records, '0000-01-01', range.prevEnd);
  const lifts = [...now.entries()].map(([key, n]) => {
    const b = before.get(key);
    return { name: n.name, now: n.w, reps: n.r, before: b ? b.w : null, gain: b ? n.w - b.w : null };
  });
  // Biggest gains first, then new exercises, then the ones that held steady.
  lifts.sort((a, b) => (b.gain ?? 0.001) - (a.gain ?? 0.001));

  return {
    ...cur,
    avgPct: cur.pctDays ? Math.round(cur.pctSum / cur.pctDays) : null,
    avgEaten: cur.eatenDays ? Math.round(cur.eatenKcal / cur.eatenDays) : null,
    avgProtein: cur.eatenDays ? Math.round(cur.protein / cur.eatenDays) : null,
    avgWaterL: cur.waterDays ? Math.round((cur.waterMl / cur.waterDays / 1000) * 10) / 10 : null,
    vs: {
      kcal: change(cur.kcal, prev.kcal),
      minutes: change(cur.minutes, prev.minutes),
      volumeKg: change(cur.volumeKg, prev.volumeKg),
      workouts: change(cur.workouts, prev.workouts),
    },
    hasPrev: prev.workouts > 0,
    lifts,
    prs: lifts.filter((l) => l.gain !== null && l.gain > 0).length,
  };
}
