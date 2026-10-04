// builder.js
// The on-device plan builder: your details in, a complete weekly workout and meal plan out.
// No network, no AI. It uses standard formulas and the libraries in exercises.js and foods.js.
//
// The result is an ordinary TickFit plan with weekday labels ("Monday Push"), so it follows
// the real calendar and has a rest day wherever you are not training.
//
// This is general guidance, not medical advice. The maths is deliberately conservative.

import { candidatesFor, cardioFor } from './exercises.js';
import { mealOptions, sizeMeal } from './foods.js';

export const GOALS = {
  lose: 'Lose fat',
  muscle: 'Build muscle',
  strength: 'Get stronger',
  fit: 'Stay fit and healthy',
  endurance: 'Build stamina',
};
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------------------------------------------------------------------------
// Checking the answers
// ---------------------------------------------------------------------------

export function validateProfile(p) {
  const errors = [];
  const inRange = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  if (!['male', 'female', 'other'].includes(p.sex)) errors.push('Pick male, female or other.');
  if (!inRange(p.age, 14, 80)) errors.push('Age should be between 14 and 80.');
  if (!inRange(p.heightCm, 120, 230)) errors.push('Height should be between 120 and 230 cm.');
  if (!inRange(p.weightKg, 30, 250)) errors.push('Weight should be between 30 and 250 kg.');
  if (!(p.goal in GOALS)) errors.push('Pick a goal.');
  if (!['beginner', 'intermediate', 'advanced'].includes(p.experience)) errors.push('Pick your experience.');
  if (![2, 3, 4, 5, 6].includes(p.days)) errors.push('Pick 2 to 6 training days.');
  if (!['gym', 'dumbbell', 'bodyweight'].includes(p.equip)) errors.push('Pick where you train.');
  if (![30, 45, 60, 75].includes(p.minutes)) errors.push('Pick a session length.');
  if (!['little', 'some', 'lots'].includes(p.cardio)) errors.push('Pick how much cardio you want.');
  if (!['desk', 'moving', 'physical'].includes(p.life)) errors.push('Pick how active your day is.');
  if (!['vegan', 'veg', 'egg', 'nonveg'].includes(p.diet)) errors.push('Pick what you eat.');
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Calories and protein
// ---------------------------------------------------------------------------

/** Mifflin-St Jeor resting energy use (kcal a day). "other" uses the midpoint of the two formulas. */
export function bmr({ sex, age, heightCm, weightKg }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === 'male' ? 5 : sex === 'female' ? -161 : -78);
}

export const bmi = ({ heightCm, weightKg }) => weightKg / (heightCm / 100) ** 2;

/** Daily targets for a profile. Also returns notes explaining any safety adjustments. */
export function targets(p) {
  const notes = [];
  const rest = bmr(p);
  const base = { desk: 1.2, moving: 1.3, physical: 1.4 }[p.life];
  const activity = Math.min(1.9, base + 0.03 * p.days + { little: 0, some: 0.03, lots: 0.06 }[p.cardio]);
  const tdee = rest * activity;

  // Be careful about cutting calories for people who should not diet.
  let goal = p.goal;
  if (goal === 'lose' && (p.age < 18 || bmi(p) < 18.5)) {
    goal = 'fit';
    notes.push(p.age < 18 ? 'You are under 18, so this plan keeps your calories at maintenance instead of cutting them.' : 'Your BMI is low, so this plan keeps your calories at maintenance instead of cutting them.');
  }

  const factor = { lose: 0.8, muscle: 1.08, strength: 1.05, fit: 1.0, endurance: 1.05 }[goal];
  const floor = p.sex === 'male' ? 1500 : p.sex === 'female' ? 1200 : 1350;
  let calories = tdee * factor;
  if (calories < floor && goal === 'lose') {
    calories = floor;
    notes.push(`Calories are held at ${floor} a day, the lowest this plan will go.`);
  }
  calories = Math.round(calories / 50) * 50;

  // Protein from a sensible reference weight (so very heavy people don't get absurd targets).
  const idealAt25 = 25 * (p.heightCm / 100) ** 2;
  const ref = p.weightKg <= idealAt25 ? p.weightKg : idealAt25 + 0.25 * (p.weightKg - idealAt25);
  const gPerKg = { lose: 2.0, muscle: 1.8, strength: 1.8, fit: 1.4, endurance: 1.5 }[goal];
  const protein = Math.round(Math.min(ref * gPerKg, (calories * 0.4) / 4));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { bmr: Math.round(rest), tdee: Math.round(tdee), calories, protein, fat, carbs, goal, notes };
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

// Which weekdays you train (0 = Monday), and which session goes on each.
function weekPattern(days, experience) {
  const patterns = {
    2: [[0, 'FULL_A'], [3, 'FULL_B']],
    3: experience === 'advanced' ? [[0, 'PUSH'], [2, 'PULL'], [4, 'LEGS']] : [[0, 'FULL_A'], [2, 'FULL_B'], [4, 'FULL_C']],
    4: [[0, 'UPPER'], [1, 'LOWER'], [3, 'UPPER'], [4, 'LOWER']],
    5: [[0, 'PUSH'], [1, 'PULL'], [2, 'LEGS'], [4, 'UPPER'], [5, 'LOWER']],
    6: [[0, 'PUSH'], [1, 'PULL'], [2, 'LEGS'], [3, 'PUSH'], [4, 'PULL'], [5, 'LEGS']],
  };
  return patterns[days];
}

// Each session is a list of movement groups, most important first.
const SESSIONS = {
  FULL_A: { name: 'Full Body A', slots: ['squat', 'hpush', 'hpull', 'hinge', 'shoulder', 'core', 'biceps'] },
  FULL_B: { name: 'Full Body B', slots: ['hinge', 'vpush', 'vpull', 'lunge', 'biceps', 'core', 'triceps'] },
  FULL_C: { name: 'Full Body C', slots: ['squat', 'chest', 'hpull', 'glute', 'triceps', 'core', 'shoulder'] },
  UPPER: { name: 'Upper Body', slots: ['hpush', 'hpull', 'vpush', 'vpull', 'shoulder', 'biceps', 'triceps'] },
  LOWER: { name: 'Lower Body', slots: ['squat', 'hinge', 'lunge', 'hamstring', 'calf', 'core', 'quad'] },
  PUSH: { name: 'Push', slots: ['hpush', 'vpush', 'chest', 'shoulder', 'triceps', 'core', 'triceps'] },
  PULL: { name: 'Pull', slots: ['vpull', 'hpull', 'shoulder', 'biceps', 'core', 'biceps', 'hpull'] },
  LEGS: { name: 'Legs', slots: ['squat', 'hinge', 'lunge', 'hamstring', 'quad', 'calf', 'core'] },
};

// If a movement group has no exercise that fits (no equipment, an injury), try these instead.
const FALLBACK = {
  vpull: ['hpull'], hpull: ['vpull'], chest: ['hpush'], shoulder: ['vpush'], hamstring: ['hinge', 'glute'],
  quad: ['squat'], glute: ['hinge'], triceps: ['hpush'], biceps: ['hpull'], vpush: ['hpush'], lunge: ['squat'], hinge: ['glute'],
};

const TIMED = { Plank: '30 sec', 'Side Plank': '20 sec each side', 'Wall Sit': '30 sec' };
const REPS_OVERRIDE = { 'Dead Bug': '10 each side', 'Bicycle Crunch': '20', 'Russian Twist': '20', 'Hanging Knee Raise': '10 to 12', 'Cable Crunch': '12 to 15' };

/** Sets, reps and rest for an exercise, given the goal and the person's experience. */
export function dose(ex, goal, experience) {
  if (ex.kind === 'core') return { sets: 3, reps: TIMED[ex.name] || REPS_OVERRIDE[ex.name] || '15', rest: '45s' };
  if (TIMED[ex.name]) return { sets: 3, reps: TIMED[ex.name], rest: '45s' };

  const table = {
    muscle: { compound: [3, '8 to 12', '90s'], isolation: [3, '10 to 15', '60s'], calf: [3, '12 to 15', '45s'] },
    lose: { compound: [3, '10 to 15', '60s'], isolation: [3, '12 to 15', '45s'], calf: [3, '15', '45s'] },
    strength: { compound: [4, '4 to 6', '150s'], isolation: [3, '8 to 10', '90s'], calf: [3, '10 to 12', '60s'] },
    fit: { compound: [3, '10 to 12', '75s'], isolation: [3, '12', '60s'], calf: [3, '12 to 15', '45s'] },
    endurance: { compound: [2, '15 to 20', '45s'], isolation: [2, '15 to 20', '45s'], calf: [2, '20', '45s'] },
  };
  let [sets, reps, rest] = table[goal][ex.kind] || table[goal].isolation;

  // You can't add load to body weight moves, so heavy low rep schemes make no sense for them.
  if (ex.equip === 'bodyweight' && reps === '4 to 6') {
    sets = 3;
    reps = '8 to 12';
    rest = '75s';
  }
  if (experience === 'beginner' && goal !== 'strength') sets = Math.max(2, sets - 1);
  if (experience === 'advanced' && ex.kind === 'compound' && sets < 5 && (goal === 'muscle' || goal === 'strength')) sets += 1;
  return { sets, reps, rest };
}

/** Pick one exercise for a movement group; `variant` rotates through the options for repeats. */
function pickExercise(group, ctx, used, variant) {
  for (const g of [group, ...(FALLBACK[group] || [])]) {
    const list = candidatesFor(g, ctx).filter((e) => !used.has(e.name));
    if (list.length) return list[variant % list.length];
  }
  return null;
}

/** Build the exercises for one session. */
export function buildSession(sessionKey, p, nth, goal) {
  const ctx = { equip: p.equip, avoid: p.avoid || [], experience: p.experience };
  const count = Math.min(SESSIONS[sessionKey].slots.length, { 30: 4, 45: 5, 60: 6, 75: 7 }[p.minutes]);
  const used = new Set();
  const out = [];
  const seen = {};
  for (const group of SESSIONS[sessionKey].slots.slice(0, count)) {
    seen[group] = (seen[group] || 0) + 1;
    const ex = pickExercise(group, ctx, used, nth + seen[group] - 1);
    if (!ex) continue;
    used.add(ex.name);
    const d = dose(ex, goal, p.experience);
    out.push({ exercise: ex.name, sets: d.sets, reps: d.reps, rest: d.rest, weight: ex.equip === 'bodyweight' ? 'bodyweight' : '', notes: '' });
  }
  return out;
}

/** How many cardio sessions a week, and how long each is. */
export function cardioPlan(p, goal) {
  let sessions = { little: 0, some: 2, lots: 3 }[p.cardio];
  if (goal === 'lose') sessions = Math.min(4, sessions + 1);
  if (goal === 'endurance') sessions = Math.max(3, sessions);
  let minutes = goal === 'lose' ? 30 : goal === 'endurance' ? 40 : 20;
  if (p.experience === 'beginner') minutes = Math.max(15, Math.round((minutes * 0.75) / 5) * 5);
  return { sessions, minutes };
}

// ---------------------------------------------------------------------------
// Putting the week together
// ---------------------------------------------------------------------------

const MEAL_SLOTS = [
  { key: 'breakfast', name: 'Breakfast', time: '8:00 AM', share: 0.25 },
  { key: 'lunch', name: 'Lunch', time: '1:00 PM', share: 0.33 },
  { key: 'snack', name: 'Evening snack', time: '5:00 PM', share: 0.12 },
  { key: 'dinner', name: 'Dinner', time: '8:30 PM', share: 0.3 },
];
const BIG_MEAL_SLOTS = [
  { key: 'breakfast', name: 'Breakfast', time: '8:00 AM', share: 0.22 },
  { key: 'snack', name: 'Mid-morning snack', time: '11:00 AM', share: 0.1, offset: 3 },
  { key: 'lunch', name: 'Lunch', time: '1:00 PM', share: 0.3 },
  { key: 'snack', name: 'Evening snack', time: '5:00 PM', share: 0.1 },
  { key: 'dinner', name: 'Dinner', time: '8:30 PM', share: 0.28 },
];

/** How far a sized meal is from its target (0 = perfect). Calories count most, then missing protein. */
const mealError = (meal, targetK, targetP) => Math.abs(meal.calories - targetK) / targetK + 0.7 * Math.max(0, (targetP - meal.protein) / Math.max(1, targetP));

/** The meals for one day (dayIndex 0..6), sized to the day's targets. */
export function buildMeals(dayIndex, t, diet) {
  const slots = t.calories >= 2500 ? BIG_MEAL_SLOTS : MEAL_SLOTS;
  const usedToday = new Set(); // dishes already on today's menu
  const usedProteins = new Set(); // main protein foods already used today (so not dal at lunch AND dinner)
  const mainProtein = (option) => option.items.find((i) => i.role === 'protein')?.c;
  return slots.map((slot) => {
    const options = mealOptions(slot.key, diet);
    const targetK = t.calories * slot.share;
    const targetP = t.protein * slot.share;
    const sized = options.map((option) => ({ option, meal: sizeMeal(option, targetK, targetP) }));
    sized.forEach((s) => (s.err = mealError(s.meal, targetK, targetP)));

    // Dishes that fit this target reasonably and are not already on today's menu, best first. If fewer
    // than three fit, top up with the next closest so the week still has variety. Then rotate through
    // them by day (lunch and dinner start at different points).
    // Prefer dishes with a different main protein than earlier meals today; relax that if nothing is left.
    const unused = sized.filter((s) => !usedToday.has(s.option));
    const varied = unused.filter((s) => !usedProteins.has(mainProtein(s.option)));
    const fresh = (varied.length >= 2 ? varied : unused).sort((a, b) => a.err - b.err);
    let pool = fresh.filter((s) => s.err < 0.2);
    if (pool.length < 3) pool = fresh.slice(0, 3);
    if (!pool.length) pool = sized;
    const shift = slot.key === 'dinner' ? 3 : slot.offset || 0;
    const pick = pool[(dayIndex + shift) % pool.length];
    usedToday.add(pick.option);
    usedProteins.add(mainProtein(pick.option));
    return { time: slot.time, name: slot.name, items: pick.meal.items, calories: pick.meal.calories, protein: pick.meal.protein };
  });
}

const waterFor = (weightKg, training) => Math.min(5, Math.max(2, Math.round((weightKg * 0.035 + (training ? 0.5 : 0)) * 2) / 2));

/**
 * Build the whole plan.
 * Returns { plan, summary } where plan is a normal TickFit plan object (7 weekday days).
 */
export function buildPlan(p) {
  const check = validateProfile(p);
  if (!check.ok) throw new Error(check.errors.join(' '));

  const t = targets(p);
  const pattern = weekPattern(p.days, p.experience);
  const sessionByDay = new Map(pattern.map(([wd, key], i) => [wd, { key, nth: i }]));
  const cardio = cardioPlan(p, t.goal);
  const cardioChoices = cardioFor({ equip: p.equip === 'gym' ? 'gym' : 'bodyweight', avoid: p.avoid || [] });
  const walk = cardioChoices.find((c) => c.name === 'Brisk walk') || cardioChoices[0];
  const cardioItem = (c, i) => ({ exercise: c.name, sets: 1, reps: `${cardio.minutes} min`, rest: '', weight: '', notes: 'Easy to moderate pace. You should still be able to talk.', _i: i });

  // Cardio goes on rest days first, then onto lighter training days (never straight after legs).
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !sessionByDay.has(d));
  const cardioDays = new Set(restDays.slice(0, cardio.sessions));
  let left = cardio.sessions - cardioDays.size;
  for (const [wd, { key }] of sessionByDay) {
    if (left <= 0) break;
    if (key !== 'LEGS' && key !== 'LOWER') {
      cardioDays.add(wd);
      left--;
    }
  }

  let ci = 0;
  let firstTrainingDay = true;
  const days = WEEKDAYS.map((weekday, wd) => {
    const info = sessionByDay.get(wd);
    const training = !!info;
    const workout = info ? buildSession(info.key, p, info.nth, t.goal) : [];
    if (cardioDays.has(wd) && cardioChoices.length) {
      const choice = !training && walk ? walk : cardioChoices[ci++ % cardioChoices.length];
      workout.push(cardioItem(choice, ci));
    }
    workout.forEach((w) => delete w._i);

    let label = `${weekday} Rest`;
    if (info) label = `${weekday} ${SESSIONS[info.key].name}`;
    else if (workout.length) label = `${weekday} Cardio`;

    let notes = training ? 'Warm up for 5 minutes first. Rest between sets as shown.' : 'Recovery day. Easy movement and good sleep help your muscles rebuild.';
    if (info && firstTrainingDay) {
      firstTrainingDay = false;
      notes =
        `Your daily targets: about ${t.calories} kcal, ${t.protein} g protein, ${t.carbs} g carbs and ${t.fat} g fat. ` +
        'Warm up for 5 to 8 minutes before lifting. Stop each set with 2 or 3 reps still in the tank. ' +
        'When you can do the top of the rep range on every set, add a little weight next time. ' +
        'Aim for 7 or more hours of sleep. This plan is general guidance, not medical advice.';
    }
    return { label, workout, meals: buildMeals(wd, t, p.diet), extras: { waterLiters: waterFor(p.weightKg, training || workout.length > 0), supplements: [], notes } };
  });

  const split = days.filter((d) => d.workout.length).map((d) => d.label);
  return {
    plan: { name: p.name || `${GOALS[p.goal]} plan, ${p.days} days a week`, days },
    summary: { ...t, split, trainingDays: pattern.length, cardioSessions: cardio.sessions },
  };
}

/** The profile as plain text, for the "ask a chatbot instead" prompt. */
export function describeProfile(p) {
  const equip = { gym: 'a full gym', dumbbell: 'home with dumbbells', bodyweight: 'home with no equipment' }[p.equip];
  const diet = { vegan: 'vegan', veg: 'vegetarian (dairy ok)', egg: 'eggetarian', nonveg: 'non-vegetarian' }[p.diet];
  const life = { desk: 'mostly sitting (desk job)', moving: 'on my feet some of the day', physical: 'a physical job' }[p.life];
  const cardio = { little: 'as little as possible', some: 'some (2 sessions a week)', lots: 'a lot (3 or more sessions a week)' }[p.cardio];
  return [
    `Sex: ${p.sex}`,
    `Age: ${p.age}`,
    `Height: ${p.heightCm} cm`,
    `Weight: ${p.weightKg} kg`,
    `Goal: ${GOALS[p.goal]}`,
    `Experience: ${p.experience}`,
    `Training days per week: ${p.days}. Label each day with its weekday, like "Monday Push", and include all 7 weekdays (rest days have an empty workout but still have meals).`,
    `Where I train: ${equip}`,
    `Session length: ${p.minutes} minutes`,
    `Cardio: ${cardio}`,
    `Daily activity: ${life}`,
    `Food: ${diet}, Indian home cooking preferred`,
    `Injuries or things to avoid: ${(p.avoid || []).length ? p.avoid.join(', ') : 'none'}`,
  ].join('\n');
}
