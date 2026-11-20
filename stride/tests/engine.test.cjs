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


// ----- the AI coach (coach.js uses the engine's helpers as globals, like in the app)
Object.assign(globalThis, E);
const C = require(path.join(__dirname, '../app/src/main/assets/coach.js'));
const tickfitCoach = require('fs').readFileSync(path.join(__dirname, '../../js/coach.js'), 'utf8');
ok(C.COACH_PRINCIPLES.every((p) => tickfitCoach.includes(JSON.stringify(p).slice(1, -1).replace(/\\"/g, '"')) || tickfitCoach.includes(p)), 'Stride\'s coach has exactly TickFit\'s coaching principles');
const hist = [
  { date: '2026-11-14', lifts: [{ name: 'Incline Dumbbell Press', sets: [{ reps: 10, kg: 24 }, { reps: 9, kg: 24 }] }, { name: 'Hammer Curl', sets: [{ reps: 12, kg: 14 }] }] },
  { date: '2026-11-04', lifts: [{ name: 'Incline Dumbbell Press', sets: [{ reps: 10, kg: 22 }] }] },
  { date: '2026-09-01', lifts: [{ name: 'Old Lift', sets: [{ reps: 5, kg: 100 }] }] },
];
const dg = C.coachDigest(hist, '2026-11-16');
ok(dg.sessions === 2 && dg.muscles.Chest.setsThisWeek === 2 && dg.muscles.Chest.setsLastWeek === 1 && dg.muscles.Biceps.lastTrained === 2, 'the digest: sessions, sets per muscle, days since trained (6 weeks only)');
ok(dg.exercises[0].sessions[0].sets === '24x10, 24x9' && dg.exercises[0].bestE1rm === 32, 'per exercise: last sets and best estimated 1RM');
const ask = C.coachAsk({ Chest: 3, Biceps: 4 }, 7);
ok(ask.total === 7 && ask.free === 0, '3 chest + 4 biceps = 7');
const options = E.catalog([]).filter((o) => ['Chest', 'Biceps'].includes(C.coachMuscle(o.focus)));
const pick = (name) => E.norm(name);
const reply = JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Go.', warnings: [], exercises: [
  { id: pick('Incline Dumbbell Press'), sets: 3, reps: '8 to 10', rir: 2, rest: '2 min', weight: '25 kg', why: 'Up from 24x10.' },
  { id: pick('Machine Chest Press'), sets: 3, reps: '10', rir: 2 },
  { id: pick('Low to High Cable Fly'), sets: 2, reps: '12 to 15', rir: 1 },
  { id: pick('Pec Deck Fly'), sets: 2, reps: '15' },
  { id: 'made-up-exercise', sets: 3, reps: '10' },
  { id: pick('Hammer Curl'), sets: 30, reps: '10', weight: '9999 kg' },
  { id: pick('Incline Dumbbell Curl'), sets: 3, reps: '10' },
  { id: pick('Machine Preacher Curl'), sets: 3, reps: '12' },
] }) }] } }] });
const dr = C.coachDraft(reply, ask, options);
ok(dr && dr.exercises.length === 6, 'a 4th chest and a made-up id are dropped');
ok(dr.exercises[0].weight === '25 kg' && /2 reps in reserve\. Up from 24x10/.test(dr.exercises[0].notes) && /youtube/.test(dr.exercises[0].video), 'the first one keeps its weight, reason and form link');
const hammer = dr.exercises.find((x) => x.exercise === 'Hammer Curl');
ok(hammer.sets === 3 && hammer.weight === '' && !/reps in reserve/.test(hammer.notes), 'silly sets and weights are not trusted, missing rir stays empty');
ok(dr.warnings.some((w) => /1 Biceps missing/.test(w)), 'one biceps short: it says so');
ok(C.coachDraft('Gemini returned HTTP 404.', ask, options) === null, 'an error text is not a draft');
const req = C.coachRequest({ ask, digest: dg, config: E.DEFAULTS, note: 'sore elbow', minutes: 50, options });
const reqText = req.contents[0].parts[0].text;
ok(/exactly 7 exercises: 3 Chest, 4 Biceps/.test(reqText) && reqText.includes('24x10, 24x9') && /sore elbow/.test(reqText) && req.generationConfig.responseMimeType === 'application/json', 'the request carries counts, history, note and asks for JSON');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
