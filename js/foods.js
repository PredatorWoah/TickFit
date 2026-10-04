// foods.js
// A small Indian food library for the plan builder, and the maths that sizes portions.
//
// COMPONENTS are single foods with their calories and protein per unit.
// OPTIONS are dishes made from components. One component is marked role "protein" and one
// "carb"; the builder scales those two so the meal hits its calorie and protein target.
//
// diet rank: 0 vegan, 1 vegetarian (dairy ok), 2 eggetarian, 3 non-veg.
// A person can eat any option whose rank is at or below their own.
//
// Numbers are typical home-cooked estimates, good enough to plan with, not lab values.

const n1 = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const grams = (per, label) => (n, as) => (as ? `${as} (${Math.round(n * per)} g ${label})` : `${Math.round(n * per)} g ${label}`);

/** Components: kcal and protein (g) PER 1 UNIT, plus how to write a quantity as text. */
export const COMP = {
  roti: { kcal: 100, p: 3, fmt: (n) => n1(n, 'roti', 'rotis') },
  paratha: { kcal: 150, p: 4, fmt: (n) => n1(n, 'plain paratha', 'plain parathas') },
  rice: { kcal: 200, p: 4, fmt: (n) => n1(n, 'cup cooked rice', 'cups cooked rice') },
  khichdi: { kcal: 200, p: 7, fmt: (n) => n1(n, 'cup moong dal khichdi', 'cups moong dal khichdi') },
  toast: { kcal: 80, p: 3, fmt: (n) => n1(n, 'slice whole wheat toast', 'slices whole wheat toast') },
  poha: { kcal: 250, p: 5, fmt: (n) => `${n} ${n === 1 ? 'plate' : 'plates'} vegetable poha` },
  oats: { kcal: 150, p: 5, fmt: (n) => `${Math.round(n * 40)} g oats` },
  idli: { kcal: 40, p: 2, fmt: (n) => n1(n, 'idli', 'idlis') },
  chilla_moong: { kcal: 90, p: 5, fmt: (n) => n1(n, 'moong dal chilla', 'moong dal chillas') },
  chilla_besan: { kcal: 120, p: 7, fmt: (n) => n1(n, 'besan chilla', 'besan chillas') },

  paneer: { kcal: 265, p: 18, fmt: grams(100, 'paneer') },
  tofu: { kcal: 120, p: 13, fmt: grams(100, 'tofu') },
  soya: { kcal: 100, p: 15, fmt: grams(30, 'soya chunks (dry weight)') },
  dal: { kcal: 150, p: 9, fmt: (n) => n1(n, 'bowl dal', 'bowls dal') },
  rajma: { kcal: 200, p: 11, fmt: (n) => n1(n, 'bowl rajma', 'bowls rajma') },
  chole: { kcal: 200, p: 11, fmt: (n) => n1(n, 'bowl chole', 'bowls chole') },
  kadhi: { kcal: 150, p: 6, fmt: (n) => n1(n, 'bowl kadhi', 'bowls kadhi') },
  egg: { kcal: 75, p: 6, fmt: (n, as) => (as ? `${as} (${n} ${n === 1 ? 'egg' : 'eggs'})` : n1(n, 'egg', 'eggs')) },
  chicken: { kcal: 165, p: 31, fmt: grams(100, 'chicken breast') },
  fish: { kcal: 130, p: 22, fmt: grams(100, 'fish') },
  sprouts: { kcal: 100, p: 8, fmt: (n, as) => (as ? `${as} (${n} ${n === 1 ? 'cup' : 'cups'} sprouts)` : n1(n, 'cup sprouts', 'cups sprouts')) },
  curd: { kcal: 90, p: 5, fmt: (n, as) => (as ? `${as} (${n} ${n === 1 ? 'bowl' : 'bowls'} curd)` : n1(n, 'bowl curd', 'bowls curd')) },
  buttermilk: { kcal: 40, p: 2, fmt: (n) => n1(n, 'glass buttermilk', 'glasses buttermilk') },
  milk: { kcal: 150, p: 8, fmt: (n) => n1(n, 'glass milk', 'glasses milk') },
  soymilk: { kcal: 100, p: 7, fmt: (n) => n1(n, 'glass soy milk', 'glasses soy milk') },
  whey: { kcal: 120, p: 24, fmt: (n) => n1(n, 'scoop whey protein', 'scoops whey protein') },
  peaprotein: { kcal: 110, p: 22, fmt: (n) => n1(n, 'scoop plant protein', 'scoops plant protein') },
  peanuts: { kcal: 170, p: 7, fmt: (n, as) => (as ? `${as} (${Math.round(n * 30)} g peanuts)` : `${Math.round(n * 30)} g peanuts`) },
  chana: { kcal: 110, p: 6, fmt: (n) => `${Math.round(n * 30)} g roasted chana` },
  makhana: { kcal: 110, p: 4, fmt: (n) => `${n} ${n === 1 ? 'cup' : 'cups'} roasted makhana` },
  almonds: { kcal: 55, p: 2, fmt: (n) => `${Math.round(n * 8)} almonds` },
  pbutter: { kcal: 95, p: 4, fmt: (n) => n1(n, 'tbsp peanut butter', 'tbsp peanut butter') },
  banana: { kcal: 105, p: 1, fmt: (n) => n1(n, 'banana', 'bananas') },
  fruit: { kcal: 70, p: 1, fmt: (n) => n1(n, 'serving seasonal fruit', 'servings seasonal fruit') },
  sabzi: { kcal: 90, p: 3, fmt: (n) => n1(n, 'bowl mixed vegetable sabzi', 'bowls mixed vegetable sabzi') },
  salad: { kcal: 25, p: 1, fmt: () => 'Cucumber and tomato salad' },
  sambar: { kcal: 70, p: 4, fmt: (n) => n1(n, 'bowl sambar', 'bowls sambar') },
  soup: { kcal: 80, p: 3, fmt: () => 'Clear vegetable soup' },
};

// Shorthand for building option items.
const P = (c, min, max, step, as) => ({ c, role: 'protein', min, max, step, as }); // scaled for protein
const C = (c, min, max, step, as) => ({ c, role: 'carb', min, max, step, as }); // scaled for calories
const F = (c, q = 1, as) => ({ c, q, as }); // fixed amount
const T = (text) => ({ text }); // a food with no calories to count (chutney, lemon...)

export const SLOTS = {
  breakfast: [
    { rank: 1, items: [P('paneer', 0.5, 2, 0.5, 'Paneer bhurji'), C('roti', 1, 4, 1)] },
    { rank: 1, items: [C('chilla_moong', 2, 6, 1), P('paneer', 0.5, 1.5, 0.5, 'Paneer filling'), T('Mint chutney')] },
    { rank: 1, items: [C('oats', 1, 3, 0.5), F('milk', 1), F('banana', 1), P('whey', 0, 1, 1)] },
    { rank: 1, items: [C('poha', 0.5, 2, 0.5), P('sprouts', 0.5, 2, 0.5, 'Sprouts on the side')] },
    { rank: 1, items: [C('chilla_besan', 2, 5, 1), P('curd', 1, 2, 0.5, 'Curd on the side')] },
    { rank: 1, items: [C('idli', 3, 8, 1), F('sambar', 1), P('peanuts', 0.5, 1.5, 0.5, 'Peanut chutney')] },
    { rank: 0, items: [P('tofu', 1, 3, 0.5, 'Tofu bhurji'), C('roti', 1, 4, 1)] },
    { rank: 0, items: [C('oats', 1, 3, 0.5), F('soymilk', 1), F('banana', 1), P('pbutter', 1, 3, 1)] },
    { rank: 0, items: [C('poha', 0.5, 2, 0.5), P('peanuts', 0.5, 2, 0.5, 'Peanuts in the poha')] },
    { rank: 2, items: [P('egg', 2, 5, 1, 'Egg bhurji'), C('roti', 1, 4, 1)] },
    { rank: 2, items: [P('egg', 2, 5, 1, 'Veg omelette'), C('toast', 2, 5, 1), T('Cucumber slices')] },
  ],
  lunch: [
    { rank: 1, items: [P('dal', 1, 2.5, 0.5), C('rice', 0.5, 3, 0.5), F('sabzi', 1), F('salad')] },
    { rank: 1, items: [P('rajma', 1, 2.5, 0.5), C('roti', 1, 5, 1), F('salad')] },
    { rank: 1, items: [P('paneer', 0.5, 2.5, 0.5, 'Paneer curry'), C('roti', 1, 5, 1), F('sabzi', 1), F('salad')] },
    { rank: 1, items: [P('soya', 1, 3, 0.5, 'Soya pulao with'), C('rice', 1, 3, 0.5), F('curd', 1, 'Raita')] },
    { rank: 1, items: [P('kadhi', 1, 2, 0.5), C('rice', 0.5, 3, 0.5), F('sabzi', 1)] },
    { rank: 0, items: [P('chole', 1, 2.5, 0.5), C('rice', 0.5, 3, 0.5), F('salad')] },
    { rank: 0, items: [P('tofu', 1, 3, 0.5, 'Tofu and vegetable stir fry'), C('rice', 0.5, 3, 0.5), F('salad')] },
    { rank: 0, items: [P('dal', 1, 2.5, 0.5), C('roti', 1, 5, 1), F('sabzi', 1)] },
    { rank: 2, items: [P('egg', 2, 5, 1, 'Egg curry'), C('rice', 0.5, 3, 0.5), F('salad')] },
    { rank: 3, items: [P('chicken', 1, 2.5, 0.5, 'Chicken curry'), C('rice', 0.5, 3, 0.5), F('salad')] },
    { rank: 3, items: [P('fish', 1, 2.5, 0.5, 'Grilled fish'), C('rice', 0.5, 3, 0.5), F('sabzi', 1)] },
    { rank: 3, items: [P('chicken', 1, 2.5, 0.5, 'Chicken tikka'), C('roti', 1, 5, 1), F('salad')] },
  ],
  snack: [
    { rank: 0, items: [P('sprouts', 1, 2.5, 0.5, 'Sprouts chaat'), C('chana', 0.5, 2, 0.5)] },
    { rank: 1, items: [P('curd', 1, 2, 0.5, 'Curd bowl'), F('fruit', 1), C('almonds', 1, 3, 1)] },
    { rank: 1, items: [P('milk', 1, 2, 1), C('makhana', 0.5, 2, 0.5)] },
    { rank: 0, items: [P('peanuts', 0.5, 2, 0.5, 'Peanut chaat'), C('banana', 0, 2, 1)] },
    { rank: 1, items: [P('whey', 1, 2, 1), C('banana', 1, 2, 1)] },
    { rank: 0, items: [P('peaprotein', 1, 2, 1), C('banana', 1, 2, 1)] },
    { rank: 0, items: [P('pbutter', 1, 3, 1), C('toast', 1, 3, 1)] },
    { rank: 2, items: [P('egg', 2, 4, 1, 'Boiled eggs'), F('fruit', 1)] },
  ],
  dinner: [
    // the lunch dishes work for dinner too (see mealOptions), plus these lighter ones
    { rank: 1, items: [P('paneer', 0.5, 2.5, 0.5, 'Paneer tikka'), C('roti', 1, 4, 1), F('soup')] },
    { rank: 1, items: [C('khichdi', 1, 3, 0.5), P('curd', 1, 2, 0.5, 'Curd with the khichdi')] },
    { rank: 0, items: [P('tofu', 1, 3, 0.5, 'Tofu curry'), C('roti', 1, 4, 1), F('sabzi', 1)] },
  ],
};

/** Boosters add a little extra energy to a meal that is still short of its target. All are vegan. */
const BOOSTERS = ['banana', 'pbutter', 'almonds', 'chana'];

export const RANK = { vegan: 0, veg: 1, egg: 2, nonveg: 3 };

/** Options a person can eat for a slot, with their own diet's special dishes first. */
export function mealOptions(slot, diet) {
  const rank = RANK[diet] ?? 1;
  const pool = slot === 'dinner' ? [...SLOTS.dinner, ...SLOTS.lunch] : SLOTS[slot];
  const allowed = pool.filter((o) => o.rank <= rank);
  // Put the dishes that use the person's extra food types (eggs, chicken) first so they show up.
  return rank >= 2 ? [...allowed.filter((o) => o.rank >= 2), ...allowed.filter((o) => o.rank < 2)] : allowed;
}

const roundTo = (v, step) => Math.round(v / step) * step;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Size one dish to a target.
 * Returns { items: [text], calories, protein } using the amounts actually chosen.
 */
export function sizeMeal(option, targetKcal, targetProtein) {
  const fixed = option.items.filter((i) => i.q !== undefined);
  const prot = option.items.find((i) => i.role === 'protein');
  const carb = option.items.find((i) => i.role === 'carb');
  const sum = (items, key) => items.reduce((t, i) => t + COMP[i.c][key] * i.q, 0);

  const remK = targetKcal - sum(fixed, 'kcal');
  const remP = targetProtein - sum(fixed, 'p');
  const qty = new Map();

  const fit = (item, wanted) => {
    const v = clamp(roundTo(wanted, item.step), item.min, item.max);
    qty.set(item, v);
    return v;
  };

  if (prot && carb) {
    // Two unknowns, two targets: solve for protein units and carb units.
    const a = COMP[prot.c].kcal, b = COMP[carb.c].kcal, c = COMP[prot.c].p, d = COMP[carb.c].p;
    const det = a * d - b * c;
    const pUnits = Math.abs(det) > 1e-6 ? (remK * d - b * remP) / det : (remP / c);
    let pv = fit(prot, pUnits);
    let cv = fit(carb, (remK - pv * a) / b); // then use calories to size the carb
    // Calories come first: if the protein push made the meal too big, trim protein, then carbs.
    const fixedK = sum(fixed, 'kcal');
    for (let i = 0; i < 30 && fixedK + pv * a + cv * b > targetKcal * 1.08; i++) {
      if (pv > prot.min) pv = fit(prot, pv - prot.step);
      else if (cv > carb.min) cv = fit(carb, cv - carb.step);
      else break;
    }
  } else if (carb) fit(carb, remK / COMP[carb.c].kcal);
  else if (prot) fit(prot, remK / COMP[prot.c].kcal);

  const totals = (list) => ({
    kcal: list.reduce((t, [i, q]) => t + COMP[i.c].kcal * q, 0),
    p: list.reduce((t, [i, q]) => t + COMP[i.c].p * q, 0),
  });
  const scaled = [...qty.entries()];
  const base = totals([...fixed.map((i) => [i, i.q]), ...scaled]);

  // Still well short? Add a small booster so large targets are met without absurd portions.
  const extras = [];
  let kcal = base.kcal, p = base.p;
  let shortfall = targetKcal - kcal;
  for (const id of BOOSTERS) {
    if (shortfall < 90) break;
    if (option.items.some((i) => i.c === id)) continue;
    extras.push(id);
    kcal += COMP[id].kcal;
    p += COMP[id].p;
    shortfall = targetKcal - kcal;
  }

  const items = [];
  for (const it of option.items) {
    if (it.text) items.push(it.text);
    else if (it.q !== undefined) items.push(COMP[it.c].fmt(it.q, it.as));
    else if (qty.get(it) > 0) items.push(COMP[it.c].fmt(qty.get(it), it.as));
  }
  for (const id of extras) items.push(COMP[id].fmt(1));

  return { items, calories: Math.round(kcal / 5) * 5, protein: Math.round(p) };
}
