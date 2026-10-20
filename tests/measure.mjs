// Body measurements. Run: node tests/measure.mjs
import { validCm, cleanMeasureLog, measureSummary } from '../js/measure.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

ok(validCm('84.25') === 84.3 && validCm('84,5') === 84.5 && validCm(5) === null && validCm('x') === null && validCm(300) === null, 'centimetres are checked and rounded to one decimal');
const clean = cleanMeasureLog({ '2026-10-01': { waist: 90, nose: 4, arm: '35' }, nope: { waist: 1 }, '2026-10-02': { waist: 'x' } });
ok(JSON.stringify(clean) === '{"2026-10-01":{"waist":90,"arm":35}}', 'unknown parts, bad dates and bad numbers are dropped: ' + JSON.stringify(clean));
const sum = measureSummary({ '2026-09-01': { waist: 90, chest: 100 }, '2026-10-01': { waist: 86.5 }, '2026-10-15': { chest: 101.5, arm: 36 } });
const w = sum.find((x) => x.key === 'waist');
ok(w.first === 90 && w.latest === 86.5 && w.change === -3.5 && w.firstDate === '2026-09-01', 'waist: 90 to 86.5 cm, -3.5');
ok(sum.find((x) => x.key === 'chest').change === 1.5 && sum.find((x) => x.key === 'arm').change === 0, 'each part uses its own first and latest');
ok(!sum.some((x) => x.key === 'hips') && sum.map((x) => x.key).join() === 'waist,chest,arm', 'parts never measured are left out, in a fixed order');

console.log(fail ? `\n${fail} failed` : '\nAll measurement tests passed');
process.exit(fail ? 1 : 0);
