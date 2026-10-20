// groceries.js
// Meal helpers, all pure (tests/groceries.mjs):
//   groceryList   everything the week's meals need, added up ("Roti × 14", "Paneer 700 g")
//   swapOptions   meals that could replace one, closest in calories and protein first

import { addDays } from './dates.js';
import { dayFor } from './schedule.js';
import { parseQuantity, matchFood } from './estimate.js';
import { mealNumbers } from './stats.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
// "2 rotis" -> "rotis", "100 g paneer" -> "paneer", "1 bowl dal" -> "bowl dal"
const bare = (line) =>
  norm(line)
    .replace(/^(about|around|approx\.?)\s+/, '')
    .replace(/^[\d.,/½¼\s]+(?:(?:to|or|-|–)\s*[\d.,/]+\s*)?(kg|kgs|kilograms?|grams?|gms?|g|ml|millilitres?|litres?|l)?\b\s*/, '')
    .replace(/^(a|an|one|two|three|four|five|half)\s+/, '')
    .replace(/^(of)\s+/, '')
    .trim();
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Add up every food line of the meals from `start` for `days` days.
 * Returns [{ key, name, count, grams, ml, uses }] sorted by name. A food is grouped by the built-in food it
 * matches (so "2 rotis" and "1 roti" add up), otherwise by its text without the amount.
 */
export function groceryList(plan, start, days = 7) {
  const map = new Map();
  for (let i = 0; i < days; i++) {
    const day = dayFor(plan, addDays(start, i));
    for (const meal of day.meals) {
      for (const line of meal.items || []) {
        const text = String(line || '').trim();
        if (!text) continue;
        const food = matchFood(text);
        const key = food ? food[4] : bare(text) || norm(text);
        const q = parseQuantity(text);
        const isMl = /\b(ml|millilitres?|litres?|l)\b/i.test(text);
        const g = map.get(key) || { key, name: title(key.replace(/\s*\([^)]*\)/g, '').trim() || key), count: 0, grams: 0, ml: 0, uses: 0 };
        g.uses++;
        if (q.grams !== null) {
          if (isMl) g.ml += q.grams;
          else g.grams += q.grams;
        } else g.count += q.n ?? 1;
        map.set(key, g);
      }
    }
  }
  return [...map.values()].map((g) => ({ ...g, count: Math.round(g.count * 10) / 10, grams: Math.round(g.grams), ml: Math.round(g.ml) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** "Roti × 14", "Paneer 700 g", "Milk 1.4 L", "Dal × 7 servings". Pure. */
export function groceryText(g) {
  const parts = [];
  if (g.grams) parts.push(g.grams >= 1000 ? `${Math.round(g.grams / 100) / 10} kg` : `${g.grams} g`);
  if (g.ml) parts.push(g.ml >= 1000 ? `${Math.round(g.ml / 100) / 10} L` : `${g.ml} ml`);
  if (g.count) parts.push(`× ${g.count}`);
  return `${g.name} ${parts.join(' + ')}`.trim();
}

/**
 * Meals that could take the place of `meal`, best first: closest in calories and protein, a bonus for the
 * same category (breakfast for breakfast). Each: { cand, kcal, protein, dk, dp, score }.
 * @param cands  candidates from library.js candidates(plan, date, 'meals')
 */
export function swapOptions(meal, cands, max = 8) {
  const me = mealNumbers(meal);
  const myCat = norm(meal.category || meal.name);
  return cands
    .filter((c) => norm(c.item.name) !== norm(meal.name))
    .map((c) => {
      const n = mealNumbers(c.item);
      const kcal = n.calories;
      const protein = n.protein;
      let score = 0;
      if (typeof me.calories === 'number' && typeof kcal === 'number') score += Math.abs(kcal - me.calories) / Math.max(me.calories, 100);
      else score += 0.6;
      if (typeof me.protein === 'number' && typeof protein === 'number') score += Math.abs(protein - me.protein) / Math.max(me.protein, 10);
      else score += 0.6;
      if (norm(c.category) && (norm(c.category) === myCat || myCat.includes(norm(c.category)))) score -= 0.3;
      return { cand: c, kcal, protein, dk: typeof kcal === 'number' && typeof me.calories === 'number' ? kcal - me.calories : null, dp: typeof protein === 'number' && typeof me.protein === 'number' ? Math.round((protein - me.protein) * 10) / 10 : null, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, max);
}
