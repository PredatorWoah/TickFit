// Tests for streaks and weekly numbers. Run: node tests/stats.mjs
import { currentStreak, longestStreak, weekPercent, pctFor, dayStats } from '../js/stats.js';
import { planDayIndex } from '../js/dates.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// A 2 day plan: day 1 has 1 exercise + 1 meal, day 2 is a rest day with 1 meal.
const day = (workout, meals) => ({ label: 'd', workout, meals, extras: { waterLiters: null, supplements: [], notes: '' } });
const plan = {
  id: 'p', startDate: '2026-01-01',
  days: [day([{ id: 'w1' }], [{ id: 'm1' }]), day([], [{ id: 'm1' }])],
};
const all = { ticks: { w1: true, m1: true } };
const half = { ticks: { m1: true } };

eq('planDayIndex wraps', [0, 1, 0, 1].map((n) => planDayIndex('2026-01-01', `2026-01-0${n + 1}`, 2)), [0, 1, 0, 1]);
eq('planDayIndex before start', planDayIndex('2026-01-05', '2026-01-04', 2), 1);
eq('dayStats half', dayStats(plan.days[0], half).pct, 50);
eq('pctFor empty', pctFor(plan, {}, '2026-01-01'), 0);

const rec = { '2026-01-01': all, '2026-01-02': all, '2026-01-03': half, '2026-01-04': all };
eq('streak ends today', currentStreak(plan, rec, '2026-01-04'), 4);
eq('unfinished today does not break streak', currentStreak(plan, { ...rec, '2026-01-05': {} }, '2026-01-05'), 4);
eq('a missed day breaks it', currentStreak(plan, { ...rec, '2026-01-04': {} }, '2026-01-05'), 0);
eq('longest streak', longestStreak(plan, { '2026-01-01': all, '2026-01-02': {}, '2026-01-03': all, '2026-01-04': all }, '2026-01-04'), 2);
eq('week percent of 4 days', weekPercent(plan, rec, '2026-01-04'), Math.round((100 + 100 + 50 + 100) / 4));
eq('week percent before start is null', weekPercent(plan, {}, '2025-12-30'), null);
eq('streak before start is 0', currentStreak(plan, {}, '2025-12-30'), 0);

// meals without numbers (a pasted plan) get estimates from the food names
import { mealNumbers, mealTotals } from '../js/stats.js';
eq('mealNumbers keeps the plan numbers', mealNumbers({ items: ['2 rotis'], calories: 999, protein: 9 }), { calories: 999, protein: 9, estimated: false });
eq('mealNumbers estimates when missing', mealNumbers({ items: ['2 rotis', 'A bowl of dal'] }), { calories: 350, protein: 15, estimated: true });
eq('mealNumbers fills only the missing one', mealNumbers({ items: ['2 rotis'], calories: 500 }), { calories: 500, protein: 6, estimated: true });
eq('mealNumbers with unknown foods is null', mealNumbers({ items: ['Mystery'] }), { calories: null, protein: null, estimated: false });
const pasted = { meals: [{ id: 'm1', items: ['2 rotis'] }, { id: 'm2', items: ['1 scoop whey'] }] };
eq('mealTotals uses estimates and says so', mealTotals(pasted, { ticks: { m1: true } }), { calories: 320, caloriesEaten: 200, protein: 30, proteinEaten: 6, estimated: true });
eq('mealTotals with real numbers is not estimated', mealTotals({ meals: [{ id: 'a', items: ['x'], calories: 100, protein: 5 }] }, { ticks: {} }).estimated, false);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
