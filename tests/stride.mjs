// Workouts from Stride replace the exercises on their dates, and nothing else. Run: node tests/stride.mjs
import { readStride, previewStride, applyStride, describeRow, strideAsPlan, isStrideExport, shortLabel, retargetStride, onlyDates } from '../js/stride.js';
import { resetPick } from '../js/library.js';
import { parsePlanText } from '../js/parser.js';
import { dayFor } from '../js/schedule.js';
import { lastPerformance } from '../js/stats.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ----- a file exactly as Stride 0.1.0 writes it
const ex = (name, sets = 2, reps = '8–12', rest = '90 sec') => ({ id: 'stride-' + name.toLowerCase().replace(/[^a-z0-9]/g, ''), exercise: name, sets, reps, weight: '', rest, notes: 'Start with 2–3 reps in reserve.', video: '' });
const day = (date, label, workout) => ({ date, label, workout, meals: [], extras: { waterLiters: null, supplements: [], notes: '' } });
const week = {
  app: 'tickfit', format: 'stride-workout', version: 1, scope: 'week',
  plan: { name: 'Stride · Weekly plan', startDate: '2026-11-13', days: [
    day('2026-11-13', 'Upper body', [ex('Dumbbell bench press'), ex('One-arm dumbbell row'), ex('Dead bug', 2, '6–10 / side')]),
    day('2026-11-14', 'Lower body', [ex('Dumbbell goblet squat'), ex('Dumbbell Romanian deadlift')]),
    day('2026-11-15', 'Cardio', [ex('Brisk walk', 1, '50 min', '')]),
    day('2026-11-16', 'Rest', []),
  ] },
};

// ----- the TickFit plan it goes into: a weekly split with meals and a Machine / No machine slot
const raw = { name: 'Split', days: ['Monday Chest', 'Tuesday Back', 'Wednesday Legs', 'Thursday Arms', 'Friday Back + Triceps', 'Saturday Leg Day', 'Sunday Rest'].map((label, i) => ({
  label,
  workout: i === 6 ? [] : [{ exercise: `${label} press`, sets: 3, reps: '8 to 12', version: 'Machine', alternatives: [{ version: 'No machine', exercise: `${label} push up` }] }, { exercise: `${label} row`, sets: 3, reps: '10' }],
  meals: [{ name: 'Lunch', time: '1:00 PM', items: ['Dal', 'Rice'] }],
})) };
const plan = parsePlanText(JSON.stringify(raw)).plan;
plan.startDate = '2026-11-01';
const TODAY = '2026-11-13'; // a Friday
const records = {};

ok(isStrideExport(week) && !isStrideExport(raw), 'a Stride export is recognised, a normal plan is not');
const s = readStride(JSON.stringify(week, null, 2));
ok(s && s.scope === 'week' && s.days.length === 4 && s.errors.length === 0, 'the week is read, every day kept');
ok(s.days[0].workout[2].reps === '6–10 / side' && s.days[2].workout[0].reps === '50 min', 'reps are kept as written');
ok(readStride('{"name":"x","days":[]}') === null && readStride('not json') === null, 'other files are left to the normal import');

const mealsBefore = JSON.stringify(dayFor(plan, '2026-11-14').meals);
const fridayBefore = dayFor(plan, '2026-11-13').workout.map((w) => w.exercise);
const preview = previewStride(plan, records, s, TODAY);
ok(eq(preview.map((r) => r.action), ['replace', 'replace', 'replace', 'clear']), 'preview: three days replaced, the rest day clears Monday');
ok(/replaces 2 exercises now/.test(describeRow(preview[0])) && /removes the 2 exercises/.test(describeRow(preview[3])), 'the preview says what changes');
ok(eq(dayFor(plan, '2026-11-13').workout.map((w) => w.exercise), fridayBefore), 'a preview changes nothing');

const r = applyStride(plan, records, s, TODAY);
ok(eq(r.changed, ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']), 'all four dates changed');
ok(eq(dayFor(plan, '2026-11-13').workout.map((w) => w.exercise), ['Dumbbell bench press', 'One-arm dumbbell row', 'Dead bug']), 'Friday now has exactly the Stride exercises, the old ones are gone');
ok(dayFor(plan, '2026-11-13').workout[0].sets === 2 && dayFor(plan, '2026-11-13').workout[0].rest === '90 sec', 'with Stride\'s sets and rest');
ok(dayFor(plan, '2026-11-16').workout.length === 0, 'the Stride rest day cleared Monday\'s exercises');
ok(JSON.stringify(dayFor(plan, '2026-11-14').meals) === mealsBefore, 'meals are untouched');
ok(dayFor(plan, '2026-11-20').workout[0].exercise === 'Friday Back + Triceps press' && dayFor(plan, '2026-11-20').workout[0].alternatives, 'next Friday still follows the plan, versions and all');
ok(dayFor(plan, '2026-11-12').workout.length === 2, 'the day before is untouched');
const libCount = plan.library.exercises.length;
ok(libCount === 6 && plan.library.exercises.every((x) => x.from === 'stride' && /^lx-/.test(x.id) && x.category), 'Stride exercises are filed in the plan library with a category');

// importing the same week again changes nothing and adds nothing
const again = applyStride(plan, records, readStride(JSON.stringify(week)), TODAY);
ok(again.changed.length === 0 && again.kept.every((k) => k.action === 'same') && plan.library.exercises.length === libCount, 'the same file twice is a no-op');

// a newer Stride day with 3 sets: a new library entry, the older dates keep theirs
const next = { ...week, scope: 'day', plan: { ...week.plan, days: [day('2026-11-17', 'Upper body', [ex('Dumbbell bench press', 3)])] } };
applyStride(plan, records, readStride(JSON.stringify(next)), TODAY);
ok(dayFor(plan, '2026-11-17').workout[0].sets === 3 && dayFor(plan, '2026-11-13').workout[0].sets === 2, 'a changed prescription does not rewrite earlier dates');

// logged and past days are never touched
const logged = parsePlanText(JSON.stringify(raw)).plan;
logged.startDate = '2026-11-01';
const w1 = dayFor(logged, '2026-11-13').workout[0].id;
const recs = { '2026-11-13': { ticks: {}, sets: { [w1]: [{ w: 40, r: 10, done: true }] } } };
const withPast = { ...week, plan: { ...week.plan, days: [day('2026-11-12', 'Upper body', [ex('Push-up')]), ...week.plan.days] } };
const res = applyStride(logged, recs, readStride(JSON.stringify(withPast)), TODAY);
ok(eq(res.kept, [{ date: '2026-11-12', action: 'past' }, { date: '2026-11-13', action: 'logged' }]), 'a past day and a day with logged sets are kept');
ok(dayFor(logged, '2026-11-13').workout[0].id === w1 && lastPerformance(logged, recs, '2026-11-20', dayFor(logged, '2026-11-13').workout[0].exercise), 'the logged day still shows what you did');

// broken or odd files
const bad = readStride(JSON.stringify({ ...week, version: 2 }));
ok(bad && /version 2/.test(bad.errors[0]), 'a newer Stride format is refused with a clear message');
const noDate = readStride(JSON.stringify({ ...week, plan: { ...week.plan, days: [{ label: 'x', workout: [] }, week.plan.days[0]] } }));
ok(noDate.days.length === 1 && /no date/.test(noDate.errors[0]), 'days without a date are left out, and it says so');
const twice = readStride(JSON.stringify({ ...week, plan: { ...week.plan, days: [week.plan.days[0], { ...week.plan.days[1], date: '2026-11-13' }] } }));
ok(/twice/.test(twice.errors[0]) && previewStride(plan, {}, twice, TODAY).length === 1 && previewStride(plan, {}, twice, TODAY)[0].label === 'Lower body', 'a date given twice: the last one wins');

// no plan yet: a Stride file can still become a plan
const own = parsePlanText(JSON.stringify(strideAsPlan(s)));
ok(own.ok && own.plan.days.length === 4 && own.plan.startDate === '2026-11-13', 'a Stride file can be imported as a plan of its own');


// ----- the day takes Stride's name
ok(shortLabel('Chest · Upper + Chest · Middle + Chest · Lower + Triceps') === 'Chest + Triceps' && shortLabel('Shoulders + Core') === 'Shoulders + Core' && shortLabel('') === 'Workout', 'Stride names are shortened for the heading');
const named = parsePlanText(JSON.stringify(raw)).plan;
named.startDate = '2026-11-01';
const chestDay = { ...week, scope: 'day', plan: { ...week.plan, days: [day('2026-11-13', 'Chest · Upper + Chest · Middle + Shoulders', [ex('Incline Chest Press Machine'), ex('Shoulder Press Machine')])] } };
applyStride(named, {}, readStride(JSON.stringify(chestDay)), TODAY);
ok(dayFor(named, '2026-11-13').label === 'Chest + Shoulders', 'a replaced day shows Stride\'s name, not "Friday Back + Triceps"');
ok(dayFor(named, '2026-11-20').label === 'Friday Back + Triceps', 'next Friday keeps the plan\'s name');
const restored = parsePlanText(JSON.stringify(named)).plan;
ok(dayFor(restored, '2026-11-13').label === 'Chest + Shoulders', 'the name survives a backup and restore');
resetPick(named, '2026-11-13', 'workout');
ok(dayFor(named, '2026-11-13').label === 'Friday Back + Triceps' && !(named.picks && named.picks['2026-11-13']), 'going back to the plan\'s exercises brings back the plan\'s name');

// a day imported before names existed (2.7.0), already trained: only the name is fixed, the logs stay
const legacy = parsePlanText(JSON.stringify(raw)).plan;
legacy.startDate = '2026-11-01';
applyStride(legacy, {}, readStride(JSON.stringify(chestDay)), TODAY);
delete legacy.picks['2026-11-13'].label;
const firstId = dayFor(legacy, '2026-11-13').workout[0].id;
const trained = { '2026-11-13': { ticks: {}, sets: { [firstId]: [{ w: 30, r: 10, done: true }] } } };
const fix = previewStride(legacy, trained, readStride(JSON.stringify(chestDay)), TODAY);
ok(fix[0].action === 'rename' && /takes this name/.test(describeRow(fix[0])), 'an older import with the same exercises is offered a rename, even after training');
const ids = JSON.stringify(legacy.picks['2026-11-13'].workout);
applyStride(legacy, trained, readStride(JSON.stringify(chestDay)), TODAY);
ok(dayFor(legacy, '2026-11-13').label === 'Chest + Shoulders' && JSON.stringify(legacy.picks['2026-11-13'].workout) === ids, 'rename changes the name and nothing else');

// ----- one day out of a week, and a day file put on another date
const fullWeek = readStride(JSON.stringify(week));
const justOne = onlyDates(fullWeek, ['2026-11-14']);
ok(justOne.days.length === 1 && justOne.days[0].label === 'Lower body', 'onlyDates keeps just the ticked days');
const pickOne = parsePlanText(JSON.stringify(raw)).plan;
pickOne.startDate = '2026-11-01';
const one = applyStride(pickOne, {}, justOne, TODAY);
ok(eq(one.changed, ['2026-11-14']) && !pickOne.picks['2026-11-13'] && !pickOne.picks['2026-11-15'], 'only that one day of the week changes');
const moved = retargetStride(readStride(JSON.stringify(chestDay)), '2026-11-17');
ok(moved.days[0].date === '2026-11-17' && moved.days[0].from === '2026-11-13', 'a day file can go onto another date');
ok(retargetStride(fullWeek, '2026-11-17') === fullWeek, 'a week file is never moved');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
