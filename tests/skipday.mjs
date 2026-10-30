// Skip day: a skipped date is neutral for streaks and weekly %, quiets reminders, and survives merges. Run: node tests/skipday.mjs
import { parsePlanText } from '../js/parser.js';
import { pctFor, currentStreak, longestStreak, weekPercent, isSkipped } from '../js/stats.js';
import { reminderList, reminderSettings } from '../js/reminders.js';
import { hasProgress } from '../js/merge.js';
import { dayFor } from '../js/schedule.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const raw = { name: 'Skip', days: [{ label: 'Day 1', workout: [{ exercise: 'Press', sets: 3, reps: '10' }, { exercise: 'Row', sets: 3, reps: '10' }], meals: [{ name: 'Lunch', time: '1:00 PM', items: ['Dal'] }] }] };
const plan = parsePlanText(JSON.stringify(raw)).plan;
plan.startDate = '2026-10-20';
const ids = (date) => [...dayFor(plan, date).workout, ...dayFor(plan, date).meals].map((x) => x.id);
const done = (date) => ({ ticks: Object.fromEntries(ids(date).map((i) => [i, true])), weights: {}, sets: {}, waterMl: 0, notes: '' });

const records = { '2026-10-20': done('2026-10-20'), '2026-10-21': done('2026-10-21'), '2026-10-23': done('2026-10-23') };
const today = '2026-10-23';
ok(currentStreak(plan, records, today) === 1, 'a missed day (22nd) breaks the streak');
records['2026-10-22'] = { ticks: {}, weights: {}, sets: {}, waterMl: 0, notes: '', skipped: true };
ok(pctFor(plan, records, '2026-10-22') === null, 'a skipped day has no percentage, like a rest day');
ok(currentStreak(plan, records, today) === 3, 'skipping the day keeps the streak going (it does not count, it does not break)');
ok(longestStreak(plan, records, today) === 3, 'and the longest streak');
ok(weekPercent(plan, records, today) === 100, 'a skipped day does not drag the week down');
ok(isSkipped(records, '2026-10-22') && !isSkipped(records, '2026-10-21') && !isSkipped(undefined, '2026-10-22'), 'isSkipped tells');

// ticks on a skipped day are kept, and undo brings the day back
records['2026-10-21'].skipped = true;
ok(pctFor(plan, records, '2026-10-21') === null && records['2026-10-21'].ticks.w1 === true, 'ticked sets stay on a skipped day');
delete records['2026-10-21'].skipped;
ok(pctFor(plan, records, '2026-10-21') === 100, 'undo brings the day back as it was');

// reminders
const settings = { reminders: { workout: { on: true, time: '18:00' }, meals: { on: true }, water: { on: false } } };
const now = new Date('2026-10-23T07:00:00');
const day = (list, d) => list.filter((x) => x.at.getDate() === d).length;
const before = reminderList(plan, {}, settings, now, 2);
ok(day(before, 23) > 0, 'reminders exist for an ordinary day (' + before.length + ')');
const after = reminderList(plan, { '2026-10-23': { ticks: {}, skipped: true } }, settings, now, 2);
ok(day(after, 23) === 0 && day(after, 24) > 0, 'a skipped day has no reminders, the next day still does');

// merge / safety count a skip as something worth keeping
ok(hasProgress({ ticks: {}, skipped: true }) && !hasProgress({ ticks: {} }), 'a skip counts as progress when plans are merged');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
