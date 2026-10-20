// The shortcuts that keep taps quick on phones must give exactly the same answers. Run: node tests/speed.mjs
import { localDate, fromStr, addDays } from '../js/dates.js';
import { weeklyWeekdays, dayFor } from '../js/schedule.js';
import { bestBefore } from '../js/gym.js';
import { lastPerformance } from '../js/stats.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

// ----- cached date formatters read the same as toLocaleDateString
const dates = ['2026-01-01', '2026-02-28', '2026-10-20', '2027-12-31'].map(fromStr);
const optsList = [{ weekday: 'long' }, { weekday: 'narrow' }, { day: 'numeric', month: 'long' }, { weekday: 'short', day: 'numeric', month: 'short' }, { month: 'long', year: 'numeric' }, {}];
ok(dates.every((d) => optsList.every((o) => localDate(d, o, 'en') === d.toLocaleDateString('en', o))), 'localDate matches toLocaleDateString for every format the app uses');
ok(localDate(dates[0], { weekday: 'long' }) === localDate(dates[0], { weekday: 'long' }, 'en'), 'English is the default');

// ----- the weekly plan check is remembered, but notices a renamed day
const plan = { id: 'p', startDate: '2026-01-05', days: ['Monday', 'Tuesday', 'Wednesday'].map((label) => ({ label, workout: [], meals: [], extras: { supplements: [] } })) };
ok(JSON.stringify(weeklyWeekdays(plan)) === '[0,1,2]', 'weekday plan found');
ok(JSON.stringify(weeklyWeekdays(plan)) === '[0,1,2]', 'and found again from memory');
const got = weeklyWeekdays(plan);
got.push(9);
ok(JSON.stringify(weeklyWeekdays(plan)) === '[0,1,2]', 'changing the returned list cannot spoil the memory');
plan.days[2].label = 'Leg day';
ok(weeklyWeekdays(plan) === null, 'renaming a day to a non-weekday is noticed at once');
plan.days[2].label = 'Wednesday';
ok(JSON.stringify(weeklyWeekdays(plan)) === '[0,1,2]', 'and renaming it back too');

// ----- history lookups: only logged days are read, the answers are the same as walking every day
const ex = (id, exercise) => ({ id, exercise, sets: 3, reps: '8 to 12' });
const p2 = { id: 'q', startDate: '2026-01-01', days: [{ label: 'Day 1', workout: [ex('a', 'Bench Press'), ex('b', 'Row')], meals: [], extras: { supplements: [] } }] };
const records = {};
for (let i = 0; i < 60; i += 3) {
  const d = addDays('2026-01-01', i);
  records[d] = { ticks: {}, sets: { a: [{ w: 40 + i, r: 8, done: true }, { w: 40 + i, r: 6, done: false }], b: i % 2 ? [{ w: 30, r: 10, done: true }] : [] } };
}
records['2025-12-30'] = { sets: { a: [{ w: 500, r: 5, done: true }] } }; // before the plan started: never counts
records['2026-03-30'] = { sets: { a: [{ w: 999, r: 5, done: true }] } }; // after the day asked about: never counts
const best = bestBefore(p2, records, '2026-03-01', 'bench  press');
ok(best && best.w === 97 && best.date === '2026-02-27', 'best bench before 1 March is the latest, heaviest set: ' + JSON.stringify(best));
ok(bestBefore(p2, records, '2026-01-01', 'Bench Press') === null, 'nothing before the first day');
records['2026-02-28'] = { sets: { a: [{ w: 120, r: 8, done: true }] } };
await Promise.resolve();
ok(bestBefore(p2, records, '2026-03-01', 'Bench Press').w === 120, 'a set logged since is seen on the next update');
const last = lastPerformance(p2, records, '2026-03-01', 'Row');
ok(last && last.date === '2026-02-27' && last.sets[0].w === 30, 'last time you rowed is the most recent day with a row: ' + JSON.stringify(last));
ok(lastPerformance(p2, records, '2026-01-02', 'Row', 1) === null, 'looking back one day finds nothing');
ok(dayFor(p2, '2026-02-01').workout.length === 2, 'plan days still resolve');

if (fail) {
  console.log(`\n${fail} failed`);
  process.exit(1);
}
console.log('\nall passed');
