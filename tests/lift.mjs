// Tests for the total-lifted fun facts and muscle groups. Run: node tests/lift.mjs
import { liftFact, BENCHMARKS, muscleGroup, oneRepMax } from '../js/lift.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

ok(liftFact(0) === null && liftFact(9) === null && liftFact(NaN) === null, 'nothing under 10 kg');
ok(liftFact(100).text === "That's about 1.4 grown adults, or 10 bags of rice.", '100 kg: ' + liftFact(100).text);
ok(liftFact(25).text === "That's about 2.5 bags of rice.", '25 kg: ' + liftFact(25).text);
ok(liftFact(10).text.includes('bag of rice'), '10 kg is a bag of rice');
ok(liftFact(3000).text.includes('SUV'), '3000 kg is about a big SUV');
ok(liftFact(12053).text === "That's about the weight of a city bus, or 2 African elephants.", '12,053 kg: ' + liftFact(12053).text);
const top = liftFact(100000000);
ok(top.text.includes('aircraft carrier') && top.next === null, '100 million kg is an aircraft carrier, the top of the scale');
ok(liftFact(250000000).text === "That's about 2.5 aircraft carriers.", 'past the top it keeps counting carriers');
const n = liftFact(1500).next;
ok(n.name === 'a big SUV' && n.toGo === 1000 && n.pct === 33, 'next milestone and progress: ' + JSON.stringify(n));
ok(BENCHMARKS.every((b, i) => i === 0 || b[0] > BENCHMARKS[i - 1][0]), 'benchmarks go up in order');
ok(BENCHMARKS[BENCHMARKS.length - 1][0] === 100000000, 'the scale goes up to 100 million kg');

const groups = {
  'Incline Walk': 'Cardio', 'Dumbbell Bench Press (Flat)': 'Chest', 'Chest Supported Dumbbell Row': 'Back',
  'Lat Pulldown (Close or Neutral Grip)': 'Back', 'Incline Dumbbell Press': 'Chest', 'High to Low Cable Fly': 'Chest',
  'Tricep Rope Pushdown': 'Triceps', 'Overhead Dumbbell Tricep Extension': 'Triceps', 'Hammer Curl': 'Biceps',
  'Lateral Raise': 'Shoulders', 'Romanian Deadlift': 'Legs', 'Plank': 'Core', 'Rowing machine': 'Cardio',
  'Leg raise': 'Core', 'Upright row': 'Shoulders', 'Chin-ups': 'Back', 'Standing calf raise': 'Legs', 'Something odd': 'Other',
};
for (const [name, g] of Object.entries(groups)) ok(muscleGroup(name) === g, `${name} -> ${g} (got ${muscleGroup(name)})`);

ok(oneRepMax(100, 1) === 100 && oneRepMax(100, 10) === 133.3 && oneRepMax(0, 5) === null, 'one rep max (Epley)');

console.log(fail ? `\n${fail} failed` : '\nAll lift tests passed');
process.exit(fail ? 1 : 0);
