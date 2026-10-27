// Reads a plan document laid out like a coach's split, with no chatbot. Run: node tests/docreader.mjs
import { readStructuredPlan, describeReport } from '../js/docreader.js';
import { parsePlanText } from '../js/parser.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const doc = `Sam's Split: Monday to Saturday
How to use this
Big lifts (marked ★): 3 sets x 8 to 12 reps, rest 90 to 120 seconds.
Smaller lifts: 3 sets x 12 to 15 reps, rest 60 to 90 seconds.

MONDAY: Chest + Triceps
UPPER CHEST
1. Upper Chest Press ★
🏋 Machine: Incline Chest Press Machine. Handles in line with the upper chest, press up.
▶ Watch machine version <https://video.test/a1>
🤸 No machine: Decline Push Ups. Feet on a bench.
▶ Watch no machine version <https://video.test/a2>
TRICEPS
2. Overhead
🏋 Machine: Cable Rope Extension. Elbows by your ears.
🤸 No machine: Dumbbell Skull Crusher. Lower to the forehead.
▶ Watch no machine version <https://video.test/b2>
Finish: 15 min incline walk.

TUESDAY: Back + Biceps
1. Pulldown ★
🏋 Machine: Reverse Grip (Underhand) Lat Pulldown. Palms facing you.
🤸 No machine: Dumbbell Pullover. Ribs down.
2. Curl
🏋 Machine: Cable Rope Extension (same as Monday).
🤸 No machine: Concentration Curl. Elbow on the knee. 15 reps.

WEDNESDAY: Legs
1. Squat ★
🏋 Machine: Hack Squat. Feet shoulder width.
🤸 No machine: Dumbbell Sumo Squat. Heels down.

SUNDAY: Rest
No gym. Long relaxed walk.
`;

const r = readStructuredPlan(doc);
ok(r && r.plan.days.length === 4, 'every day heading becomes a day, none dropped');
const [mon, tue, wed, sun] = r.plan.days;
ok(mon.label === 'Monday Chest + Triceps' && sun.label === 'Sunday Rest', 'day labels start with the weekday');
ok(mon.workout.length === 2 && tue.workout.length === 2 && wed.workout.length === 1 && sun.workout.length === 0, 'right number of exercises per day, rest day empty');
const w = mon.workout[0];
ok(w.exercise === 'Incline Chest Press Machine' && w.version === 'Machine' && w.alternatives.length === 1 && w.alternatives[0].exercise === 'Decline Push Ups' && w.alternatives[0].version === 'No machine', 'Machine / No machine is ONE slot with an alternative');
ok(w.video === 'https://video.test/a1' && w.alternatives[0].video === 'https://video.test/a2', 'each version keeps its own video');
ok(w.sets === 3 && w.reps === '8 to 12' && w.rest === '90 to 120s', 'a starred lift takes the big-lift rule');
ok(mon.workout[1].sets === 3 && mon.workout[1].reps === '12 to 15' && mon.workout[1].rest === '60 to 90s', 'the others take the small-lift rule');
ok(!mon.workout[1].video && mon.workout[1].alternatives[0].video === 'https://video.test/b2', 'no link means no video, not a borrowed one');
ok(/15 min incline walk/.test(mon.extras.notes), 'the Finish line becomes the day note');
ok(tue.workout[0].exercise === 'Reverse Grip Lat Pulldown' && /Underhand/.test(tue.workout[0].notes), 'a bracket in the middle of a name does not cut it short');
ok(tue.workout[1].notes.includes('Elbows by your ears') && tue.workout[1].video === undefined, '"(same as Monday)" takes that exercise\'s notes');
ok(tue.workout[1].alternatives[0].reps === '15', 'a rep hint in a version\'s notes is used for that version');
ok(r.report.versioned === 5 && r.report.trainingDays === 3, 'the report counts what was found');
ok(/4 days/.test(describeReport(r.report)), 'describeReport says what was read');

const checked = parsePlanText(JSON.stringify(r.plan));
ok(checked.ok && checked.plan.days[0].workout[0].alternatives.length === 1 && checked.warnings.length === 0, 'the result passes the normal plan check');

ok(readStructuredPlan('Just some notes about my week. Eat well.') === null, 'text without days is left to the chatbot');
ok(readStructuredPlan('MONDAY: Chest\nDo some presses.\nTUESDAY: Back\nDo rows.') === null, 'days with no numbered exercises are left to the chatbot');
ok(readStructuredPlan('') === null && readStructuredPlan(null) === null, 'empty input is null');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
