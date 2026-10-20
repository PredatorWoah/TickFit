// Plans made from a document full of OPTIONS (an AI puts them in "library") and days that only name what they
// are about. These used to show every day as a "Rest day". Run: node tests/optiondays.mjs
import { parsePlanText } from '../js/parser.js';
import { dayFor } from '../js/schedule.js';
import { dayStats, pctFor, currentStreak } from '../js/stats.js';
import { savePick, candidates } from '../js/library.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const six = (cat) => Array.from({ length: 6 }, (_, i) => ({ exercise: `${cat} move ${i + 1}`, sets: 3, reps: '10' }));
const notes = (n) => ({ waterLiters: 3, supplements: [], notes: n });
// Shaped like what Claude, ChatGPT and Gemini returned: options by muscle group, days with a name and notes only
const res = parsePlanText(JSON.stringify({
  name: 'Weekly split',
  library: {
    exercises: { Chest: six('Chest'), Triceps: six('Triceps'), Back: six('Back'), Biceps: six('Biceps'), Shoulders: six('Shoulders'), Abs: six('Abs'), Legs: six('Legs') },
    meals: { Breakfast: [{ name: 'Poha', items: ['poha'] }, { name: 'Oats', items: ['oats'] }], Lunch: [{ name: 'Dal rice', items: ['dal', 'rice'] }], Dinner: [{ name: 'Paneer roti', items: ['paneer', 'roti'] }] },
  },
  days: [
    { label: 'Monday Chest + Triceps', extras: notes('') },
    { label: 'Tuesday Back + Biceps', extras: notes('') },
    { label: 'Wednesday Shoulders + Abs', extras: notes('Finish: 25 min incline walk.') },
    { label: 'Thursday Chest + Biceps', extras: notes('Finish: 15 min incline walk.') },
    { label: 'Friday Back + Triceps', extras: notes('') },
    { label: 'Saturday Leg Day', extras: notes('The big calorie burner.') },
    { label: 'Sunday Rest', extras: notes('') },
  ],
}));
ok(res.ok, 'the plan imports: ' + res.errors.join(' '));
ok(res.warnings.some((w) => /7 days have no exercises of their own/.test(w)), 'the import says those days get filled from the options');
const plan = { ...res.plan, id: 'p', startDate: '2026-10-12' };
const wed = dayFor(plan, '2026-10-14');
ok(wed.workout.length === 8 && wed.workout.every((w) => ['Shoulders', 'Abs'].includes(w.category)), 'Wednesday Shoulders + Abs gets 4 shoulder and 4 abs exercises: ' + wed.workout.map((w) => w.exercise).join(', '));
ok(wed.suggested === true, 'and is marked as suggested');
ok(wed.extras.notes.includes('25 min incline walk'), 'its notes stay');
const sat = dayFor(plan, '2026-10-17');
ok(sat.workout.length === 6 && sat.workout.every((w) => w.category === 'Legs'), '"Saturday Leg Day" matches Legs and gets 6');
const sun = dayFor(plan, '2026-10-18');
ok(sun.workout.length === 0, '"Sunday Rest" stays a rest day');
ok(sun.meals.map((m) => m.name).join(',') === 'Poha,Dal rice,Paneer roti', 'every day gets one meal of each kind: ' + sun.meals.map((m) => m.name).join(','));
ok(dayStats(wed, { ticks: {}, sets: {} }).total > 8, 'the day counts toward progress (exercises and meals to tick)');
ok(new Set(wed.workout.map((w) => w.id)).size === 8 && wed.workout.every((w) => /^lx-/.test(w.id)), 'items keep their library ids, so ticks stay attached');
ok(candidates(plan, '2026-10-14', 'workout').filter((c) => c.source === 'day').length === 8, 'the picker starts with the suggested ones chosen');
savePick(plan, '2026-10-14', 'workout', candidates(plan, '2026-10-14', 'workout').filter((c) => c.category === 'Abs').slice(0, 2));
ok(dayFor(plan, '2026-10-14').workout.length === 2 && dayFor(plan, '2026-10-21').workout.length === 8, 'choosing your own still wins for that date only');

// "exercises" instead of "workout" on a day (a common AI slip) is read too
const alias = parsePlanText(JSON.stringify({ name: 'x', days: [{ label: 'Day 1', exercises: [{ name: 'Squat', sets: 3, reps: '8' }], meals: [] }] }));
ok(alias.ok && alias.plan.days[0].workout[0].exercise === 'Squat', 'a day\'s "exercises" list is read as its workout');

// 1.7.0: those suggested days used to be "rest days" with nothing to tick, so the days before the fix
// (plan.suggestFrom) must not suddenly count as missed and break a streak
const old = { ...res.plan, id: 'o', startDate: '2026-10-12', suggestFrom: '2026-10-20' };
const recs = { '2026-10-15': { ticks: {}, sets: {} }, '2026-10-16': { ticks: { [dayFor(old, '2026-10-16').workout[0].id]: true }, sets: {} } };
ok(pctFor(old, recs, '2026-10-14') === null && pctFor(old, recs, '2026-10-15') === null, 'untouched suggested days before the fix are neither done nor missed');
ok(pctFor(old, recs, '2026-10-16') > 0, 'a day you did tick still counts');
ok(pctFor(old, recs, '2026-10-21') === 0, 'from the fix on, a skipped suggested day counts as missed');
// a full day on the 19th: the untouched days before it (13th to 18th, except the 16th) don't end the streak
const full = { ...recs, '2026-10-19': { ticks: Object.fromEntries([...dayFor(old, '2026-10-19').workout, ...dayFor(old, '2026-10-19').meals].map((x) => [x.id, true])), sets: {} } };
ok(currentStreak(old, full, '2026-10-19') === 1, 'the untouched 17th and 18th do not break the streak; the barely ticked 16th (under 50%) does: ' + currentStreak(old, full, '2026-10-19'));
const full2 = { ...full, '2026-10-16': { ticks: Object.fromEntries([...dayFor(old, '2026-10-16').workout, ...dayFor(old, '2026-10-16').meals].map((x) => [x.id, true])), sets: {} } };
ok(currentStreak(old, full2, '2026-10-19') === 2, 'two full days with untouched old days between them make a streak of 2');

console.log(fail ? `\n${fail} failed` : '\nAll option-day tests passed');
process.exit(fail ? 1 : 0);
