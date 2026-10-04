// Tests for the plan builder. Run: node tests/builder.mjs
import { validateProfile, bmr, bmi, targets, buildPlan, buildSession, dose, cardioPlan } from '../js/builder.js';
import { EXERCISES, ALLOWED_EQUIP } from '../js/exercises.js';
import { validatePlan } from '../js/parser.js';
import { weeklyWeekdays } from '../js/schedule.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL  ${name}  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } else console.log(`PASS  ${name}`);
};
const check = (name, cond, extra = '') => { if (!cond) { failed++; console.log(`FAIL  ${name} ${extra}`); } else console.log(`PASS  ${name}`); };

const base = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'muscle', experience: 'beginner', days: 4, equip: 'gym', minutes: 60, cardio: 'some', life: 'moving', diet: 'veg', avoid: [] };

// ----- the maths
eq('BMR male 30y 180cm 80kg (Mifflin St Jeor)', bmr(base), 1780);
eq('BMR female 25y 165cm 60kg', bmr({ sex: 'female', age: 25, heightCm: 165, weightKg: 60 }), 1345.25);
eq('BMI', Math.round(bmi({ heightCm: 180, weightKg: 81 }) * 10) / 10, 25);
const tm = targets(base);
check('muscle gain eats above maintenance', tm.calories > tm.tdee, JSON.stringify(tm));
const tl = targets({ ...base, goal: 'lose' });
check('fat loss eats below maintenance', tl.calories < tl.tdee);
check('fat loss deficit is about 20 percent', Math.abs(tl.calories / tl.tdee - 0.8) < 0.03, String(tl.calories / tl.tdee));
check('calories are a multiple of 50', tm.calories % 50 === 0 && tl.calories % 50 === 0);
check('macros roughly add up to calories', Math.abs(tm.protein * 4 + tm.carbs * 4 + tm.fat * 9 - tm.calories) < 20);
check('protein is 1.8 g per kg for muscle at healthy weight', Math.abs(tm.protein - 144) <= 2, String(tm.protein));
const small = targets({ ...base, sex: 'female', age: 30, heightCm: 150, weightKg: 45, goal: 'lose', days: 2, life: 'desk', cardio: 'little' });
check('safety: never cut below 1200 for women', small.calories >= 1200 || small.goal === 'fit', JSON.stringify(small));
const low = targets({ ...base, weightKg: 50, heightCm: 180, goal: 'lose' });
eq('safety: underweight person does not get a deficit', [low.goal, low.calories >= low.tdee - 50], ['fit', true]);
check('safety: underweight explanation given', low.notes.length === 1);
const teen = targets({ ...base, age: 16, goal: 'lose' });
eq('safety: under 18 does not get a deficit', teen.goal, 'fit');
const heavy = targets({ ...base, weightKg: 140, goal: 'muscle' });
check('very heavy people do not get silly protein targets', heavy.protein < 180, String(heavy.protein));
check('protein never exceeds 40 percent of calories', heavy.protein * 4 <= heavy.calories * 0.4 + 1);

// ----- validation
eq('valid profile', validateProfile(base).ok, true);
check('rejects age 10', !validateProfile({ ...base, age: 10 }).ok);
check('rejects 300 kg', !validateProfile({ ...base, weightKg: 300 }).ok);
check('rejects 7 days', !validateProfile({ ...base, days: 7 }).ok);
check('rejects missing goal', !validateProfile({ ...base, goal: undefined }).ok);
check('rejects text age', !validateProfile({ ...base, age: '30' }).ok);
let threw = false; try { buildPlan({ ...base, age: 5 }); } catch { threw = true; }
check('buildPlan refuses a bad profile', threw);

// ----- structure
const { plan, summary } = buildPlan(base);
eq('plan has 7 weekday days', plan.days.length, 7);
check('labels are weekdays so the plan follows the calendar', weeklyWeekdays(plan) !== null);
eq('4 training days', plan.days.filter((d) => d.label.includes('Upper') || d.label.includes('Lower')).length, 4);
eq('4 day split is Mon Tue Thu Fri', plan.days.map((d, i) => (/Upper|Lower/.test(d.label) ? i : -1)).filter((i) => i >= 0), [0, 1, 3, 4]);
check('rest days have no strength work', plan.days[2].workout.every((w) => /walk|cycl|jog|skip|ellip|treadmill|box/i.test(w.exercise)));
check('first training day carries the targets note', plan.days[0].extras.notes.includes(`${summary.calories} kcal`));
check('later notes are short', plan.days[1].extras.notes.length < 140);
check('summary lists the split', summary.split.length >= 4);
const parsed = validatePlan(plan);
check('plan passes the importer with no errors', parsed.ok, JSON.stringify(parsed.errors));
check('plan passes with no warnings', parsed.warnings.length === 0, JSON.stringify(parsed.warnings));

// session length controls how many exercises
const count = (m) => buildSession('UPPER', { ...base, minutes: m }, 0, 'muscle').length;
eq('30 min session has 4 exercises', count(30), 4);
eq('45 min session has 5', count(45), 5);
eq('60 min session has 6', count(60), 6);
eq('75 min session has 7', count(75), 7);

// beginners vs advanced, goals
const bench = EXERCISES.find((e) => e.name === 'Machine Chest Press');
eq('beginner muscle compound is 2 sets', dose(bench, 'muscle', 'beginner').sets, 2);
eq('intermediate muscle compound is 3 sets', dose(bench, 'muscle', 'intermediate').sets, 3);
eq('advanced muscle compound is 4 sets', dose(bench, 'muscle', 'advanced').sets, 4);
eq('strength goal uses low reps', dose(bench, 'strength', 'intermediate').reps, '4 to 6');
const pushups = EXERCISES.find((e) => e.name === 'Push-ups');
eq('bodyweight moves never get a heavy 4 to 6 scheme', dose(pushups, 'strength', 'intermediate').reps, '8 to 12');
eq('plank is timed', dose(EXERCISES.find((e) => e.name === 'Plank'), 'muscle', 'beginner').reps, '30 sec');
eq('lose goal adds a cardio session', cardioPlan({ cardio: 'some', experience: 'intermediate' }, 'lose').sessions, 3);
eq('endurance goal has at least 3 cardio sessions', cardioPlan({ cardio: 'little', experience: 'intermediate' }, 'endurance').sessions, 3);

// ----- every combination of answers must produce a valid, sensible plan
const NONVEG = /chicken|fish|egg/i, DAIRY = /paneer|curd|(?<!soy )milk|whey|raita|kadhi|buttermilk/i;
let combos = 0, badPlan = 0, badMeals = 0, badEquip = 0, badInjury = 0, badDiet = 0, badWeekly = 0, badDays = 0;
const worst = { off: 0, who: '' };
const sexes = ['male', 'female', 'other'], goals = ['lose', 'muscle', 'strength', 'fit', 'endurance'], exps = ['beginner', 'intermediate', 'advanced'];
const equips = ['gym', 'dumbbell', 'bodyweight'], diets = ['vegan', 'veg', 'egg', 'nonveg'];
const injuries = [[], ['knee'], ['back'], ['shoulder'], ['knee', 'back', 'shoulder']];
const bodies = [{ age: 22, heightCm: 160, weightKg: 48 }, { age: 30, heightCm: 175, weightKg: 75 }, { age: 45, heightCm: 168, weightKg: 95 }];
let n = 0;
for (const sex of sexes) for (const goal of goals) for (const experience of exps) for (const days of [2, 3, 4, 5, 6]) for (const equip of equips) for (const diet of diets) {
  const avoid = injuries[n % injuries.length];
  const body = bodies[n % bodies.length];
  const minutes = [30, 45, 60, 75][n % 4], cardio = ['little', 'some', 'lots'][n % 3], life = ['desk', 'moving', 'physical'][n % 3];
  n++; combos++;
  const prof = { sex, ...body, goal, experience, days, equip, minutes, cardio, life, diet, avoid };
  const out = buildPlan(prof);
  const v = validatePlan(out.plan);
  if (!v.ok || v.warnings.length) { badPlan++; console.log('  invalid plan for', JSON.stringify(prof), v.errors.slice(0, 2)); continue; }
  if (weeklyWeekdays(out.plan) === null) badWeekly++;
  const trainDays = out.plan.days.filter((d) => d.workout.some((w) => !/walk|jog|cycl|skip|ellip|treadmill|box/i.test(w.exercise))).length;
  if (trainDays !== days) { badDays++; console.log('  wrong number of training days', trainDays, 'vs', days); }
  const allowed = ALLOWED_EQUIP[equip];
  for (const d of out.plan.days) {
    if (d.workout.some((w) => w.exercise === '' )) badPlan++;
    for (const w of d.workout) {
      const ex = EXERCISES.find((e) => e.name === w.exercise);
      if (!ex) continue; // cardio
      if (!allowed.includes(ex.equip)) badEquip++;
      if (ex.flags.some((f) => avoid.includes(f))) badInjury++;
    }
    const kcal = d.meals.reduce((s, m) => s + m.calories, 0);
    const off = Math.abs(kcal - out.summary.calories) / out.summary.calories;
    if (off > worst.off) { worst.off = off; worst.who = JSON.stringify({ sex, goal, body, diet }) + ' ' + kcal + ' vs ' + out.summary.calories; }
    if (off > 0.2) badMeals++;
    const text = d.meals.flatMap((m) => m.items).join(' | ');
    if (diet === 'vegan' && (NONVEG.test(text) || DAIRY.test(text))) { badDiet++; console.log('  vegan violation:', text); }
    if (diet === 'veg' && NONVEG.test(text)) { badDiet++; console.log('  veg violation:', text); }
    if (diet === 'egg' && /chicken|fish/i.test(text)) badDiet++;
  }
}
console.log(`  ${combos} combinations built. worst day was ${(worst.off * 100).toFixed(1)}% off its calorie target (${worst.who})`);
check(`all ${combos} combinations give a valid plan`, badPlan === 0, `${badPlan} bad`);
check('all plans are weekday (calendar) plans', badWeekly === 0);
check('every plan has the requested number of training days', badDays === 0, `${badDays} bad`);
check('no exercise needs equipment the person lacks', badEquip === 0, `${badEquip} bad`);
check('no exercise hits a body part the person said to avoid', badInjury === 0, `${badInjury} bad`);
check('no day is more than 20 percent off its calorie target', badMeals === 0, `${badMeals} days`);
check('diets are respected (vegan, vegetarian, eggetarian)', badDiet === 0, `${badDiet} violations`);

// variety: a week should not repeat the same dish for lunch
const lunches = new Set(buildPlan({ ...base, diet: 'veg' }).plan.days.map((d) => d.meals.find((m) => m.name === 'Lunch').items[0]));
check('lunches vary across the week', lunches.size >= 4, [...lunches].join(' / '));
const nonvegWeek = buildPlan({ ...base, diet: 'nonveg' }).plan.days.map((d) => d.meals.flatMap((m) => m.items).join(' ')).join(' ');
check('non-veg eaters actually get chicken or fish', /chicken|fish/i.test(nonvegWeek));
const eggWeek = buildPlan({ ...base, diet: 'egg' }).plan.days.map((d) => d.meals.flatMap((m) => m.items).join(' ')).join(' ');
check('eggetarians get eggs', /egg/i.test(eggWeek));

// variety within a day and across days
let dupDays = 0, sameSnack = 0;
for (const diet of ['vegan', 'veg', 'egg', 'nonveg']) {
  const week = buildPlan({ ...base, diet }).plan.days;
  for (const d of week) {
    const dishes = d.meals.map((m) => m.items[0]);
    if (new Set(dishes).size !== dishes.length) dupDays++;
  }
  const snacks = new Set(week.map((d) => d.meals.find((m) => m.name === 'Evening snack').items.join('|')));
  if (snacks.size < 3) sameSnack++;
}
check('no dish repeats within a single day', dupDays === 0, `${dupDays} days`);
check('evening snacks vary across the week', sameSnack === 0, `${sameSnack} diets`);

// beginners should not be handed the hardest barbell lifts when easier ones exist
const beginnerLegs = buildSession('LOWER', { ...base, experience: 'beginner', minutes: 60 }, 0, 'muscle').map((e) => e.exercise);
check('beginner leg day has no barbell squat or barbell RDL', !beginnerLegs.some((n) => /Barbell/.test(n) || n === 'Romanian Deadlift'), beginnerLegs.join(', '));
const advancedLegs = buildSession('LOWER', { ...base, experience: 'advanced', minutes: 60 }, 0, 'muscle').map((e) => e.exercise);
check('advanced leg day does use the barbell squat', advancedLegs.includes('Barbell Back Squat'), advancedLegs.join(', '));
const beginnerUpper = buildSession('UPPER', { ...base, experience: 'beginner', minutes: 75 }, 0, 'muscle').map((e) => e.exercise);
check('beginner upper day avoids pull-ups and barbell press', !beginnerUpper.some((n) => /Pull-ups|Barbell/.test(n)), beginnerUpper.join(', '));

// water and big-meal plans
check('big targets get five meals', buildPlan({ ...base, weightKg: 100, heightCm: 190, goal: 'muscle', days: 6, life: 'physical' }).plan.days[0].meals.length === 5);
check('normal targets get four meals', buildPlan({ ...base, sex: 'female', weightKg: 60, heightCm: 165, goal: 'fit', days: 3 }).plan.days[0].meals.length === 4);
check('water scales with weight', buildPlan({ ...base, weightKg: 100 }).plan.days[0].extras.waterLiters > buildPlan({ ...base, weightKg: 50 }).plan.days[0].extras.waterLiters);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
