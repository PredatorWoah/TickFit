// Gym maths: go-heavier hints, plates, warm-ups, personal records, supersets. Run: node tests/gym.mjs
import { suggestNext, platesPerSide, warmupSets, bestBefore, isRecord, recordHistory, e1rmSeries, supersetGroups, repsLow } from '../js/gym.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ----- go heavier
const ex = { sets: 3, reps: '8 to 12' };
const s3 = (w, r1, r2 = r1, r3 = r2) => ({ sets: [{ w, r: r1 }, { w, r: r2 }, { w, r: r3 }] });
ok(suggestNext(ex, s3(40, 12)).kind === 'up' && suggestNext(ex, s3(40, 12)).kg === 42.5, 'all sets at the top of the range: +2.5 kg');
ok(suggestNext(ex, s3(40, 12, 12, 10)).kind === 'same', 'one set short of the top: same weight, add a rep');
ok(suggestNext(ex, s3(40, 9, 7, 6)).kind === 'stay' && /8 reps/.test(suggestNext(ex, s3(40, 9, 7, 6)).text), 'below the bottom of the range: stay and reach 8');
ok(suggestNext(ex, { sets: [{ w: 40, r: 12 }, { w: 40, r: 12 }] }).kind === 'same', 'fewer sets than planned is not a reason to go up');
ok(suggestNext({ sets: 3, reps: '10' }, s3(6, 10)).kg === 7, 'light dumbbells go up 1 kg');
ok(suggestNext({ sets: 3, reps: '30 sec' }, s3(0, 1)) === null && suggestNext(ex, null) === null, 'nothing for timed work or no history');
ok(repsLow('8 to 12') === 8 && repsLow('10') === 10 && repsLow('45 sec') === null, 'bottom of the rep range');

// ----- plates
ok(eq(platesPerSide(100), { plates: [25, 15], left: 0 }), '100 kg on a 20 kg bar: 25 + 15 a side');
ok(eq(platesPerSide(62.5), { plates: [20, 1.25], left: 0 }), '62.5 kg: 20 + 1.25 a side');
ok(eq(platesPerSide(61), { plates: [20], left: 1 }), 'what cannot be made is reported (1 kg left over)');
ok(platesPerSide(15) === null, 'less than the bar: nothing to load');
ok(eq(platesPerSide(40, 10, [10, 5]), { plates: [10, 5], left: 0 }), 'other bars and plate sets work');

// ----- warm-ups
ok(eq(warmupSets(100), [{ w: 20, r: 10 }, { w: 50, r: 8 }, { w: 70, r: 5 }, { w: 85, r: 3 }]), 'warm-up ramp for 100 kg');
ok(warmupSets(40).every((s) => s.w >= 20 && s.w < 40) && warmupSets(25).length === 0, 'never below the bar, none for light weights');

// ----- personal records
const plan = { startDate: '2026-10-01', days: [{ label: 'A', workout: [{ id: 'b', exercise: 'Bench Press', sets: 3, reps: '8' }], meals: [], extras: {} }] };
const rec = (w, r) => ({ ticks: {}, sets: { b: [{ w, r, done: true }] } });
const records = { '2026-10-01': rec(50, 8), '2026-10-02': rec(55, 6), '2026-10-03': rec(52.5, 8), '2026-10-04': rec(50, 5) };
const best = bestBefore(plan, records, '2026-10-05', 'bench press');
ok(best && best.w === 52.5 && best.r === 8, 'best set before today, by estimated 1 rep max: ' + JSON.stringify(best));
ok(isRecord({ w: 55, r: 8 }, best) && !isRecord({ w: 52.5, r: 8 }, best) && !isRecord({ w: 60, r: 1 }, null), 'a record beats the best; the very first set is not called one');
const hist = recordHistory(plan, records, '2026-10-05');
ok(hist.length === 2 && hist[0].date === '2026-10-03' && hist[1].date === '2026-10-02', 'record history, newest first: ' + hist.map((x) => x.date).join(', '));
ok(e1rmSeries(plan, records, '2026-10-05', 'Bench Press').length === 4, 'one chart point per session');

// ----- supersets
const g = supersetGroups([{ superset: 'A' }, { superset: 'A' }, {}, { superset: 'B' }, { superset: 'C' }, { superset: 'C' }, { superset: 'C' }]);
ok(g[0].size === 2 && g[1].last === 1 && g[2] === null && g[3] === null && g[6].first === 4 && g[6].size === 3, 'supersets are neighbours with the same letter; a lone letter is not one');

console.log(fail ? `\n${fail} failed` : '\nAll gym tests passed');
process.exit(fail ? 1 : 0);
