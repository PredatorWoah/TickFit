// Tests for which plan day lands on which date. Run: node tests/schedule.mjs
import { weekdayOfLabel, weeklyWeekdays, dayIndexFor, dayFor, jumpDelta } from '../js/schedule.js';
import { pctFor, currentStreak, longestStreak, weekPercent } from '../js/stats.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const day = (label, workout = [{ id: 'w1' }]) => ({ label, workout, meals: [{ id: 'm1' }], extras: { waterLiters: null, supplements: [], notes: '' } });

// 2026-10-04 is a Sunday, 10-05 Monday ... 10-10 Saturday
const weekly = { id: 'p', startDate: '2026-10-04', days: ['Monday Chest', 'Tuesday Back', 'Wednesday Legs', 'Thursday Shoulders', 'Friday Arms', 'Saturday Full Body'].map((l) => day(l)) };
const cyclic = { id: 'c', startDate: '2026-10-04', days: [day('Week 1 Day 1'), day('Week 1 Day 2'), day('Week 1 Day 3')] };

eq('label: Monday Chest', weekdayOfLabel('Monday Chest + Triceps'), 0);
eq('label: Tue: Back', weekdayOfLabel('Tue: Back'), 1);
eq('label: sunday', weekdayOfLabel('  sunday rest'), 6);
eq('label: Thursday', weekdayOfLabel('Thursday Shoulders'), 3);
eq('label: "Week 1 Monday" is not a weekday label', weekdayOfLabel('Week 1 Monday'), -1);
eq('label: "Sunrise run" is not Sunday', weekdayOfLabel('Sunrise run'), -1);
eq('label: Day 1', weekdayOfLabel('Day 1 Push'), -1);
eq('label: Tues and Thurs short forms', [weekdayOfLabel('Tues Back'), weekdayOfLabel('Thurs Arms')], [1, 3]);
eq('label: Monster workout is not Monday', weekdayOfLabel('Monster workout'), -1);

eq('weekly plan detected', (weeklyWeekdays(weekly) !== null), true);
eq('cyclic plan is not weekly', (weeklyWeekdays(cyclic) !== null), false);
eq('repeated weekday is not weekly', weeklyWeekdays({ days: [day('Monday A'), day('Monday B')] }) !== null, false);
eq('mixed labels are not weekly', weeklyWeekdays({ days: [day('Monday A'), day('Day 2')] }) !== null, false);

eq('Sunday of a Mon-Sat plan is a rest day', dayIndexFor(weekly, '2026-10-04'), -1);
eq('Monday is entry 0', dayIndexFor(weekly, '2026-10-05'), 0);
eq('Saturday is entry 5', dayIndexFor(weekly, '2026-10-10'), 5);
eq('next Monday again entry 0 (no 6 day drift)', dayIndexFor(weekly, '2026-10-12'), 0);
eq('next Sunday still rest', dayIndexFor(weekly, '2026-10-11'), -1);
eq('weekly plan ignores start date', dayIndexFor({ ...weekly, startDate: '2020-01-01' }, '2026-10-06'), 1);
eq('rest day has nothing to do', dayFor(weekly, '2026-10-04').workout.length + dayFor(weekly, '2026-10-04').meals.length, 0);
eq('rest day label names the weekday', dayFor(weekly, '2026-10-04').label, 'Sunday (rest)');
eq('cyclic plan still cycles', [0, 1, 2, 3].map((n) => dayIndexFor(cyclic, `2026-10-0${4 + n}`)), [0, 1, 2, 0]);

// jumping from Sunday 10-04
eq('jump to Monday from Sunday is +1', jumpDelta(weekly, '2026-10-04', 0), 1);
eq('jump to Saturday from Sunday is -1', jumpDelta(weekly, '2026-10-04', 5), -1);
eq('jump to Thursday from Sunday is +4 -> -3', jumpDelta(weekly, '2026-10-04', 3), -3);
eq('cyclic jump', jumpDelta(cyclic, '2026-10-04', 2), -1);

// rest days must not break streaks or drag the week down
const done = { ticks: { w1: true, m1: true } };
const rec = { '2026-10-05': done, '2026-10-06': done, '2026-10-07': done, '2026-10-08': done, '2026-10-09': done, '2026-10-10': done, '2026-10-12': done };
eq('rest day gives null pct', pctFor(weekly, rec, '2026-10-04'), null);
eq('streak runs across the Sunday rest day', currentStreak(weekly, rec, '2026-10-12'), 7);
eq('streak on a rest day today counts the week so far', currentStreak(weekly, { ...rec }, '2026-10-11'), 6);
eq('a missed day still breaks it', currentStreak(weekly, { ...rec, '2026-10-08': {} }, '2026-10-12'), 3);
eq('longest streak across rest day', longestStreak(weekly, rec, '2026-10-12'), 7);
eq('week percent ignores rest days', weekPercent(weekly, rec, '2026-10-11'), 100);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
