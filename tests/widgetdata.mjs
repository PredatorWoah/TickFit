// Tests for what the Android widgets show. Run: node tests/widgetdata.mjs
import { widgetSnapshot, shortLabel, litres } from '../js/widgetdata.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

ok(shortLabel('Friday Back + Biceps') === 'Back + Biceps' && shortLabel('Tue: Legs') === 'Legs' && shortLabel('Monday') === 'Monday' && shortLabel('Week 1 Day 2: Push') === 'Week 1 Day 2: Push', 'short labels drop a leading weekday');
ok(litres(1500) === '1.5' && litres(1750) === '1.75' && litres(3000) === '3' && litres(0) === '0', 'litres');
ok(widgetSnapshot({ plans: [], progress: {} }, '2026-10-10') === null, 'no plan, no snapshot');

// 2026-10-10 is a Saturday. A weekly plan with a Saturday workout.
const E = (w) => ({ waterLiters: w, supplements: [], notes: '' });
const sat = { label: 'Saturday Back + Biceps', workout: [{ id: 'w1', exercise: 'Lat Pulldown', sets: 3, reps: '10' }, { id: 'w2', exercise: 'Hammer Curl', sets: 2, reps: '12' }], meals: [{ id: 'm1', name: 'Lunch', items: ['x'], calories: 600, protein: 30 }, { id: 'm2', name: 'Dinner', items: ['y'], calories: 400, protein: 20 }], extras: E(3) };
const other = (l) => ({ label: l, workout: [], meals: [{ id: 'm1', name: 'Lunch', items: ['x'], calories: 500, protein: 20 }], extras: E(0) });
const plan = { id: 'p', name: 'P', startDate: '2026-09-01', days: [other('Monday Rest'), other('Tuesday Rest'), other('Wednesday Rest'), other('Thursday Rest'), other('Friday Rest'), sat, other('Sunday Rest')] };
const records = {
  '2026-10-03': { ticks: { w1: true }, sets: { w1: [{ w: 40, r: 10, done: true }] } },
  '2026-10-05': { ticks: { m1: true }, sets: {} },
  '2026-10-06': { ticks: {}, sets: {} },
  '2026-10-10': { ticks: { m1: true }, sets: { w1: [{ w: 40, r: 10, done: true }, { w: 40, r: 10, done: true }, { w: 45, r: 8, done: false }] }, waterMl: 1500, session: { start: 1000, end: null } },
};
const s = widgetSnapshot({ plans: [plan], activePlanId: 'p', progress: { p: records } }, '2026-10-10');
ok(s.v === 1 && s.date === '2026-10-10' && /Sat/.test(s.dateText) && /10/.test(s.dateText) && /Oct/.test(s.dateText), 'date and date text: ' + s.dateText);
ok(s.label === 'Back + Biceps', 'label without the weekday');
ok(s.ring.total === 5 && s.ring.done === 1 && s.ring.pct === 20 && s.ring.waterItem && !s.ring.waterDone, 'ring: 1 of 5 (2 exercises, 2 meals, water): ' + JSON.stringify(s.ring));
ok(s.kcal.text === '600 / 1,000 kcal' && s.kcal.pct === 60, 'calories: ' + s.kcal.text);
ok(s.protein.text === '30 / 50 g', 'protein: ' + s.protein.text);
ok(s.water.ml === 1500 && s.water.target === 3000 && s.water.step === 250, 'water');
const w = s.workout;
ok(w.state === 'active' && w.title === 'Continue workout' && w.startMs === 1000, 'workout in progress: ' + w.title);
ok(w.nextName === 'Lat Pulldown' && w.nextTop === 'Next up · exercise 1 of 2' && w.nextDetail === '3 × 10 · last time 40 kg', 'next exercise with last weight: ' + w.nextDetail);
ok(w.setsText === '2 / 5 sets', 'sets text: ' + w.setsText);
ok(s.week.length === 7 && s.week[5].today && s.week[5].s === 'today' && s.week[6].s === 'future', 'week: Saturday is today, Sunday is still to come: ' + s.week.map((d) => d.s).join(','));
ok(s.week[0].s === 'full' && s.week[1].s === 'missed', 'Monday all done, Tuesday missed: ' + s.week[0].s + ' ' + s.week[1].s);
ok(s.lifted.kgText === '800' && /About/.test(s.lifted.fact) && /kg to /.test(s.lifted.nextText) && s.lifted.pct > 0, 'lifted this week: ' + JSON.stringify(s.lifted));

// Finished, rest day and empty week.
const done = { ...records, '2026-10-10': { ticks: { w1: true, w2: true }, sets: {}, session: { start: 0, end: 50 * 60000 } } };
const f = widgetSnapshot({ plans: [plan], activePlanId: 'p', progress: { p: done } }, '2026-10-10').workout;
ok(f.state === 'finished' && f.title === 'Workout done' && f.timeText === '50 min', 'finished workout: ' + f.sub);
const rest = widgetSnapshot({ plans: [plan], activePlanId: 'p', progress: { p: {} } }, '2026-10-11');
ok(rest.workout.state === 'rest' && rest.workout.title === 'Rest day', 'rest day');
ok(rest.lifted.kgText === '0' && /atta/.test(rest.lifted.nextText), 'nothing lifted yet points at the first milestone');
ok(JSON.stringify(s).length < 10000, 'snapshot stays small: ' + JSON.stringify(s).length + ' chars');
// Tomorrow rides along, so the widgets switch at midnight without the app.
ok(s.next && s.next.date === '2026-10-11' && s.next.workout.state === 'rest' && s.next.week[6].today && !s.next.next, 'tomorrow is in the snapshot (Sunday, a rest day), one level deep');
ok(s.next.streak >= 0 && s.next.ring.done === 0, 'tomorrow starts with nothing ticked');

// Water from the widget's + button lands on the right day of the active plan; junk is ignored.
const { importBackup, getState } = await import('../js/store.js');
const { validatePlan } = await import('../js/parser.js');
const { applyPendingWater } = await import('../js/widgets.js');
importBackup({ app: 'tickfit', data: { plans: [plan], activePlanId: 'p', progress: { p: { '2026-10-10': { ticks: {}, sets: {}, waterMl: 500 } } } } }, validatePlan);
ok(applyPendingWater({ '2026-10-10': 500, '2026-10-09': 250, 'junk': 999, '2026-10-08': -5 }) === true, 'pending water applied');
const prog = getState().progress.p;
ok(prog['2026-10-10'].waterMl === 1000 && prog['2026-10-09'].waterMl === 250 && !prog['2026-10-08'] && !prog.junk, 'added to the right days, junk ignored');
ok(applyPendingWater({}) === false && applyPendingWater(null) === false, 'nothing pending changes nothing');
ok(applyPendingWater({ '2026-10-07': 999999 }) && getState().progress.p['2026-10-07'].waterMl === 20000, 'a silly amount is capped');

console.log(fail ? `\n${fail} failed` : '\nAll widget data tests passed');
process.exit(fail ? 1 : 0);
