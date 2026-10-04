// stats.js
// Pure functions that count what is done in a day. No DOM, easy to test.
//
// A progress "record" for one date looks like:
//   { ticks: { w1: true, m2: true, s1: true }, weights: { w1: 20 }, waterMl: 1500, notes: "..." }

export const WATER_STEP_ML = 250;

/** Everything that can be ticked in a day: [{id, kind}] */
export function dayItems(day) {
  const items = [];
  day.workout.forEach((w) => items.push({ id: w.id, kind: 'workout' }));
  day.meals.forEach((m) => items.push({ id: m.id, kind: 'meal' }));
  day.extras.supplements.forEach((_, i) => items.push({ id: `s${i + 1}`, kind: 'supp' }));
  if (day.extras.waterLiters) items.push({ id: 'water', kind: 'water' });
  return items;
}

/** Is one item done? Water counts as done once the target is reached. */
export function isDone(day, record, item) {
  if (item.kind === 'water') {
    return (record.waterMl || 0) >= day.extras.waterLiters * 1000;
  }
  return !!(record.ticks && record.ticks[item.id]);
}

/** { done, total, pct } for a day. A day with nothing to do is 0 of 0. */
export function dayStats(day, record) {
  const items = dayItems(day);
  const done = items.filter((it) => isDone(day, record || {}, it)).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

/** Calories and protein: planned total and eaten (ticked meals). Null when the plan has none. */
export function mealTotals(day, record) {
  const sum = (key, onlyEaten) => {
    let any = false;
    let total = 0;
    for (const m of day.meals) {
      if (typeof m[key] !== 'number') continue;
      if (onlyEaten && !(record.ticks && record.ticks[m.id])) {
        any = true;
        continue;
      }
      any = true;
      total += m[key];
    }
    return any ? total : null;
  };
  return {
    calories: sum('calories', false),
    caloriesEaten: sum('calories', true),
    protein: sum('protein', false),
    proteinEaten: sum('protein', true),
  };
}
