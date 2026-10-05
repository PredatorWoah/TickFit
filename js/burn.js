// burn.js
// Calorie estimates for each exercise. Pure functions (no DOM), easy to test.
//
// Still an ESTIMATE: kcal = MET x body weight (kg) x hours. A MET is "how hard compared with resting":
// 1 is sitting still, 3.5 is a brisk walk, 8 is a run. The numbers come from the public Compendium of
// Physical Activities. Real burn varies by 30% or more from person to person.

import { exerciseProgress } from './stats.js';
import { sessionState, sessionMs } from './logging.js';
import { latest } from './weight.js';

export const DEFAULT_BODY_KG = 70;
export const LIFTING_MET = 5; // the old flat figure, still used for anything we do not recognise
const MIN_PER_SET = 2.5; // a set plus its rest
const MAX_SESSION_MIN = 240; // a clock left running all day is not a 20 hour workout

// First match wins, so the specific ones come first. [pattern, MET, kind]
const KINDS = [
  [/\b(sprint|hiit|burpee|jump rope|skipping|skip rope|boxing|battle rope)/, 10, 'cardio'],
  [/\b(run|running|jog|jogging|treadmill run)/, 9, 'cardio'],
  [/\b(swim|swimming)/, 7, 'cardio'],
  [/\b(rowing machine|row machine|rower|ergometer)/, 7, 'cardio'],
  [/\b(stair|stairs|stair climber|step.?up)/, 8, 'cardio'],
  [/\b(cycle|cycling|bike|biking|spin)/, 7, 'cardio'],
  [/\b(elliptical|cross.?trainer)/, 5, 'cardio'],
  [/\b(dance|zumba|aerobics)/, 5.5, 'cardio'],
  [/\b(brisk walk|walk|walking|hike|hiking|treadmill)/, 4, 'cardio'],
  [/\b(cardio|conditioning)/, 6.5, 'cardio'],
  [/\b(yoga|stretch|stretching|mobility|foam roll|warm.?up|cool.?down|meditat)/, 2.5, 'light'],
  [/\b(plank|crunch|sit.?up|leg raise|ab wheel|core|hollow|russian twist|mountain climber)/, 3.8, 'core'],
  [/\b(deadlift|squat|clean|snatch|thruster|lunge|leg press|hip thrust|bench|overhead press|shoulder press|military press|row|pull.?up|chin.?up|dip|push.?up|pulldown)/, 6, 'strength'],
];

/** { met, kind } for an exercise name. Unknown names count as ordinary weight training. */
export function classify(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, met, kind] of KINDS) if (re.test(n)) return { met, kind };
  return { met: LIFTING_MET, kind: 'strength' };
}

/** Minutes for one set when the reps text is a time ("30 sec" -> 0.5, "20 to 30 min" -> 25). Null when it is a rep count. */
export function timedMinutes(reps) {
  const t = String(reps ?? '').toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)(?:\s*(?:to|-|–)\s*(\d+(?:\.\d+)?))?\s*(sec|secs|second|seconds|s|min|mins|minute|minutes|m)\b/);
  if (!m) return null;
  const n = m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
  return /^s/.test(m[3]) ? n / 60 : n;
}

/** Body weight to use: your latest logged weight, else one typed in settings, else the plan builder's, else 70. */
export function bodyWeightKg(settings, bodyLog, today = '9999-99-99') {
  const s = settings || {};
  const logged = latest(bodyLog, today);
  return (logged && logged.kg) || Number(s.bodyWeightKg) || Number((s.profile || {}).weightKg) || DEFAULT_BODY_KG;
}

/** A number between lo and hi, or null. Used for the values people type in themselves. */
export function validManual(v, lo = -Infinity, hi = Infinity) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null;
}
export const MANUAL_MINUTES = [1, 600];
export const MANUAL_KCAL = [1, 6000];

/** The numbers a person typed in for a day: { minutes, kcal }, each null when not set or not sane. */
export function manualOf(record) {
  const m = (record && record.manual) || {};
  return { minutes: validManual(m.minutes, ...MANUAL_MINUTES), kcal: validManual(m.kcal, ...MANUAL_KCAL) };
}

/** Did the person type in time or calories for this day? */
export const hasManual = (record) => {
  const m = manualOf(record);
  return m.minutes !== null || m.kcal !== null;
};

/** The "my estimates run high or low" setting (a percent, default 100) as a multiplier between 0.5 and 1.5. */
export function burnFactor(settings) {
  const pct = Number((settings || {}).burnCalibration);
  return isFinite(pct) && pct > 0 ? Math.min(1.5, Math.max(0.5, pct / 100)) : 1;
}

/**
 * Estimated burn for one day's workout.
 * Returns { items: [{ id, name, kind, minutes, kcal }], minutes, kcal, cardioMinutes, cardioKcal, adjustedMinutes, adjustedKcal }.
 * Only exercises you actually did (ticked sets) count.
 *
 * Numbers the person typed in for the day (record.manual) win over the estimate, and the exercises are scaled to
 * match so everything adds up. `factor` is the person's own calibration (see burnFactor).
 */
export function exerciseBurn(day, record, bodyKg, factor = 1) {
  const kg = bodyKg || DEFAULT_BODY_KG;
  const items = [];
  for (const w of day.workout) {
    const p = exerciseProgress(w, record);
    if (!p.done) continue;
    const perSet = timedMinutes(w.reps);
    const { met, kind } = classify(w.exercise);
    // Timed work (a 30 min run, a 30 sec plank) uses its real time; lifting uses ~2.5 min a set including rest.
    const minutes = perSet !== null ? perSet * p.done : p.done * MIN_PER_SET;
    items.push({ id: w.id, name: w.exercise, kind, met, minutes });
  }

  // If you finished the stopwatch, stretch or shrink everything to the real total so the sum is honest.
  const est = items.reduce((t, i) => t + i.minutes, 0);
  if (est > 0 && sessionState(record) === 'finished') {
    const real = Math.min(sessionMs(record) / 60000, MAX_SESSION_MIN);
    if (real >= 1) {
      items.forEach((i) => (i.minutes *= real / est));
    }
  }

  // A time the person typed in replaces the clock.
  const manual = manualOf(record);
  const sumMin = items.reduce((t, i) => t + i.minutes, 0);
  if (manual.minutes !== null && sumMin > 0) items.forEach((i) => (i.minutes *= manual.minutes / sumMin));

  const f = factor || 1;
  items.forEach((i) => (i.kcal = i.met * kg * (i.minutes / 60) * f));
  // Calories the person typed in replace the estimate, shared out by each exercise's share.
  const sumKcal = items.reduce((t, i) => t + i.kcal, 0);
  if (manual.kcal !== null && sumKcal > 0) items.forEach((i) => (i.kcal *= manual.kcal / sumKcal));

  let minutes = 0;
  let kcal = 0;
  let cardioMinutes = 0;
  let cardioKcal = 0;
  for (const i of items) {
    i.kcal = Math.round(i.kcal);
    i.minutes = Math.round(i.minutes * 10) / 10;
    minutes += i.minutes;
    kcal += i.kcal;
    if (i.kind === 'cardio') {
      cardioMinutes += i.minutes;
      cardioKcal += i.kcal;
    }
  }

  // Trained without logging any sets? A time and/or calories typed in still count as a workout.
  if (!items.length && (manual.minutes !== null || manual.kcal !== null)) {
    minutes = manual.minutes ?? 0;
    kcal = manual.kcal !== null ? manual.kcal : Math.round(LIFTING_MET * kg * (minutes / 60) * f);
    items.push({ id: 'manual', name: 'Workout you added', kind: 'strength', met: LIFTING_MET, minutes, kcal: Math.round(kcal) });
  } else {
    if (manual.minutes !== null) minutes = manual.minutes;
    if (manual.kcal !== null) kcal = manual.kcal;
  }
  return { items, minutes: Math.round(minutes), kcal: Math.round(kcal), cardioMinutes: Math.round(cardioMinutes), cardioKcal, adjustedMinutes: manual.minutes !== null, adjustedKcal: manual.kcal !== null };
}

/**
 * Burn for one exercise within the day's workout. It is worked out from the WHOLE day (so the workout clock is
 * shared between exercises) and then the one exercise is picked out. Do not work out one exercise alone: the
 * clock would be stretched over just that exercise and give a huge number.
 */
export function singleBurn(day, record, w, bodyKg, factor = 1) {
  const item = exerciseBurn(day, record, bodyKg, factor).items.find((i) => i.id === w.id);
  return item ? item.kcal : 0;
}
