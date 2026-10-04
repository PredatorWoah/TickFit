// Tests for the body weight maths. Run: node tests/weight.mjs
import { validWeight, cleanLog, entries, latest, average7, weekChange, periodChange, formatDelta, chartPoints } from '../js/weight.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

eq('72.44 rounds to 72.4', validWeight(72.44), 72.4);
eq('comma decimals', validWeight('72,6'), 72.6);
eq('with unit text', validWeight('72.4 kg'), 72.4);
eq('too light', validWeight(5), null);
eq('too heavy', validWeight(900), null);
eq('junk', validWeight('abc'), null);
eq('empty / null / undefined', [validWeight(''), validWeight(null), validWeight(undefined)], [null, null, null]);
eq('clean keeps good, drops bad', cleanLog({ '2026-10-01': 70, 'nope': 71, '2026-10-02': 'x', '2026-10-03': 1000 }), { '2026-10-01': 70 });
eq('clean of non-object', [cleanLog(null), cleanLog('x'), cleanLog(5)], [{}, {}, {}]);

const log = { '2026-09-22': 80, '2026-09-24': 79.8, '2026-09-27': 79.6, '2026-09-29': 79.4, '2026-10-01': 79, '2026-10-03': 78.8, '2026-10-04': 78.6 };
eq('entries sorted', entries(log).map((e) => e.date)[0], '2026-09-22');
eq('latest before a date', latest(log, '2026-10-02'), { date: '2026-10-01', kg: 79 });
eq('latest when none', latest(log, '2026-01-01'), null);
eq('average of last 7 days', average7(log, '2026-10-04'), 78.9); // 79.4, 79, 78.8, 78.6
eq('average with none', average7({}, '2026-10-04'), null);
const wc = weekChange(log, '2026-10-04');
eq('week change uses averages', wc, { now: 78.9, before: 79.8, delta: -0.9, basis: 'average' }); // before = 09-22..09-27 avg (80,79.8,79.6)=79.8
eq('week change falls back to first/last', weekChange({ '2026-10-02': 80, '2026-10-04': 79.5 }, '2026-10-04').delta, -0.5);
eq('week change with one entry is null', weekChange({ '2026-10-04': 80 }, '2026-10-04'), null);
eq('week change with nothing', weekChange({}, '2026-10-04'), null);
eq('period change: from last weigh-in before', periodChange(log, '2026-09-28', '2026-10-04'), { from: 79.6, to: 78.6, delta: -1, count: 4 });
eq('period change: no earlier entry', periodChange({ '2026-10-02': 80, '2026-10-04': 79 }, '2026-10-01', '2026-10-07'), { from: 80, to: 79, delta: -1, count: 2 });
eq('period change: one entry only', periodChange({ '2026-10-02': 80 }, '2026-10-01', '2026-10-07').delta, 0);
eq('period change: empty period', periodChange(log, '2026-11-01', '2026-11-30'), null);
eq('delta format', [formatDelta(0.44), formatDelta(-1.2), formatDelta(0), formatDelta(null)], ['+0.4 kg', '-1.2 kg', 'no change', '']);
eq('chart points limited to window', chartPoints(log, '2026-10-04', 7).map((p) => p.date), ['2026-09-29', '2026-10-01', '2026-10-03', '2026-10-04']);
console.log(fail ? `\n${fail} failed` : '\nAll weight tests passed');
process.exit(fail ? 1 : 0);
