// widgetdata.js
// What the Android home screen widgets show, worked out here in JavaScript so the native widget code
// only has to place ready-made text and numbers. Pure functions (no DOM), easy to test.
//
// The app sends this snapshot to the widgets every time something changes (see widgets.js). The widgets
// can't run JavaScript, so everything they need is in here, already formatted.

import { addDays, fromStr } from './dates.js';
import { dayFor } from './schedule.js';
import { dayStats, mealTotals, currentStreak, pctFor, lastPerformance, plannedSets, STREAK_MIN_PCT } from './stats.js';
import { workoutSummary, sessionState, workoutMs, estimateMinutes, nextExercise } from './logging.js';
import { liftFact } from './lift.js';

export const SNAPSHOT_VERSION = 1;
const LOCALE = 'en';
const fmt = (n) => Math.round(n).toLocaleString(LOCALE);
const pctOf = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);

/** 1500 -> "1.5", 1750 -> "1.75", 3000 -> "3" */
export const litres = (ml) => String(Math.round((ml || 0) / 10) / 100);

/** "Friday Back + Biceps" -> "Back + Biceps". A label that is only a weekday stays as it is. */
export function shortLabel(label) {
  const t = String(label || '').trim();
  const cut = t.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*[:\-–·,]?\s*/i, '').trim();
  return cut || t;
}

/** "Fri 10 Oct" */
const dateText = (date) => fromStr(date).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

/** "45 min" or "1 h 05 min" */
function minutesText(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** The workout part: what the Today, Next up and Ring widgets say about training. */
function workoutPart(plan, records, day, rec, today) {
  if (!day.workout.length) return { state: 'rest', title: 'Rest day', sub: 'Recovery is part of the plan', nextTop: 'Rest day', nextName: 'Nothing to lift today', nextDetail: 'A walk and good sleep are plenty', setsText: '' };
  const s = workoutSummary(day, rec);
  const state = sessionState(rec);
  const next = nextExercise(day, rec);
  const out = { state, setsText: `${s.setsDone} / ${s.setsTotal} sets`, startMs: rec.session && rec.session.start ? rec.session.start : null };
  if (!next) {
    const time = workoutMs(rec);
    return { ...out, state: 'finished', title: 'Workout done', sub: `${s.setsDone} of ${s.setsTotal} sets${time ? ' · ' + minutesText(time) : ''}`, nextTop: 'All exercises done', nextName: 'Workout done', nextDetail: `${s.exercisesTotal} exercises${s.volumeKg ? ` · ${fmt(s.volumeKg)} kg lifted` : ''}`, timeText: time ? minutesText(time) : '' };
  }
  const index = day.workout.indexOf(next) + 1;
  const last = lastPerformance(plan, records, today, next.exercise);
  const heaviest = last ? Math.max(...last.sets.map((x) => x.w || 0)) : 0;
  const detail = [next.reps ? `${plannedSets(next)} × ${next.reps}` : `${plannedSets(next)} sets`, heaviest > 0 ? `last time ${heaviest} kg` : next.weight || null].filter(Boolean).join(' · ');
  const started = state === 'active' || s.setsDone > 0;
  return {
    ...out,
    state: state === 'idle' && s.setsDone > 0 ? 'active' : state,
    title: started ? 'Continue workout' : 'Start workout',
    sub: started ? `${s.setsDone} of ${s.setsTotal} sets done` : `${day.workout.length} exercises · about ${estimateMinutes(day)} min`,
    nextTop: `Next up · exercise ${index} of ${day.workout.length}`,
    nextName: next.exercise,
    nextDetail: detail,
  };
}

/** Monday to Sunday of this week: [{ l: 'M', s: 'full' | 'part' | 'missed' | 'rest' | 'today' | 'future' }] */
function weekPart(plan, records, today) {
  const monday = addDays(today, -((fromStr(today).getDay() + 6) % 7));
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
    const date = addDays(monday, i);
    if (date > today || date < plan.startDate) return { l, s: 'future', today: false };
    const pct = pctFor(plan, records, date);
    let s = pct === null ? 'rest' : pct >= 100 ? 'full' : pct >= STREAK_MIN_PCT ? 'part' : 'missed';
    if (date === today && s !== 'full' && s !== 'part') s = 'today';
    return { l, s, today: date === today };
  });
}

/** Total kg x reps lifted from Monday to today, and the fun comparison for it. */
function liftedPart(plan, records, today) {
  const monday = addDays(today, -((fromStr(today).getDay() + 6) % 7));
  let kg = 0;
  for (let d = monday; d <= today; d = addDays(d, 1)) if (records[d] && d >= plan.startDate) kg += workoutSummary(dayFor(plan, d), records[d]).volumeKg;
  const fact = liftFact(kg);
  return {
    kgText: fmt(kg),
    fact: fact ? fact.short : 'Log a set to start the count',
    nextText: fact && fact.next ? `${fmt(fact.next.toGo)} kg to ${fact.next.name}` : fact ? 'Past the top of the scale' : 'First stop: a 10 kg bag of atta',
    pct: fact && fact.next ? Math.max(2, fact.next.pct) : fact ? 100 : 0,
  };
}

/**
 * Everything the widgets show for `today`, or null without a plan.
 * @param state  the whole app state (store.js getState())
 */
export function widgetSnapshot(state, today) {
  const plan = (state.plans || []).find((p) => p.id === state.activePlanId) || (state.plans || [])[0];
  if (!plan) return null;
  const records = (state.progress && state.progress[plan.id]) || {};
  const rec = records[today] || { ticks: {}, sets: {}, waterMl: 0 };
  const day = dayFor(plan, today);
  const stats = dayStats(day, rec);
  const meals = mealTotals(day, rec);
  const waterTarget = day.extras && day.extras.waterLiters ? Math.round(day.extras.waterLiters * 1000) : 0;
  const waterMl = rec.waterMl || 0;
  const tilde = meals.estimated ? '~' : '';

  return {
    v: SNAPSHOT_VERSION,
    date: today,
    dateText: dateText(today),
    label: shortLabel(day.label),
    streak: currentStreak(plan, records, today),
    ring: {
      done: stats.done,
      total: stats.total,
      pct: stats.pct,
      // So the widget can move the ring itself when its + button fills the water target.
      waterItem: waterTarget > 0,
      waterDone: waterTarget > 0 && waterMl >= waterTarget,
    },
    kcal: meals.calories !== null ? { text: `${fmt(meals.caloriesEaten || 0)} / ${tilde}${fmt(meals.calories)} kcal`, pct: pctOf(meals.caloriesEaten || 0, meals.calories) } : null,
    protein: meals.protein !== null ? { text: `${fmt(meals.proteinEaten || 0)} / ${tilde}${fmt(meals.protein)} g`, pct: pctOf(meals.proteinEaten || 0, meals.protein) } : null,
    water: { ml: waterMl, target: waterTarget, step: 250 },
    workout: workoutPart(plan, records, day, rec, today),
    week: weekPart(plan, records, today),
    lifted: liftedPart(plan, records, today),
  };
}
