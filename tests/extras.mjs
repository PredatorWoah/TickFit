// Tests for 1.12.0: reminders (times and the list), the spreadsheet export, and the step log. Run: node tests/extras.mjs
import { parseTime, reminderList } from '../js/reminders.js';
import { cell, dailyCsv, setsCsv } from '../js/csv.js';
import { validSteps, midnightIso } from '../js/steps.js';
import { cleanStepLog } from '../js/store.js';
import { addDays, toStr } from '../js/dates.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

// ----- times -----
eq('8:00 AM', parseTime('8:00 AM'), 480);
eq('1:30pm', parseTime('1:30pm'), 810);
eq('12 am is midnight, 12 pm is noon', [parseTime('12 am'), parseTime('12pm')], [0, 720]);
eq('24 hour clock', [parseTime('13:00'), parseTime('07.45'), parseTime('0:05')], [780, 465, 5]);
eq('not times', [parseTime('8'), parseTime('25:00'), parseTime('13 pm'), parseTime('8:75'), parseTime('after gym'), parseTime(''), parseTime(null)], [null, null, null, null, null, null, null]);

// ----- reminder list -----
const now = new Date(2026, 9, 20, 10, 0); // Tue 20 Oct 2026, 10:00
const today = toStr(now);
const meal = (id, name, time) => ({ id, name, time, items: ['Poha', 'Milk'] });
const day = (label, workout) => ({ label, workout, meals: [meal('m1', 'Breakfast', '8:00 AM'), meal('m2', 'Lunch', '1:00 PM'), meal('m3', 'Snack', 'whenever')], extras: { waterLiters: 3, supplements: [], notes: '' } });
const ex = (id) => ({ id, exercise: 'Bench', sets: 3, reps: '10', weight: '', rest: '', notes: '', video: '' });
const plan = { id: 'p', name: 'P', startDate: today, days: [day('Push', [ex('a'), ex('b')]), day('Rest', [])] };
const off = { reminders: {} };
eq('all off: nothing', reminderList(plan, {}, off, now).length, 0);
const on = { reminders: { workout: { on: true, time: '18:00' }, meals: { on: true }, water: { on: true, from: '09:00', to: '21:00', every: 4 } } };
const list = reminderList(plan, {}, on, now, 2);
const todays = list.filter((x) => toStr(x.at) === today);
eq('today: lunch, water 13 17 21, workout (8 AM breakfast and 9 AM water have passed)', todays.map((x) => `${x.at.getHours()}:${x.title}`), ['13:Lunch', '13:Water break', '17:Water break', '18:Time to train', '21:Water break']);
eq('workout text names the day', todays.find((x) => x.title === 'Time to train').body, 'Push: 2 exercises');
const tomorrow = list.filter((x) => toStr(x.at) === addDays(today, 1));
eq('rest day: no workout reminder, meals and water still', [tomorrow.some((x) => x.title === 'Time to train'), tomorrow.filter((x) => x.title === 'Breakfast').length], [false, 1]);
eq('meal with no clear time is skipped', list.some((x) => x.title === 'Snack'), false);
eq('ids are unique and in the reminder range', new Set(list.map((x) => x.id)).size === list.length && list.every((x) => x.id >= 5000 && x.id <= 5999), true);
const doneRec = { [today]: { ticks: { a: true, b: true, m2: true }, waterMl: 3000 } };
eq('done today: no workout, lunch or water reminders', reminderList(plan, doneRec, on, now, 1).length, 0);

// ----- csv -----
eq('cells: quotes, commas, formulas', [cell('a,b'), cell('say "hi"'), cell('=SUM(A1)'), cell(-3), cell(null), cell('line\nbreak')], ['"a,b"', '"say ""hi"""', "'=SUM(A1)", '-3', '', '"line\nbreak"']);
const st = {
  progress: { p: { [today]: { ticks: { a: true, m1: true }, sets: { a: [{ w: 40, r: 10, done: true }, { w: 40, r: 8, done: true }, { w: 40, r: 8, done: false }] }, waterMl: 1500, notes: 'Felt strong, new PR' } } },
  bodyLog: { [addDays(today, -1)]: 72.4 },
  stepLog: { [today]: 8412 },
  measureLog: { [today]: { waist: 84 } },
};
const daily = dailyCsv(st, plan).trim().split('\r\n');
eq('daily: header + 2 dates', daily.length, 3);
eq('daily header', daily[0].startsWith('Date,Plan day,Done %,Items done,Items,Sets done,Volume kg,Calories eaten,Protein eaten g,Water ml,Body weight kg,Steps,Waist cm'), true);
eq('weight-only day', daily[1].split(',').slice(0, 2).concat(daily[1].split(',')[10]), [addDays(today, -1), 'Rest', '72.4']);
const row = daily[2];
eq('today row: sets 2, volume 720, water, steps, waist, notes quoted', [row.includes(',2,720,'), row.includes(',1500,'), row.includes(',8412,84,'), row.endsWith('"Felt strong, new PR"')], [true, true, true, true]);
eq('sets csv', setsCsv(st, plan).trim().split('\r\n'), ['Date,Exercise,Set,Weight kg,Reps', `${today},Bench,1,40,10`, `${today},Bench,2,40,8`]);

// ----- steps -----
eq('valid steps', [validSteps(8412.4), validSteps(-1), validSteps('x'), validSteps(500000)], [8412, null, null, null]);
eq('step log cleaned', cleanStepLog({ '2026-10-20': 8000, bad: 5, '2026-10-21': -4, '2026-10-22': '700' }), { '2026-10-20': 8000, '2026-10-22': 700 });
const mid = new Date(midnightIso('2026-10-20'));
eq('query starts at local midnight', [mid.getHours(), mid.getMinutes(), toStr(mid)], [0, 0, '2026-10-20']);

console.log(fail ? `\n${fail} failed` : '\nAll extras tests passed');
process.exit(fail ? 1 : 0);
