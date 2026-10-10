// Tests for the total-lifted fun facts and muscle groups. Run: node tests/lift.mjs
import { liftFact, BENCHMARKS, muscleGroup, oneRepMax } from '../js/lift.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

ok(liftFact(0) === null && liftFact(9) === null && liftFact(NaN) === null, 'nothing under 10 kg');
ok(liftFact(10).text === "That's about the weight of a 10 kg bag of atta.", '10 kg: ' + liftFact(10).text);
ok(liftFact(25).text === "That's about 2.5 bags of atta.", '25 kg: ' + liftFact(25).text);
ok(liftFact(100).text === "That's about 1.5 grown men, or 10 bags of atta.", '100 kg: ' + liftFact(100).text);
ok(liftFact(200).text.includes('Royal Enfield Bullet'), '200 kg is a Bullet: ' + liftFact(200).text);
ok(liftFact(3000).text === "That's about 1.7 Mahindra Thars, or 4.6 Maruti 800s.", '3000 kg: ' + liftFact(3000).text);
ok(liftFact(12053).text === "That's about 1.6 JCB diggers, or 3 Indian elephants.", '12,053 kg: ' + liftFact(12053).text);
ok(liftFact(330000).short === 'About a PSLV rocket' && liftFact(330000).text.includes('Mangalyaan'), 'short version drops the extra clause: ' + liftFact(330000).short);
const top = liftFact(100000000);
ok(top.text === "That's about 2.2 INS Vikrants." && top.next === null, '100 million kg is 2.2 INS Vikrants, the top of the scale: ' + top.text);
ok(liftFact(45000000).short === 'About INS Vikrant', 'INS Vikrant short form');
const n = liftFact(1500).next;
ok(n.name === 'a Mahindra Thar' && n.toGo === 250 && n.pct === 77, 'next milestone and progress: ' + JSON.stringify(n));
ok(liftFact(400000).next.name === 'an LVM3 rocket', 'next milestone name is the short form');
ok(BENCHMARKS.every((b, i) => i === 0 || b[0] > BENCHMARKS[i - 1][0]), 'benchmarks go up in order');
ok(BENCHMARKS[BENCHMARKS.length - 1][0] * 2 < 100000000 && BENCHMARKS[BENCHMARKS.length - 1][0] * 3 > 100000000, 'the scale reaches 100 million kg as about 2 INS Vikrants');

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
