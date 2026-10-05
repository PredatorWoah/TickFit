// Tests for note formatting. Run: node tests/notes.mjs
import { splitSentences, parseNotes, tidyNotes, daysWithNote } from '../js/notes.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', m, ok ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); };

eq('sentences split on . ! ?', splitSentences('One. Two! Three? Four'), ['One.', 'Two!', 'Three?', 'Four']);
eq('numbers with dots/commas are not split', splitSentences('Walk 8,000 to 10,000 steps, about 3.5 km. Done.'), ['Walk 8,000 to 10,000 steps, about 3.5 km.', 'Done.']);
eq('empty / null', [splitSentences(''), splitSentences(null), parseNotes(undefined)], [[], [], { points: [], warnings: [] }]);

const real = 'Weeks 1 and 2: 2 sets of every exercise, light weights, learn the form. Weeks 3 and 4: 3 sets. Warm up for 8 to 10 min: 5 min easy treadmill walk, 10 arm circles each way. Cardio at talk test pace, roughly 130 to 150 bpm. Never hold your breath while straining. Chest pain, dizziness or weird breathlessness means stop, not push through. Protein target: about 130 to 135 g a day. Sore is normal. Sharp pain means stop.';
const r = parseNotes(real);
eq('real note: label is split off', r.points[0], { label: 'Weeks 1 and 2', text: '2 sets of every exercise, light weights, learn the form.' });
eq('real note: sentence without a label has none', r.points.find((p) => /talk test/.test(p.text)), { label: null, text: 'Cardio at talk test pace, roughly 130 to 150 bpm.' });
eq('real note: safety sentences are grouped as warnings', r.warnings.map((w) => w.text), ['Chest pain, dizziness or weird breathlessness means stop, not push through.', 'Sharp pain means stop.']);
eq('real note: nothing lost', r.points.length + r.warnings.length, 9);
eq('real note: long labels are not labels', parseNotes('This is a very long sentence that has a colon much later on in it: yes.').points[0].label, null);
eq('one point per line is respected, bullets stripped', parseNotes('- Warm up\n* Lift heavy\n1. Stretch').points.map((p) => p.text), ['Warm up', 'Lift heavy', 'Stretch']);
eq('tidy: one per line, warnings last', tidyNotes('Chest pain means stop. Warm up: 5 min. Eat well.'), 'Warm up: 5 min.\nEat well.\nChest pain means stop.');
eq('tidy is stable (tidying twice changes nothing)', tidyNotes(tidyNotes(real)), tidyNotes(real));
eq('tidy keeps all the words', tidyNotes(real).replace(/\s+/g, ' ').split(' ').length, real.replace(/\s+/g, ' ').split(' ').length);

const plan = { days: [{ extras: { notes: 'A' } }, { extras: { notes: ' A ' } }, { extras: { notes: 'B' } }, { extras: {} }, { extras: { notes: 'A' } }] };
eq('days with the same note', daysWithNote(plan, 'A', 0), [1, 4]);
eq('empty note matches nothing', daysWithNote(plan, '  ', 0), []);

console.log(fail ? `\n${fail} failed` : '\nAll notes tests passed');
process.exit(fail ? 1 : 0);
