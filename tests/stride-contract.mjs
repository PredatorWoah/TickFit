// Stride and TickFit agree on the file between them: what Stride's own code exports, TickFit reads, for every
// kind of day Stride makes. Run: node tests/stride-contract.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { readStride, previewStride, applyStride } from '../js/stride.js';
import { parsePlanText } from '../js/parser.js';
import { dayFor } from '../js/schedule.js';

const require = createRequire(import.meta.url);
const E = require('../stride/app/src/main/assets/engine.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const plan = parsePlanText(JSON.stringify({ name: 'Mine', days: ['Monday Chest', 'Tuesday Back', 'Wednesday Legs', 'Thursday Arms', 'Friday Back + Triceps', 'Saturday Legs', 'Sunday Rest'].map((label, i) => ({ label, workout: i === 6 ? [] : [{ exercise: `${label} lift`, sets: 3, reps: '10' }], meals: [{ name: 'Lunch', items: ['Dal'] }] })) })).plan;
plan.startDate = '2026-11-01';
const START = '2026-11-16';

for (const mode of [['machine', 'dumbbell', 'bodyweight'], ['dumbbell', 'bodyweight'], ['bodyweight']]) {
  for (const days of [2, 3, 4, 5, 6]) {
    for (const goal of ['General fitness', 'Muscle growth', 'Strength']) {
      const cfg = { ...E.DEFAULTS, mode, days, goal, level: 'Some experience', minutes: 50 };
      const week = E.week(START, cfg, [], []);
      const file = JSON.stringify(E.transfer('week', week), null, 2);
      const s = readStride(file);
      const name = `${mode.join('+')}, ${days} days, ${goal}`;
      if (!s || s.errors.length || s.days.length !== 7) { ok(false, `${name}: read (${s && s.errors.join('; ')})`); continue; }
      const sameNames = s.days.every((d, i) => d.workout.map((w) => w.exercise).join('|') === week[i].workout.map((w) => w.exercise).join('|'));
      if (!sameNames) ok(false, `${name}: TickFit kept every exercise`);
    }
  }
}
ok(fail === 0, 'every Stride week (3 equipment sets x 5 frequencies x 3 goals) reads cleanly with all its exercises');

// one day, through to the plan
const day = E.session(START, ['Chest · Upper', 'Chest · Middle', 'Shoulders'], { ...E.DEFAULTS, mode: ['machine', 'dumbbell'], minutes: 50 }, [], []);
const s = readStride(JSON.stringify(E.transfer('day', [day])));
const rows = previewStride(plan, {}, s, '2026-11-13');
ok(rows.length === 1 && rows[0].action === 'replace', 'a Stride day replaces that date');
applyStride(plan, {}, s, '2026-11-13');
const after = dayFor(plan, START);
ok(after.label === 'Chest + Shoulders' && after.workout.length === day.workout.length, 'the day takes Stride\'s exercises and name (' + after.label + ')');
ok(after.workout.every((w) => /^https:\/\/www\.youtube\.com\//.test(w.video)), 'each exercise keeps its YouTube form link');
ok(after.meals.length === 1, 'meals stay');

// the examples shipped with Stride read too
for (const f of ['tickfit-example-day.json', 'tickfit-example-week.json']) {
  const ex = readStride(fs.readFileSync(new URL(`../stride/examples/${f}`, import.meta.url), 'utf8'));
  ok(ex && !ex.errors.length && ex.days.length, `${f} reads`);
}

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
