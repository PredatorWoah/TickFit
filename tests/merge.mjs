// Tests for bringing one plan's progress into another. Run: node tests/merge.mjs
import { mergeProgress, hasProgress, loggedDays } from '../js/merge.js';
import { dayFor } from '../js/schedule.js';
import { dayStats, currentStreak } from '../js/stats.js';
import { bestLifts } from '../js/summary.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const E = (s = []) => ({ waterLiters: 3, supplements: s, notes: '' });
const ex = (id, n) => ({ id, exercise: n, sets: 3, reps: '10', weight: '', rest: '', notes: '', video: '' });
const meal = (id, n) => ({ id, name: n, items: [n], calories: 500, protein: 20 });

ok(!hasProgress(null) && !hasProgress({ ticks: {}, sets: { w1: [{ done: false }] } }) && hasProgress({ ticks: { m1: true } }) && hasProgress({ waterMl: 250 }) && hasProgress({ notes: 'tired' }), 'what counts as progress');

// Old plan: a 2 day cycle. New plan: a weekly plan where w1 is a DIFFERENT exercise.
const old = { id: 'old', startDate: '2026-09-01', days: [{ label: 'Push', workout: [ex('w1', 'Bench Press'), ex('w2', 'Tricep Pushdown')], meals: [meal('m1', 'Poha')], extras: E(['Creatine 5g']) }, { label: 'Rest', workout: [], meals: [meal('m1', 'Poha')], extras: E() }] };
const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => ({ label: `${d} Legs`, workout: [ex('w1', 'Squat'), ex('w2', 'Bench Press')], meals: [meal('m1', 'Dal rice')], extras: E(['Creatine 5g']) }));
const neu = { id: 'new', startDate: '2026-10-08', days: week };

const oldRecords = {
  '2026-10-01': { ticks: { w1: true, m1: true, s1: true }, sets: { w1: [{ w: 40, r: 10, done: true }, { w: 40, r: 8, done: true }], w2: [{ w: 15, r: 12, done: false }] }, waterMl: 2000, notes: 'good day', session: { start: 1, end: 2 } },
  '2026-10-02': { ticks: { m1: true }, sets: {} },
  '2026-10-03': { ticks: {}, sets: {} }, // nothing done: not copied
  '2026-10-09': { ticks: { m1: true }, sets: {} }, // the new plan already has this day
};
const newRecords = { '2026-10-09': { ticks: { w1: true }, sets: {} } };
const before = JSON.stringify(oldRecords);

ok(loggedDays(oldRecords) === 3, 'old plan has 3 logged days');
const r = mergeProgress(old, oldRecords, neu, newRecords);
ok(r.copied === 2 && r.skipped === 1 && r.earliest === '2026-10-01', 'copied 2, kept the 1 that already had progress: ' + JSON.stringify(r));
ok(JSON.stringify(oldRecords) === before, 'the old plan keeps its own copy, untouched');
ok(newRecords['2026-10-09'].ticks.w1 === true && !newRecords['2026-10-09'].ticks.m1, "a day already logged in the new plan isn't overwritten");
ok(!newRecords['2026-10-03'], 'empty days are not copied');

// 2026-10-01: Bench Press + Tricep Pushdown in the old plan. The new plan's own "w1" is Squat.
const d1 = dayFor(neu, '2026-10-01');
ok(d1.workout.map((w) => w.exercise).join(',') === 'Bench Press,Tricep Pushdown', 'the copied day shows the exercises it really had: ' + d1.workout.map((w) => w.exercise));
const bench = d1.workout[0];
const rec1 = newRecords['2026-10-01'];
ok(bench.id === 'w2' && rec1.ticks.w2 === true && !rec1.ticks.w1, "Bench Press reuses the new plan's own Bench Press (w2), and Squat is NOT ticked");
ok(rec1.sets.w2.length === 2 && rec1.sets.w2[0].w === 40, 'logged sets moved with it');
const tricep = d1.workout[1];
ok(tricep.id.startsWith('lx-') && neu.library.exercises.some((x) => x.id === tricep.id && x.exercise === 'Tricep Pushdown'), 'an exercise the new plan lacks is copied into its library: ' + tricep.id);
ok(rec1.sets[tricep.id] && rec1.sets[tricep.id][0].done === false, 'and keeps its sets');
ok(d1.meals[0].name === 'Poha' && rec1.ticks[d1.meals[0].id] === true, 'meals carried over and ticked');
ok(rec1.ticks.s1 === true, 'same supplement in the same place: tick kept');
ok(rec1.waterMl === 2000 && rec1.notes === 'good day' && rec1.session.end === 2, 'water, notes and the workout clock come along');
const oldStats = dayStats(dayFor(old, '2026-10-01'), oldRecords['2026-10-01']);
const newStats = dayStats(d1, rec1);
ok(newStats.done === 3 && newStats.done === oldStats.done && newStats.total === oldStats.total, `the day counts the same as in the old plan: ${newStats.done}/${newStats.total} vs ${oldStats.done}/${oldStats.total}`);

// The old rest day: the new plan shows it as a rest day too (no Squat to "miss").
const d2 = dayFor(neu, '2026-10-02');
ok(d2.workout.length === 0 && d2.meals[0].name === 'Poha', 'a rest day stays a rest day');

// Start date moves back so the history counts, and the weekly plan keeps following the real weekdays.
ok(neu.startDate === '2026-10-01', 'start date moved back to the first copied day: ' + neu.startDate);
ok(bestLifts(neu, newRecords, '2026-10-01', '2026-10-09').get('bench press').w === 40, 'lifting history (by name) carries on');

// Running it again changes nothing.
const again = mergeProgress(old, oldRecords, neu, newRecords);
ok(again.copied === 0 && again.skipped === 3, 'merging twice is harmless: ' + JSON.stringify(again));

// A cycle plan moves back by whole cycles, so today is still the same plan day.
const cyc = { id: 'c', startDate: '2026-10-08', days: [0, 1, 2].map((i) => ({ label: `Day ${i + 1}`, workout: [ex('w1', 'Row')], meals: [], extras: E() })) };
const todayLabel = dayFor(cyc, '2026-10-10').label;
mergeProgress(old, { '2026-10-01': oldRecords['2026-10-01'] }, cyc, {});
ok(cyc.startDate <= '2026-10-01' && dayFor(cyc, '2026-10-10').label === todayLabel, `cycle start moved back by whole cycles (${cyc.startDate}), today is still ${todayLabel}`);

// Streak counts merged days.
const streakRecs = { '2026-10-08': { ticks: { m1: true } }, '2026-10-09': { ticks: { m1: true } } };
const plainOld = { id: 'o2', startDate: '2026-10-01', days: [{ label: 'X', workout: [], meals: [meal('m1', 'Oats')], extras: { waterLiters: null, supplements: [], notes: '' } }] };
const plainNew = { id: 'n2', startDate: '2026-10-10', days: [{ label: 'Y', workout: [], meals: [meal('m1', 'Eggs')], extras: { waterLiters: null, supplements: [], notes: '' } }] };
const nr = { '2026-10-10': { ticks: { m1: true } } };
mergeProgress(plainOld, streakRecs, plainNew, nr);
ok(currentStreak(plainNew, nr, '2026-10-10') === 3, 'the streak carries on across the switch: ' + currentStreak(plainNew, nr, '2026-10-10'));

console.log(fail ? `\n${fail} failed` : '\nAll merge tests passed');
process.exit(fail ? 1 : 0);
