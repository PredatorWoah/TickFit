// Stride's planner engine (stride/app/src/main/assets/engine.js), run in Node: node stride/tests/engine.test.cjs
const path = require('path');
const E = require(path.join(__dirname, '../app/src/main/assets/engine.js'));
const blocks = require(path.join(__dirname, '../app/src/main/assets/catalog.js'));

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

// ----- names TickFit plans and chatbots actually use land in the right muscle group
const cases = {
  'Cable Rope Extension': 'Triceps', 'Overhead Cable Extension': 'Triceps', 'Lying Triceps Extension': 'Triceps', 'Rope Pushdown': 'Triceps',
  'Bench Dips': 'Triceps', 'Close Grip Bench Press': 'Triceps', 'Dumbbell Kickback': 'Triceps', 'JM Press': 'Triceps',
  'Cable Fly': 'Chest · Middle', 'Pec Fly': 'Chest · Middle', 'Flat Bench Press': 'Chest · Middle', 'Barbell Bench Press': 'Chest · Middle',
  'Incline Bench Press': 'Chest · Upper', 'Incline Smith Machine Press': 'Chest · Upper', 'Decline Bench Press': 'Chest · Lower', 'Chest Dips': 'Chest · Lower',
  'Barbell Row': 'Back', 'Pull Ups': 'Back', 'Chin Ups': 'Back', 'T Bar Row': 'Back', 'Rack Pull': 'Back', 'Barbell Shrug': 'Back', '45 Degree Back Extension': 'Back', 'Superman': 'Back',
  'Military Press': 'Shoulders', 'Overhead Press': 'Shoulders', 'Upright Row': 'Shoulders', 'Face Pull': 'Shoulders', 'Rear Delt Fly': 'Shoulders', 'Cable Lateral Raise': 'Shoulders', 'Front Raise': 'Shoulders',
  'Barbell Curl': 'Biceps', 'EZ Bar Curl': 'Biceps', 'Hammer Curl': 'Biceps', 'Preacher Curl': 'Biceps',
  'Back Squat': 'Legs', 'Leg Extension': 'Legs', 'Lying Leg Curl': 'Legs', 'Romanian Deadlift': 'Legs', 'Hip Thrust': 'Legs', 'Bulgarian Split Squat': 'Legs', 'Step Ups': 'Legs', 'Calf Raise': 'Legs', 'Hip Abduction Machine': 'Legs', 'Good Morning': 'Legs',
  'Hanging Leg Raise': 'Core', 'Russian Twist': 'Core', 'Ab Wheel Rollout': 'Core', 'Cable Crunch': 'Core', 'Pallof Press': 'Core', "Captain's Chair Knee Raise": 'Core', 'Dead Bug': 'Core', 'Side Plank': 'Core', 'Farmer Carry': 'Core',
  'Treadmill Incline Walk': 'Cardio', 'Stationary Bike': 'Cardio', 'Rowing Machine': 'Cardio', 'Skipping Rope': 'Cardio', 'Stair Climber': 'Cardio', 'Elliptical': 'Cardio',
};
const wrong = Object.entries(cases).filter(([name, want]) => E.classify(name)[0] !== want).map(([name, want]) => `${name}: ${E.classify(name)[0]} (want ${want})`);
ok(!wrong.length, `common exercise names are grouped right (${Object.keys(cases).length - wrong.length}/${Object.keys(cases).length})` + (wrong.length ? '\n      ' + wrong.join('\n      ') : ''));

// the built-in catalog agrees with classify, so imported names and catalog names group the same way
const catalogMiss = blocks.flatMap(([focus, , , names]) => names.split('|').filter((n) => E.classify(n)[0] !== focus).map((n) => `${n}: ${E.classify(n)[0]} (catalog ${focus})`));
console.log(`     catalog names classify() would group differently: ${catalogMiss.length}`);
ok(!catalogMiss.length, 'every catalog name is grouped like the catalog says' + (catalogMiss.length ? ': ' + catalogMiss.join(', ') : ''));

// ----- day names
ok(E.shortName('Chest · Upper + Chest · Middle + Chest · Lower + Triceps') === 'Chest + Triceps', 'shortName folds the chest parts');
ok(E.shortName('Rest') === 'Rest' && E.shortName('') === 'Workout', 'shortName for a rest day and no name');

// ----- a week and its export
const cfg = { ...E.DEFAULTS, mode: ['machine', 'dumbbell', 'bodyweight'], days: 4, goal: 'Muscle growth' };
const wk = E.week('2026-11-16', cfg, [], []);
ok(wk.length === 7 && wk.filter((d) => d.workout.length).length === 4, 'a 4-day week has 4 training days');
ok(wk.every((d, i) => d.date === E.offset('2026-11-16', i)), 'the week runs on consecutive dates');
const t = E.transfer('week', wk);
ok(t.app === 'tickfit' && t.format === 'stride-workout' && t.version === 1 && t.plan.days.length === 7, 'the export has the shape TickFit reads');
const fromToday = E.upcoming(wk, '2026-11-18');
ok(fromToday.length === 5 && fromToday[0].date === '2026-11-18', 'upcoming() drops the days that have passed');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
