// Tests for set logging. Run: node tests/logging.mjs
import { workoutMs, rowsFor, saveRows, toggleExercise, startSession, finishSession, reopenSession, sessionState, sessionMs, workoutSummary, estimateMinutes, nextExercise, formatDuration } from '../js/logging.js';
import { weightNumber, repsTarget, exerciseProgress, lastPerformance, formatSets, plannedSets } from '../js/stats.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// targets
eq('weight "20 kg"', weightNumber('20 kg'), 20);
eq('weight 22.5', weightNumber(22.5), 22.5);
eq('weight "12,5"', weightNumber('12,5'), 12.5);
eq('weight bodyweight', weightNumber('bodyweight'), null);
eq('weight empty', weightNumber(''), null);
eq('reps "12"', repsTarget('12'), 12);
eq('reps "8 to 10" takes upper', repsTarget('8 to 10'), 10);
eq('reps "10 each leg"', repsTarget('10 each leg'), 10);
eq('reps "30 sec" is not a rep count', repsTarget('30 sec'), null);
eq('reps "1 min"', repsTarget('1 min'), null);
eq('reps "45s"', repsTarget('45s'), null);
eq('reps empty', repsTarget(''), null);
eq('planned sets default 1', plannedSets({}), 1);
eq('planned sets 3', plannedSets({ sets: 3 }), 3);

const ex = { id: 'w1', exercise: 'Bench Press', sets: 3, reps: '8 to 10', weight: '20 kg' };

// fresh rows come from the plan target
eq('fresh rows use plan target', rowsFor({}, ex, null), [{ w: 20, r: 10, done: false }, { w: 20, r: 10, done: false }, { w: 20, r: 10, done: false }]);
// ... or from last time
const last = { date: '2026-09-28', sets: [{ w: 22.5, r: 10 }, { w: 22.5, r: 9 }] };
eq('rows prefill from last time (extra sets repeat the last one)', rowsFor({}, ex, last), [{ w: 22.5, r: 10, done: false }, { w: 22.5, r: 9, done: false }, { w: 22.5, r: 9, done: false }]);
// legacy single weight + tick
eq('old record: tick means all sets done, weight reused', rowsFor({ ticks: { w1: true }, weights: { w1: 25 } }, ex, null).map((s) => [s.w, s.done]), [[25, true], [25, true], [25, true]]);
eq('old tick progress', exerciseProgress(ex, { ticks: { w1: true } }), { done: 3, total: 3 });
eq('no record progress', exerciseProgress(ex, {}), { done: 0, total: 3 });

// ticking sets drives the exercise tick
const rec = { ticks: {}, sets: {}, weights: {} };
let rows = rowsFor(rec, ex, null);
rows[0].done = true; saveRows(rec, ex, rows);
eq('one set done is not exercise done', [!!rec.ticks.w1, exerciseProgress(ex, rec)], [false, { done: 1, total: 3 }]);
rows[1].done = true; rows[2].done = true; saveRows(rec, ex, rows);
eq('all sets done ticks the exercise', rec.ticks.w1, true);
rows[2].done = false; saveRows(rec, ex, rows);
eq('un-ticking a set clears the exercise tick', rec.ticks.w1, undefined);

// quick toggle
const r2 = { ticks: {}, sets: {}, weights: {} };
toggleExercise(r2, ex, null);
eq('quick tick marks all sets done', [r2.ticks.w1, r2.sets.w1.every((s) => s.done), r2.sets.w1.length], [true, true, 3]);
toggleExercise(r2, ex, null);
eq('quick tick again undoes all, keeps values', [r2.ticks.w1, r2.sets.w1.some((s) => s.done), r2.sets.w1[0].w], [undefined, false, 20]);
// exercise with 0/undefined sets still has one row
eq('exercise with no sets has one row', rowsFor({}, { id: 'x', exercise: 'Walk' }, null).length, 1);
// editing a value keeps it
const r3 = { ticks: {}, sets: { w1: [{ w: 30, r: 5, done: true }] }, weights: {} };
eq('saved sets win over targets', rowsFor(r3, ex, last), [{ w: 30, r: 5, done: true }]);

// lastPerformance across different days (ids differ per day, matched by name)
const day = (ex2) => ({ label: 'd', workout: ex2, meals: [], extras: { waterLiters: null, supplements: [], notes: '' } });
const plan = { id: 'p', startDate: '2026-09-01', days: [day([{ id: 'w1', exercise: 'Bench Press' }]), day([{ id: 'w7', exercise: 'bench  press' }])] };
const records = {
  '2026-09-28': { sets: { w1: [{ w: 20, r: 12, done: true }, { w: 20, r: 12, done: true }, { w: 20, r: 10, done: false }] } }, // day idx (27 % 2) = 1 -> id w7!
  '2026-09-27': { sets: { w1: [{ w: 20, r: 12, done: true }, { w: 20, r: 12, done: true }, { w: 20, r: 10, done: true }] } },
};
// 2026-09-27 is day index 26 % 2 = 0 -> id w1; 2026-09-28 is idx 1 -> id w7, so its w1 data is ignored (wrong id) as expected
eq('last performance finds the most recent matching day by name', lastPerformance(plan, records, '2026-10-02', 'Bench Press'), { date: '2026-09-27', sets: [{ w: 20, r: 12 }, { w: 20, r: 12 }, { w: 20, r: 10 }] });
eq('last performance ignores unfinished sets', lastPerformance(plan, { '2026-09-27': { sets: { w1: [{ w: 20, r: 12, done: false }] } } }, '2026-10-02', 'Bench Press'), null);
eq('last performance none', lastPerformance(plan, {}, '2026-10-02', 'Bench Press'), null);
eq('last performance uses legacy weight', lastPerformance(plan, { '2026-09-27': { ticks: { w1: true }, weights: { w1: 17.5 } } }, '2026-10-02', 'Bench Press'), { date: '2026-09-27', sets: [{ w: 17.5, r: null }] });
eq('format identical sets folds', formatSets([{ w: 20, r: 12 }, { w: 20, r: 12 }, { w: 20, r: 12 }]), '3 sets of 20 × 12');
eq('format mixed sets', formatSets([{ w: 20, r: 12 }, { w: 20, r: 10 }]), '20 × 12, 20 × 10');
eq('format weight only', formatSets([{ w: 17.5, r: null }]), '17.5 kg');


// ----- workout sessions
const rs = {};
eq('new record is idle', sessionState(rs), 'idle');
eq('idle has no time', sessionMs(rs, 5000), 0);
startSession(rs, 1000);
eq('after start it is active', sessionState(rs), 'active');
eq('clock runs from the start', sessionMs(rs, 61000), 60000);
finishSession(rs, 121000);
eq('after finish it is finished', sessionState(rs), 'finished');
eq('finished clock stops', [sessionMs(rs, 121000), sessionMs(rs, 999999)], [120000, 120000]);
reopenSession(rs);
eq('reopening makes it active again', sessionState(rs), 'active');
const rf = {}; finishSession(rf, 500);
eq('finishing without starting still works (zero length)', [sessionState(rf), sessionMs(rf, 900)], ['finished', 0]);
eq('duration m:ss', formatDuration(83000), '1:23');
eq('duration h:mm:ss', formatDuration(3725000), '1:02:05');
eq('duration zero', formatDuration(0), '0:00');

const wd = { workout: [{ id: 'w1', exercise: 'A', sets: 3 }, { id: 'w2', exercise: 'B', sets: 2 }, { id: 'w3', exercise: 'C', sets: 2 }] };
const wr = { ticks: { w1: true }, weights: {}, sets: { w1: [{ w: 20, r: 10, done: true }, { w: 20, r: 10, done: true }, { w: 22.5, r: 8, done: true }], w2: [{ w: 40, r: 10, done: true }, { w: 40, r: 10, done: false }] } };
const sum = workoutSummary(wd, wr);
eq('summary sets done / total', [sum.setsDone, sum.setsTotal], [4, 7]);
eq('summary exercises done', [sum.exercisesDone, sum.exercisesTotal], [1, 3]);
eq('summary volume counts only done sets (20*10 + 20*10 + 22.5*8 + 40*10)', sum.volumeKg, 200 + 200 + 180 + 400);
eq('next exercise is the first not done', nextExercise(wd, wr).id, 'w2');
eq('next exercise is null when everything is done', nextExercise(wd, { ticks: { w1: true, w2: true, w3: true } }), null);
eq('estimate: 7 sets is about 15-20 min, never under 10', [estimateMinutes(wd) >= 10, estimateMinutes(wd) % 5], [true, 0]);
eq('estimate floors at 10 minutes', estimateMinutes({ workout: [{ id: 'x', exercise: 'x', sets: 1 }] }), 10);
eq('old tick-only record still counts as done sets', workoutSummary({ workout: [{ id: 'w1', exercise: 'A', sets: 3 }] }, { ticks: { w1: true } }).setsDone, 3);

// workout time shown: a typed time wins over the stopwatch
eq('workoutMs uses the stopwatch', workoutMs({ session: { start: 0, end: 90 * 60000 } }), 90 * 60000);
eq('workoutMs prefers typed minutes', workoutMs({ session: { start: 0, end: 90 * 60000 }, manual: { minutes: 45 } }), 45 * 60000);
eq('workoutMs ignores silly typed minutes', workoutMs({ session: { start: 0, end: 10 * 60000 }, manual: { minutes: 99999 } }), 10 * 60000);
eq('workoutMs with nothing is 0', workoutMs({}), 0);
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
