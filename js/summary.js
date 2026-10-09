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
import { periodChange } from './weight.js';
import { exerciseBurn, hasManual, LIFTING_MET, DEFAULT_BODY_KG } from './burn.js';
import { muscleGroup, oneRepMax } from './lift.js';

export { LIFTING_MET, DEFAULT_BODY_KG };
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

/**
 * Per exercise name in [from, to]: Map name -> { name, w, r, e1rm, sessions, sets, volume }.
 * w and r are the heaviest finished set (heaviest weight wins, then most reps). e1rm is the best
 * estimated one-rep max of any set, volume the kg x reps of every finished set.
 */
export function bestLifts(plan, records, from, to) {
  const best = new Map();
  for (const date of Object.keys(records || {})) {
    if (date < from || date > to) continue;
    const rec = records[date];
    for (const ex of dayFor(plan, date).workout) {
      const key = norm(ex.exercise);
      let counted = false;
      for (const s of (rec.sets && rec.sets[ex.id]) || []) {
        const w = weightNumber(s.w);
        if (!s.done || w === null || w <= 0) continue;
        const cur = best.get(key) || { name: ex.exercise, w: 0, r: null, e1rm: 0, sessions: 0, sets: 0, volume: 0 };
        if (w > cur.w || (w === cur.w && (s.r || 0) > (cur.r || 0))) Object.assign(cur, { w, r: s.r ?? null });
        cur.e1rm = Math.max(cur.e1rm, oneRepMax(w, s.r) || 0);
        cur.sets++;
        cur.volume += w * (s.r || 0);
        if (!counted) cur.sessions++;
        counted = true;
        best.set(key, cur);
      }
    }
  }
  return best;
}

/** Totals for one stretch of days. */
function totals(plan, records, from, to, bodyKg, today, factor = 1) {
  const t = { days: [], byExercise: new Map(), muscles: new Map(), cardioMinutes: 0, cardioKcal: 0, workouts: 0, minutes: 0, sets: 0, volumeKg: 0, kcal: 0, loggedDays: 0, pctSum: 0, pctDays: 0, eatenKcal: 0, eatenDays: 0, protein: 0, waterMl: 0, waterDays: 0 };
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
    if (ws.setsDone || hasManual(rec)) {
      const burn = exerciseBurn(d, rec, bodyKg, factor);
      day.minutes = burn.minutes || workoutMinutes(rec, ws.setsDone);
      day.kcal = burn.kcal || kcalBurnt(day.minutes, bodyKg);
      day.adjusted = burn.adjustedMinutes || burn.adjustedKcal;
      t.cardioMinutes += burn.cardioMinutes;
      t.cardioKcal += burn.cardioKcal;
      for (const i of burn.items) {
        const key = i.name.toLowerCase().trim();
        const cur = t.byExercise.get(key) || { name: i.name, kind: i.kind, kcal: 0, minutes: 0, sessions: 0 };
        cur.kcal += i.kcal;
        cur.minutes += i.minutes;
        cur.sessions++;
        t.byExercise.set(key, cur);
      }
      for (const ex of d.workout) {
        const done = (((rec.sets && rec.sets[ex.id]) || []).filter((x) => x.done).length) || (rec.ticks && rec.ticks[ex.id] ? 1 : 0);
        if (!done) continue;
        const g = ex.category || muscleGroup(ex.exercise);
        if (/^cardio$/i.test(g)) continue; // not a muscle
        t.muscles.set(g, (t.muscles.get(g) || 0) + done);
      }
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

/** Every kg x rep ever logged on this plan, up to today. */
export function allTimeVolume(plan, records, today) {
  let kg = 0;
  for (const [date, rec] of Object.entries(records || {})) {
    if (date > today || date < plan.startDate) continue;
    kg += workoutSummary(dayFor(plan, date), rec).volumeKg;
  }
  return kg;
}

/** Change from `before` to `now` as a whole percent, or null when there is nothing to compare. */
const change = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * Everything the Progress summary shows for one week or month.
 * Returns totals, per-day bars, "vs last period" changes and strength gains per exercise.
 */
export function summarize(plan, records, range, bodyKg, today, bodyLog = {}, factor = 1) {
  const cur = totals(plan, records, range.start, range.end, bodyKg, today, factor);
  const prev = totals(plan, records, range.prevStart, range.prevEnd, bodyKg, today, factor);

  // Strength: this period against everything before it.
  const now = bestLifts(plan, records, range.start, range.end);
  const before = bestLifts(plan, records, '0000-01-01', range.prevEnd);
  const prevPeriod = bestLifts(plan, records, range.prevStart, range.prevEnd);
  const lifts = [...now.entries()].map(([key, n]) => {
    const b = before.get(key);
    const p = prevPeriod.get(key);
    const gain = b ? Math.round((n.w - b.w) * 10) / 10 : null;
    return {
      name: n.name,
      now: n.w,
      reps: n.r,
      before: b ? b.w : null,
      beforeReps: b ? b.r : null,
      gain,
      // Same top weight but more reps also counts as progress.
      repGain: b && gain === 0 && n.r != null && b.r != null ? n.r - b.r : 0,
      e1rm: n.e1rm || null,
      e1rmGain: b && b.e1rm ? Math.round((n.e1rm - b.e1rm) * 10) / 10 : null,
      sessions: n.sessions,
      sets: n.sets,
      volume: Math.round(n.volume),
      volumeChange: p && p.volume ? change(n.volume, p.volume) : null,
      group: muscleGroup(n.name),
    };
  });
  const isPr = (l) => l.gain > 0 || (l.gain === 0 && l.repGain > 0);
  // New bests first (biggest first), then new exercises, then steady, then the ones that dipped.
  const rank = (l) => (isPr(l) ? 3 : l.gain === null ? 2 : l.gain === 0 ? 1 : 0);
  lifts.sort((a, b) => rank(b) - rank(a) || (b.gain ?? 0) - (a.gain ?? 0) || b.volume - a.volume);
  const kcalTotal = [...cur.byExercise.values()].reduce((t, e) => t + e.kcal, 0);

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
    topBurn: [...cur.byExercise.values()]
      .sort((a, b) => b.kcal - a.kcal)
      .map((e) => ({ ...e, minutes: Math.round(e.minutes), share: kcalTotal ? Math.round((e.kcal / kcalTotal) * 100) : 0, perMin: e.minutes ? Math.round((e.kcal / e.minutes) * 10) / 10 : 0 })),
    muscles: [...cur.muscles.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets),
    weight: periodChange(bodyLog, range.start, range.end < today ? range.end : today),
    hasPrev: prev.workouts > 0,
    lifts,
    prs: lifts.filter(isPr).length,
    allTimeKg: allTimeVolume(plan, records, today),
  };
}
