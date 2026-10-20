// Grocery list and meal swaps. Run: node tests/groceries.mjs
import { groceryList, groceryText, swapOptions } from '../js/groceries.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const meal = (id, name, items, calories, protein, extra = {}) => ({ id, name, items, time: '', calories, protein, ...extra });
const plan = { startDate: '2026-10-01', days: [
  { label: 'A', workout: [], meals: [meal('m1', 'Breakfast', ['2 rotis', '200 ml milk'], 350, 12), meal('m2', 'Lunch', ['100 g paneer', '1 bowl dal', 'salad'], 600, 30)], extras: {} },
  { label: 'B', workout: [], meals: [meal('m1', 'Breakfast', ['1 roti', '1 litre milk'], 500, 20), meal('m2', 'Lunch', ['150g paneer', 'Salad'], 500, 30)], extras: {} },
] };
const list = groceryList(plan, '2026-10-01', 2);
const by = (k) => list.find((g) => g.key === k || g.name.toLowerCase() === k);
ok(by('roti') ? by('roti').count === 3 : list.some((g) => /roti/i.test(g.name) && g.count === 3), '2 rotis + 1 roti = 3: ' + JSON.stringify(list.find((g) => /roti/i.test(g.name))));
const paneer = list.find((g) => /paneer/i.test(g.name));
ok(paneer && paneer.grams === 250, '100 g + 150g paneer = 250 g');
const milk = list.find((g) => /milk/i.test(g.name));
ok(milk && milk.ml === 1200, '200 ml + 1 litre milk = 1.2 L: ' + JSON.stringify(milk));
const salad = list.find((g) => /salad/i.test(g.name));
ok(salad && salad.count === 2 && salad.uses === 2, 'an unknown food is grouped by its text (salad, Salad): ' + JSON.stringify(salad));
ok(groceryText({ name: 'Paneer', grams: 1250, ml: 0, count: 0 }) === 'Paneer 1.3 kg' && groceryText({ name: 'Milk', grams: 0, ml: 1200, count: 0 }) === 'Milk 1.2 L' && groceryText({ name: 'Roti', grams: 0, ml: 0, count: 14 }) === 'Roti × 14', 'readable amounts');

const cands = [
  { id: 'a', category: 'Breakfast', item: meal('a', 'Poha', ['poha'], 360, 10) },
  { id: 'b', category: 'Dinner', item: meal('b', 'Biryani', ['biryani'], 800, 25) },
  { id: 'c', category: 'Breakfast', item: meal('c', 'Oats', ['oats'], 340, 13) },
  { id: 'd', category: 'Breakfast', item: meal('d', 'Paratha', ['paratha'], 350, 12) },
];
const opts = swapOptions(meal('d', 'Paratha', ['paratha'], 350, 12, { category: 'Breakfast' }), cands);
ok(!opts.some((o) => o.cand.id === 'd'), 'the meal itself is not offered');
ok(opts[0].cand.id === 'c' || opts[0].cand.id === 'a', 'closest calories and protein, same category first: ' + opts.map((o) => o.cand.item.name).join(', '));
ok(opts[opts.length - 1].cand.id === 'b' && opts[opts.length - 1].dk === 450, 'a far heavier dinner comes last, with its +450 kcal difference');

console.log(fail ? `\n${fail} failed` : '\nAll grocery tests passed');
process.exit(fail ? 1 : 0);
