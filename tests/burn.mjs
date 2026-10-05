// Tests for calorie estimates per exercise. Run: node tests/burn.mjs
import { classify, timedMinutes, bodyWeightKg, exerciseBurn, singleBurn, validManual, manualOf, hasManual, burnFactor } from '../js/burn.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

ok(classify('Treadmill Run').kind === 'cardio' && classify('Treadmill Run').met === 9, 'run is cardio at 9 METs');
ok(classify('Brisk walk or easy cycling').kind === 'cardio', 'walk/cycling is cardio');
ok(classify('Jump Rope').met === 10, 'jump rope 10 METs');
ok(classify('Full body stretching').kind === 'light', 'stretching is light');
ok(classify('Plank').kind === 'core', 'plank is core');
ok(classify('Barbell Squat').met === 6, 'squat 6 METs');
ok(classify('Zottman Curl').met === 5 && classify('Zottman Curl').kind === 'strength', 'unknown exercise = ordinary lifting (5)');
ok(classify('').met === 5 && classify(null).met === 5, 'empty names do not crash');
ok(classify('Dumbbell Row').met === 6, 'row is 6 (not mistaken for rowing machine)');
ok(classify('Rowing Machine').kind === 'cardio', 'rowing machine is cardio');

ok(timedMinutes('30 sec') === 0.5, '30 sec = 0.5 min');
ok(timedMinutes('20 to 30 min') === 25, '20 to 30 min = 25');
ok(timedMinutes('45 min') === 45, '45 min');
ok(timedMinutes('1 minute') === 1, '1 minute');
ok(timedMinutes('8 to 10') === null && timedMinutes('12') === null && timedMinutes(undefined) === null, 'rep counts are not times');

ok(bodyWeightKg({}, { '2026-10-01': 77.5, '2026-10-09': 70.1 }, '2026-10-05') === 77.5 && bodyWeightKg({ bodyWeightKg: 90 }, {}, '2026-10-05') === 90, 'latest logged weight wins, and ignores future dates');
ok(bodyWeightKg({}) === 70 && bodyWeightKg({ profile: { weightKg: 82 } }) === 82 && bodyWeightKg({ bodyWeightKg: 90, profile: { weightKg: 82 } }) === 90, 'body weight order: typed, builder, 70');

const day = { workout: [{ id: 'a', exercise: 'Bench Press', sets: 3, reps: '10' }, { id: 'b', exercise: 'Treadmill Run', sets: 1, reps: '30 min' }, { id: 'c', exercise: 'Curl', sets: 3, reps: '12' }] };
const rec = { ticks: {}, sets: { a: [{ w: 20, r: 10, done: true }, { w: 20, r: 10, done: true }, { w: 20, r: 10, done: false }] }, } ;
let b = exerciseBurn(day, rec, 70);
ok(b.items.length === 1 && b.items[0].minutes === 5 && b.items[0].kcal === Math.round(6 * 70 * 5 / 60), 'only ticked sets count: 2 sets = 5 min');
rec.ticks.b = true;
b = exerciseBurn(day, rec, 70);
ok(b.items.length === 2 && b.cardioMinutes === 30 && b.cardioKcal === Math.round(9 * 70 * 0.5), 'a 30 min run adds cardio: 315 kcal');
ok(b.kcal === b.items.reduce((t, i) => t + i.kcal, 0), 'total = sum of exercises');
ok(singleBurn(day, rec, day.workout[1], 70) === 315, 'singleBurn matches');
{ // A long workout clock must be SHARED between exercises, not stretched over one of them.
  const d6 = { workout: [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'e' + n, exercise: 'Dumbbell Press ' + n, sets: 3, reps: '10' })) };
  const r6 = { ticks: {}, sets: {}, session: { start: 0, end: 101 * 60000 } };
  for (const w of d6.workout) r6.sets[w.id] = [1, 2, 3].map(() => ({ w: 10, r: 10, done: true }));
  const total = exerciseBurn(d6, r6, 78).kcal;
  const each = d6.workout.map((w) => singleBurn(d6, r6, w, 78));
  ok(each.reduce((t, k) => t + k, 0) <= total + 6, 'the per-exercise numbers add up to the total: ' + each.join('+') + ' vs ' + total);
  ok(Math.max(...each) < total / 4, 'no single exercise gets the whole workout: biggest ' + Math.max(...each) + ' of ' + total);
}
rec.session = { start: 0, end: 70 * 60000 };
b = exerciseBurn(day, rec, 70);
ok(b.minutes === 70, 'finished clock rescales to the real 70 minutes');
const none = exerciseBurn(day, { ticks: {}, sets: {} }, 70);
ok(none.kcal === 0 && none.items.length === 0 && none.minutes === 0, 'nothing done = nothing burnt');
ok(Number.isFinite(exerciseBurn(day, rec, undefined).kcal), 'missing body weight uses the default');

// ----- numbers the person typed in, and the calibration
ok(validManual('45') === 45 && validManual('45,5') === 45.5 && validManual(0, 1, 600) === null && validManual('abc', 1, 600) === null && validManual(9999, 1, 600) === null && validManual('', 1, 600) === null, 'validManual accepts sane numbers only');
ok(hasManual({ manual: { minutes: 40 } }) && hasManual({ manual: { kcal: 300 } }) && !hasManual({}) && !hasManual({ manual: { minutes: 0, kcal: 'x' } }) && !hasManual(null), 'hasManual');
ok(burnFactor({}) === 1 && burnFactor({ burnCalibration: 120 }) === 1.2 && burnFactor({ burnCalibration: 10 }) === 0.5 && burnFactor({ burnCalibration: 900 }) === 1.5 && burnFactor({ burnCalibration: 'x' }) === 1, 'burnFactor is clamped to 0.5 to 1.5');
{
  const dayM = { workout: [{ id: 'a', exercise: 'Bench Press', sets: 3, reps: '10' }, { id: 'b', exercise: 'Barbell Row', sets: 3, reps: '10' }] };
  const base = { ticks: {}, sets: { a: [1, 2, 3].map(() => ({ w: 20, r: 10, done: true })), b: [1, 2, 3].map(() => ({ w: 20, r: 10, done: true })) } };
  const plain = exerciseBurn(dayM, base, 70);
  ok(plain.minutes === 15 && !plain.adjustedMinutes && !plain.adjustedKcal, 'no manual: 6 sets x 2.5 min = 15, nothing adjusted');
  const t = exerciseBurn(dayM, { ...base, manual: { minutes: 60 } }, 70);
  ok(t.minutes === 60 && t.adjustedMinutes && t.kcal === Math.round(6 * 70 * 1), 'typed minutes replace the estimate and calories follow (6 METs x 70 kg x 1 h): ' + t.kcal);
  ok(t.items.every((i) => Math.abs(i.minutes - 30) < 0.2), 'the typed time is shared between the exercises');
  const k = exerciseBurn(dayM, { ...base, manual: { kcal: 500 } }, 70);
  ok(k.kcal === 500 && k.adjustedKcal && !k.adjustedMinutes && Math.abs(k.items.reduce((a, i) => a + i.kcal, 0) - 500) <= 2, 'typed calories replace the estimate and the exercises add up to it');
  const both = exerciseBurn(dayM, { ...base, manual: { minutes: 50, kcal: 400 } }, 70);
  ok(both.minutes === 50 && both.kcal === 400, 'both typed together');
  const bad = exerciseBurn(dayM, { ...base, manual: { minutes: 99999, kcal: -5 } }, 70);
  ok(bad.minutes === plain.minutes && bad.kcal === plain.kcal && !bad.adjustedMinutes, 'silly typed numbers are ignored');
  const fa = exerciseBurn(dayM, base, 70, 1.2);
  ok(fa.kcal === Math.round(plain.kcal * 1.2) || Math.abs(fa.kcal - plain.kcal * 1.2) <= 2, 'calibration 120% raises the estimate: ' + plain.kcal + ' -> ' + fa.kcal);
  const faM = exerciseBurn(dayM, { ...base, manual: { kcal: 500 } }, 70, 1.5);
  ok(faM.kcal === 500, 'typed calories are not changed by the calibration');
  const only = exerciseBurn(dayM, { ticks: {}, sets: {}, manual: { minutes: 30 } }, 80, 1);
  ok(only.minutes === 30 && only.kcal === 200 && only.items.length === 1 && only.items[0].name === 'Workout you added', 'a day with no logged sets can still have a typed workout (30 min at 5 METs, 80 kg = 200 kcal)');
  const onlyK = exerciseBurn(dayM, { ticks: {}, sets: {}, manual: { kcal: 321 } }, 80, 1);
  ok(onlyK.kcal === 321 && onlyK.minutes === 0, 'calories alone also count');
  ok(exerciseBurn(dayM, { ticks: {}, sets: {} }, 80, 1).kcal === 0, 'nothing logged and nothing typed is still zero');
  ok(singleBurn(dayM, { ...base, manual: { kcal: 500 } }, dayM.workout[0], 70) > 0 && singleBurn(dayM, { ...base, manual: { kcal: 500 } }, dayM.workout[0], 70) < 500, 'singleBurn follows the typed total');
}

console.log(fail ? `\n${fail} failed` : '\nAll burn tests passed');
process.exit(fail ? 1 : 0);
