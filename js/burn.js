// burn.js
// Calorie estimates for each exercise. Pure functions (no DOM), easy to test.
//
// Still an ESTIMATE: kcal = MET x body weight (kg) x hours. A MET is "how hard compared with resting":
// 1 is sitting still, 3.5 is a brisk walk, 8 is a run. The numbers come from the public Compendium of
// Physical Activities. Real burn varies by 30% or more from person to person.

import { exerciseProgress, plannedSets } from './stats.js';
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

/**
 * Estimated burn for one day's workout.
 * Returns { items: [{ id, name, kind, minutes, kcal }], minutes, kcal, cardioMinutes, cardioKcal }.
 * Only exercises you actually did (ticked sets) count.
 */
export function exerciseBurn(day, record, bodyKg) {
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

  let minutes = 0;
  let kcal = 0;
  let cardioMinutes = 0;
  let cardioKcal = 0;
  for (const i of items) {
    i.kcal = Math.round(i.met * kg * (i.minutes / 60));
    i.minutes = Math.round(i.minutes * 10) / 10;
    minutes += i.minutes;
    kcal += i.kcal;
    if (i.kind === 'cardio') {
      cardioMinutes += i.minutes;
      cardioKcal += i.kcal;
    }
  }
  return { items, minutes: Math.round(minutes), kcal, cardioMinutes: Math.round(cardioMinutes), cardioKcal };
}

/**
 * Burn for one exercise within the day's workout. It is worked out from the WHOLE day (so the workout clock is
 * shared between exercises) and then the one exercise is picked out. Do not work out one exercise alone: the
 * clock would be stretched over just that exercise and give a huge number.
 */
export function singleBurn(day, record, w, bodyKg) {
  const item = exerciseBurn(day, record, bodyKg).items.find((i) => i.id === w.id);
  return item ? item.kcal : 0;
}
