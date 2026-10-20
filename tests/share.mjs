// Sharing a plan by link / QR. Run: node tests/share.mjs
import { encodePlan, decodePlan, sharablePlan, planFromHash, qrSvg, siteUrl } from '../js/share.js';
import { validatePlan } from '../js/parser.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const plan = {
  id: 'p_secret', name: 'Push Pull Legs', startDate: '2026-10-01', suggestFrom: '2026-10-01', picks: { '2026-10-02': { workout: ['x'] } },
  days: [{ label: 'Push', workout: [{ id: 'w1', exercise: 'Bench Press', sets: 3, reps: '8 to 12', rest: '90s', weight: '', notes: '', video: '', superset: 'A' }], meals: [{ id: 'm1', name: 'Poha', items: ['poha'], time: '', calories: 350, protein: 8 }], extras: { waterLiters: 3, supplements: [], notes: 'Warm up' } }],
};
const s = sharablePlan(plan);
ok(!('id' in s) && !('picks' in s) && !('startDate' in s) && !('suggestFrom' in s), 'only the plan travels: no id, picks or dates');
const packed = await encodePlan(plan);
ok(/^1\.[A-Za-z0-9_-]+$/.test(packed), 'packed as "1." + base64url (safe in a link): ' + packed.length + ' characters');
const back = validatePlan(await decodePlan(packed));
ok(back.ok && back.plan.name === 'Push Pull Legs' && back.plan.days[0].workout[0].exercise === 'Bench Press' && back.plan.days[0].workout[0].superset === 'A', 'unpacks to the same plan, valid');
let threw = false;
try { await decodePlan('1.!!!'); } catch { threw = true; }
ok(threw, 'a damaged link is refused');
ok(planFromHash('#plan=' + packed) === packed && planFromHash('#other') === null, 'reads the plan from the link');
ok(siteUrl({ protocol: 'https:', hostname: 'someone.github.io', origin: 'https://someone.github.io', pathname: '/TickFit/' }) === 'https://someone.github.io/TickFit/', 'a fork shares its own address');
ok(siteUrl({ protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', pathname: '/' }) === 'https://predatorwoah.github.io/TickFit/', 'the Android app shares the public site');
const svg = await qrSvg('https://predatorwoah.github.io/TickFit/#plan=' + packed);
ok(svg && svg.startsWith('<svg') && svg.includes('<path'), 'a QR code is drawn for a normal plan');
ok((await qrSvg('x'.repeat(5000))) === null, 'too much for a QR code: null (the link still works)');

console.log(fail ? `\n${fail} failed` : '\nAll sharing tests passed');
process.exit(fail ? 1 : 0);
