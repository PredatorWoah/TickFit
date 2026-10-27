// Exercises that come in versions (Machine / No machine): parsing, choosing a version per date, and that
// every screen sees the version that was used. Run: node tests/versions.mjs
import { parsePlanText } from '../js/parser.js';
import { versionsOf, versionInfo, resolveVersion, versionId, baseId, setVersion, setVersionForDay, sharedLabels } from '../js/versions.js';
import { dayFor } from '../js/schedule.js';
import { savePick } from '../js/library.js';
import { lastPerformance, exerciseProgress } from '../js/stats.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const pair = (a, b, extra = {}) => ({ exercise: a[0], version: 'Machine', sets: 3, reps: '8 to 12', rest: '90 to 120s', notes: a[1], alternatives: [{ version: 'No machine', exercise: b[0], notes: b[1], video: 'https://www.youtube.com/watch?v=abc', ...extra }] });
const raw = {
  name: 'Split',
  days: [
    { label: 'Monday Chest', workout: [pair(['Incline Chest Press Machine', 'Press up'], ['Decline Push Ups', 'Feet on a bench']), pair(['Smith Machine Bench Press', 'Safety stops'], ['Push Ups', 'Body straight'], { reps: '15' })], meals: [] },
    { label: 'Tuesday Back', workout: [{ exercise: 'Row', sets: 3, reps: '10' }], meals: [] },
  ],
};
const parsed = parsePlanText(JSON.stringify(raw));
ok(parsed.ok, 'a plan with alternatives is valid');
const plan = parsed.plan;
plan.startDate = '2026-10-26'; // a Monday; the labels are weekdays, so dates follow the calendar anyway
const mon = plan.days[0].workout;
ok(mon.length === 2 && mon[0].alternatives.length === 1 && mon[0].vlabel === 'Machine' && mon[0].alternatives[0].label === 'No machine', 'one slot holds both versions, not two exercises');
ok(mon[0].alternatives[0].video === 'https://www.youtube.com/watch?v=abc' && mon[0].alternatives[0].notes === 'Feet on a bench', 'each version keeps its own video and notes');
ok(!('alternatives' in plan.days[1].workout[0]), 'an exercise with one version stays plain');

// ----- tolerant spellings from chatbots
const lax = parsePlanText(JSON.stringify({ name: 'x', days: [{ label: 'D', meals: [], workout: [{ exercise: 'A', alt: 'B' }, { exercise: 'C', alternative: { name: 'D', notes: 'n' } }, { exercise: 'E', versions: [{ label: 'Home', exercise: 'F' }, 'G', { notes: 'no name' }] }, { exercise: 'H', or: ['I'] }] }] }));
ok(lax.ok, 'alt, alternative, versions and or are all understood');
const w = lax.plan.days[0].workout;
ok(eq(w[0].alternatives, [{ exercise: 'B' }]) && eq(w[1].alternatives, [{ exercise: 'D', notes: 'n' }]) && eq(w[2].alternatives.map((a) => a.exercise), ['F', 'G']) && w[2].alternatives[0].label === 'Home' && eq(w[3].alternatives, [{ exercise: 'I' }]), 'names, objects and plain strings become alternatives');
ok(lax.warnings.some((x) => /no exercise name/.test(x)), 'a version without a name is skipped with a warning');
const many = parsePlanText(JSON.stringify({ name: 'x', days: [{ label: 'D', meals: [], workout: [{ exercise: 'A', alternatives: ['1', '2', '3', '4', '5', '6'] }] }] }));
ok(many.plan.days[0].workout[0].alternatives.length === 4 && many.warnings.some((x) => /kept the first 5/.test(x)), 'at most five versions, and it says so');

// ----- versions and ids
const m0 = mon[0];
ok(eq(versionsOf(m0), [{ label: 'Machine', exercise: 'Incline Chest Press Machine' }, { label: 'No machine', exercise: 'Decline Push Ups' }]), 'versionsOf lists the labels and names');
ok(versionsOf(plan.days[1].workout[0]) === null, 'a plain exercise has no versions');
ok(versionId('w1', 0) === 'w1' && versionId('w1', 2) === 'w1~2' && baseId('w1~2') === 'w1' && baseId('w1') === 'w1', 'ids: the slot keeps its id, other versions get id~n');
ok(resolveVersion(m0, 0) === m0, 'the first version is the plan\'s own object, so changes to it are saved');
const alt = resolveVersion(m0, 1);
ok(alt.exercise === 'Decline Push Ups' && alt.id === 'w1~1' && alt.base === 'w1' && alt.vi === 1 && alt.notes === 'Feet on a bench' && alt.sets === 3 && alt.reps === '8 to 12' && alt.rest === '90 to 120s', 'another version is a copy: its own name and notes, sets and reps from the slot');
ok(resolveVersion(mon[1], 1).reps === '15', 'a version can have its own reps');
ok(resolveVersion({ ...m0, notes: 'machine cue' }, 1).notes === 'Feet on a bench' && resolveVersion({ ...m0, alternatives: [{ exercise: 'Z' }] }, 1).notes === '' , 'notes never carry over from another version');
ok(eq(versionInfo(alt).versions.map((v) => v.label), ['Machine', 'No machine']) && versionInfo(alt).vi === 1 && versionInfo(m0).vi === 0 && versionInfo(m0).base === 'w1', 'versionInfo works on either version');

// ----- a date shows the version that was chosen for it
const D1 = '2026-10-26';
const D2 = '2026-11-02'; // the next Monday
ok(dayFor(plan, D1).workout[0].exercise === 'Incline Chest Press Machine', 'by default the first version');
setVersion(plan, D1, 'w1', 1);
ok(dayFor(plan, D1).workout[0].exercise === 'Decline Push Ups' && dayFor(plan, D1).workout[1].exercise === 'Smith Machine Bench Press', 'choosing a version changes that slot on that date only');
ok(dayFor(plan, D2).workout[0].exercise === 'Incline Chest Press Machine', 'other dates are not touched');
ok(eq(plan.versions, { [D1]: { w1: 1 } }), 'the choice is stored per date and slot');
setVersion(plan, D1, 'w1', 0);
ok(plan.versions === undefined, 'going back to the first version leaves nothing behind');

// ----- the whole day at once, but never an exercise that has been started
const left = setVersionForDay(plan, D1, dayFor(plan, D1).workout, 1, (x) => x.id === 'w2');
const day = dayFor(plan, D1).workout;
ok(day[0].exercise === 'Decline Push Ups' && day[1].exercise === 'Smith Machine Bench Press' && eq(left, ['Smith Machine Bench Press']), 'a day-wide switch skips an exercise whose sets are already ticked');
ok(eq(sharedLabels(dayFor(plan, D1).workout), ['Machine', 'No machine']), 'the day-wide switch is labelled from the exercises');
ok(sharedLabels(dayFor(plan, D2).workout.slice(0, 1)) === null, 'no day-wide switch for a single exercise');

// ----- each version logs under its own id, and history follows what was done
const records = { [D1]: { ticks: {}, sets: { 'w1~1': [{ w: 0, r: 12, done: true }, { w: 0, r: 10, done: true }, { w: 0, r: 9, done: true }] } } };
ok(exerciseProgress(dayFor(plan, D1).workout[0], records[D1]).done === 3, 'sets logged under w1~1 count for Decline Push Ups on that date');
ok(exerciseProgress(dayFor(plan, D2).workout[0], records[D1]).done === 0, 'and not for the machine press');
plan.days[0].workout[0].exercise; // (unchanged)
const hist = lastPerformance(plan, records, D2, 'Decline Push Ups');
ok(hist && hist.date === D1 && hist.sets.length === 3, 'last time you did Decline Push Ups finds that day');
ok(lastPerformance(plan, records, D2, 'Incline Chest Press Machine') === null, 'the machine press has no history from it');

// ----- picks: the chosen exercises of a date still resolve to the chosen version
savePick(plan, D2, 'workout', [{ id: 'w2', item: plan.days[0].workout[1], source: 'day' }, { id: 'w1', item: plan.days[0].workout[0], source: 'day' }]);
setVersion(plan, D2, 'w2', 1);
const picked = dayFor(plan, D2).workout;
ok(picked[0].exercise === 'Push Ups' && picked[1].exercise === 'Incline Chest Press Machine' && picked[0].id === 'w2~1', 'a picked, reordered day keeps its versions');

// ----- survives a backup / share round trip
const again = parsePlanText(JSON.stringify(plan));
ok(again.ok && eq(again.plan.versions, plan.versions) && again.plan.days[0].workout[0].alternatives[0].exercise === 'Decline Push Ups', 'versions and choices survive validate again (backup restore)');
const bad = parsePlanText(JSON.stringify({ ...raw, versions: { 'not-a-date': { w1: 1 }, '2026-10-26': { w1: 99, w2: 1.5, w3: 'x' } } }));
ok(bad.ok && bad.plan.versions === undefined, 'a damaged choice list is dropped, not trusted');

// ----- empty training days are flagged
const gap = parsePlanText(JSON.stringify({ name: 'g', days: [{ label: 'Monday Chest', meals: [], workout: [{ exercise: 'Press' }] }, { label: 'Tuesday Back + Biceps', meals: [], workout: [] }, { label: 'Sunday Rest', meals: [], workout: [] }, { label: 'Saturday Long walk', meals: [], workout: [] }] }));
ok(gap.ok && gap.warnings.length === 1 && /Day 2 \("Tuesday Back \+ Biceps"\) has no exercises/.test(gap.warnings[0]), 'a training day with nothing in it is flagged, rest days are not');
ok(parsePlanText(JSON.stringify({ name: 'g', days: [{ label: 'Day 1', meals: [], workout: [] }] })).warnings.length === 0, 'a plan with no exercises at all is not nagged about each day');

if (fail) {
  console.log(`\n${fail} failed`);
  process.exit(1);
}
console.log('\nall passed');
