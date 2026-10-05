// Tests for the weekly / monthly summary. Run: node tests/summary.mjs
import { periodRange, shiftAnchor, workoutMinutes, kcalBurnt, summarize } from '../js/summary.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

// 2026-10-07 is a Wednesday
let r = periodRange('week', '2026-10-07');
ok(r.start === '2026-10-05' && r.end === '2026-10-11' && r.prevStart === '2026-09-28', 'week runs Monday to Sunday');
r = periodRange('week', '2026-10-11'); ok(r.start === '2026-10-05', 'Sunday belongs to the week that started Monday');
r = periodRange('month', '2026-02-10'); ok(r.start === '2026-02-01' && r.end === '2026-02-28' && r.prevStart === '2026-01-01' && r.prevEnd === '2026-01-31', 'month range incl. February');
ok(shiftAnchor('month', '2026-01-31', 1) === '2026-02-01', 'month shift does not skip February');
ok(shiftAnchor('week', '2026-10-07', -1) === '2026-09-30', 'week shift');

ok(kcalBurnt(60, 70) === 350, '60 min at 70 kg = 350 kcal');
ok(kcalBurnt(30, 100) === 250, '30 min at 100 kg = 250 kcal');
ok(workoutMinutes({}, 0) === 0, 'no sets, no minutes');
ok(workoutMinutes({}, 10) === 25, 'no clock: 2.5 min per set');
ok(workoutMinutes({ session: { start: 0, end: 45 * 60000 } }, 10) === 45, 'finished clock wins');
ok(workoutMinutes({ session: { start: 0, end: 20 * 3600000 } }, 10) === 240, 'runaway clock is capped');
ok(workoutMinutes({ session: { start: 0, end: null } }, 8) === 20, 'unfinished clock falls back to sets');

// A weekly plan: Monday has one exercise.
const day = { label: 'Monday Push', workout: [{ id: 'w1', exercise: 'Bench Press', sets: 2, reps: '10' }], meals: [{ id: 'm1', name: 'Lunch', items: ['x'], calories: 600, protein: 30 }], extras: { waterLiters: 0, supplements: [], notes: '' } };
const plan = { id: 'p', startDate: '2026-09-01', days: [day, { label: 'Tuesday Rest', workout: [], meals: [], extras: { waterLiters: 0, supplements: [], notes: '' } }] };
const sets = (w) => [{ w, r: 10, done: true }, { w, r: 8, done: true }];
const records = {
  '2026-09-28': { ticks: { w1: true, m1: true }, sets: { w1: sets(20) } }, // last week, Monday
  '2026-10-05': { ticks: { w1: true, m1: true }, sets: { w1: sets(25) }, session: { start: 0, end: 30 * 60000 } },
};
const s = summarize(plan, records, periodRange('week', '2026-10-07'), 80, '2026-10-07');
ok(s.workouts === 1 && s.sets === 2, 'one workout, two sets this week');
ok(s.minutes === 30 && s.kcal === 240, 'bench press (6 METs) 30 min at 80 kg = 240 kcal');
ok(s.volumeKg === 25 * 10 + 25 * 8, 'volume adds up weight x reps');
ok(s.lifts.length === 1 && s.lifts[0].gain === 5 && s.prs === 1, 'bench went 20 -> 25 kg = a PR');
ok(s.vs.minutes === 500 && s.hasPrev, 'compares with last week (5 min estimated -> 30 min = +500%)');
ok(s.avgEaten === 600 && s.avgProtein === 30, 'average eaten calories and protein');
const wlog = { '2026-10-02': 80, '2026-10-06': 79.2 };
const sw = summarize(plan, records, periodRange('week', '2026-10-07'), 80, '2026-10-07', wlog);
ok(sw.weight && sw.weight.from === 80 && sw.weight.to === 79.2 && sw.weight.delta === -0.8, 'weekly summary carries weight change from last weigh-in before the week');
ok(summarize(plan, records, periodRange('week', '2026-10-07'), 80, '2026-10-07').weight === null, 'no weight log = no weight row');
// a day with a typed workout but no logged sets, and calibration
const typedRecords = { ...records, '2026-10-06': { ticks: {}, sets: {}, manual: { minutes: 45, kcal: 380 } } };
const typed = summarize(plan, typedRecords, periodRange('week', '2026-10-07'), 80, '2026-10-07');
ok(typed.workouts === 2 && typed.minutes === 75 && typed.kcal === 240 + 380, 'a typed workout with no sets counts: ' + typed.workouts + ' workouts, ' + typed.minutes + ' min, ' + typed.kcal + ' kcal');
ok(typed.days.find((d) => d.date === '2026-10-06').adjusted === true, 'the day is marked as adjusted');
const adjusted = { ...records, '2026-10-05': { ...records['2026-10-05'], manual: { kcal: 500 } } };
ok(summarize(plan, adjusted, periodRange('week', '2026-10-07'), 80, '2026-10-07').kcal === 500, 'typed calories replace a logged day estimate');
const cal = summarize(plan, records, periodRange('week', '2026-10-07'), 80, '2026-10-07', {}, 1.25);
ok(cal.kcal === Math.round(240 * 1.25), 'calibration 125% scales the estimates: ' + cal.kcal);
const empty = summarize(plan, {}, periodRange('month', '2026-10-07'), 70, '2026-10-07');
ok(empty.workouts === 0 && empty.kcal === 0 && empty.lifts.length === 0 && empty.avgPct === null && empty.avgEaten === null, 'empty period has no NaN');
const future = summarize(plan, records, periodRange('week', '2026-10-07'), 70, '2026-10-06');
ok(future.workouts === 1, 'days up to today count');
const beforeToday = summarize(plan, records, periodRange('week', '2026-10-07'), 70, '2026-10-04');
ok(beforeToday.workouts === 0, 'future days are ignored');

console.log(fail ? `\n${fail} failed` : '\nAll summary tests passed');
process.exit(fail ? 1 : 0);
