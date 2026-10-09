// Tests for the exercise / meal library and per-day picks. Run: node tests/library.mjs
import { parsePlanText, validatePlan } from '../js/parser.js';
import { dayFor, plannedDay } from '../js/schedule.js';
import { candidates, focusFor, savePick, resetPick, isPicked, customCandidate } from '../js/library.js';
import { dayStats } from '../js/stats.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

// A plan that is ONLY a library, sorted by category. No days at all.
const onlyLib = parsePlanText(JSON.stringify({
  name: 'My gym list',
  exercises: { Back: ['Lat Pulldown', { exercise: 'Seated Cable Row', sets: 4, reps: '10' }], Biceps: ['Hammer Curl'], Chest: [{ exercise: 'Bench Press', sets: 3, reps: '8' }] },
  meals: { Breakfast: [{ name: 'Oats bowl', items: ['60 g oats', '1 scoop whey'] }, 'Poha'], Dinner: [{ name: 'Dal rice', items: ['Dal', 'Rice'], calories: 550, protein: 20 }] },
}));
ok(onlyLib.ok, 'a plan with only a library is valid: ' + onlyLib.errors.join(' '));
const p = onlyLib.plan;
ok(p.days.length === 1 && p.days[0].workout.length === 0 && p.days[0].meals.length === 0, 'it gets one open day to pick into');
ok(p.library.exercises.length === 4 && p.library.meals.length === 3, 'library has 4 exercises and 3 meals');
const pull = p.library.exercises[0];
ok(pull.id === 'lx-lat-pulldown' && pull.category === 'Back' && pull.exercise === 'Lat Pulldown', 'a plain name becomes a full exercise with a stable id and category');
ok(p.library.exercises[1].sets === 4, 'full exercise objects keep their sets');
ok(p.library.meals[1].items[0] === 'Poha' && p.library.meals[1].id === 'lm-poha', 'a plain meal name becomes a meal');

// A weekly plan with a library inside "library", a focus, and days with no lists.
const weekly = parsePlanText(JSON.stringify({
  name: 'Weekly mix',
  library: { exercises: [{ exercise: 'Deadlift', category: 'Back' }, { exercise: 'Barbell Curl', category: 'Biceps' }, { exercise: 'Squat', category: 'Legs' }, { exercise: '', category: 'Legs' }] },
  days: [{ label: 'Friday Back Biceps' }, { label: 'Monday Legs', focus: ['Legs'], workout: [{ exercise: 'Leg Press' }], meals: [] }],
}));
ok(weekly.ok, 'days may leave out workout and meals when there is a library: ' + weekly.errors.join(' '));
ok(weekly.warnings.some((w) => /skipped/i.test(w)) && weekly.plan.library.exercises.length === 3, 'a broken library item is skipped with a warning, not an error');
ok(weekly.plan.days[1].focus[0] === 'Legs', 'focus is kept');
ok(!parsePlanText(JSON.stringify({ name: 'x', days: [{ label: 'd' }] })).ok, 'without a library a day still needs its lists');

const wp = { ...weekly.plan, id: 'w', startDate: '2026-10-01' };
const cats = ['Back', 'Biceps', 'Legs', 'Chest'];
ok(JSON.stringify(focusFor(wp.days[0], cats)) === '["Back","Biceps"]', 'Friday Back Biceps starts on Back and Biceps');
ok(JSON.stringify(focusFor(wp.days[1], cats)) === '["Legs"]', 'an explicit focus wins');
ok(focusFor({ label: 'Day 3' }, cats).length === 0, 'no focus means All');

// Picks: 2026-10-09 is a Friday.
const fri = '2026-10-09';
ok(dayFor(wp, fri).workout.length === 0, 'Friday starts empty');
const cands = candidates(wp, fri, 'workout', [{ exercise: 'Plank', sets: 3, reps: '30 sec', category: 'Core' }, { exercise: 'Deadlift', category: 'Back' }]);
ok(cands.some((c) => c.source === 'plan' && c.item.exercise === 'Leg Press'), "another day's exercise is offered");
ok(cands.filter((c) => c.item.exercise === 'Deadlift').length === 1, 'the same name is offered once (library beats the built-in list)');
const pick = ['Deadlift', 'Barbell Curl', 'Leg Press', 'Plank'].map((n) => cands.find((c) => c.item.exercise === n));
savePick(wp, fri, 'workout', pick);
const friDay = dayFor(wp, fri);
ok(friDay.workout.map((w) => w.exercise).join(',') === 'Deadlift,Barbell Curl,Leg Press,Plank', 'picked exercises show in the order chosen');
ok(wp.library.exercises.some((x) => x.exercise === 'Plank' && x.category === 'Core') && wp.library.exercises.some((x) => x.exercise === 'Leg Press'), 'built-in and other-day picks are copied into the library');
ok(dayFor(wp, '2026-10-16').workout.length === 0, 'next Friday is untouched');
ok(dayStats(friDay, { ticks: { [friDay.workout[0].id]: true } }).done === 1, 'ticks on picked exercises count');
ok(isPicked(wp, fri, 'workout') && !isPicked(wp, fri, 'meals'), 'only the workout was changed');

// The Monday plan: dropping and reordering its own exercise, then going back.
const mon = '2026-10-05';
const own = plannedDay(wp, mon).workout[0];
savePick(wp, mon, 'workout', []);
ok(dayFor(wp, mon).workout.length === 0 && dayFor(wp, mon).picked, 'removing everything makes it a rest day for that date');
resetPick(wp, mon, 'workout');
ok(dayFor(wp, mon).workout[0] === own && !wp.picks[mon], 'back to the plan removes the pick');
savePick(wp, mon, 'workout', [{ id: own.id, item: own, source: 'day' }]);
ok(!wp.picks[mon], "choosing exactly the plan's list stores nothing");

// Your own items.
ok(customCandidate('workout', '  ', 'Back') === null, 'no name, no item');
const mine = customCandidate('meals', 'Sprouts chaat', '', { items: ['Sprouts', 'Onion'] });
savePick(wp, fri, 'meals', [mine]);
ok(dayFor(wp, fri).meals[0].name === 'Sprouts chaat' && dayFor(wp, fri).meals[0].items.length === 2, 'a meal you typed in is saved and picked');

// Backups and re-checks keep the library and the picks.
const again = validatePlan(JSON.parse(JSON.stringify(wp)));
ok(again.ok && again.plan.library.exercises.length === wp.library.exercises.length, 'library survives a backup round trip');
ok(again.plan.picks[fri].workout.length === 4 && again.plan.library.exercises.find((x) => x.id === wp.picks[fri].workout[3]), 'picks survive and still point at library ids');
ok(!validatePlan({ name: 'x', days: [{ label: 'd', workout: [], meals: [] }], picks: { 'not a date': { workout: ['a'] }, '2026-01-01': 'junk' } }).plan.picks, 'junk picks are dropped');

console.log(fail ? `\n${fail} failed` : '\nAll library tests passed');
process.exit(fail ? 1 : 0);
