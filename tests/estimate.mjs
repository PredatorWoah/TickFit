// Tests for the offline food estimate. Run: node tests/estimate.mjs
import { parseQuantity, estimateLine, estimateMeal } from '../js/estimate.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const kp = (line) => { const e = estimateLine(line); return e ? [e.kcal, e.protein] : null; };

eq('2 rotis', kp('2 rotis'), [200, 6]);
eq('no number means one', kp('Roti'), [100, 3]);
eq('100 g paneer', kp('100 g paneer'), [265, 18]);
eq('150g paneer (no space)', kp('150g paneer'), [398, 27]);
eq('1 or 2 bananas = 1.5', kp('1 or 2 bananas'), [158, 1.5]);
eq('a bowl of dal', kp('A bowl of dal'), [150, 9]);
eq('big bowl of curd is 1.5', kp('A big bowl of curd'), [135, 7.5]);
eq('2 eggs', kp('2 eggs'), [150, 12]);
eq('egg whites are not whole eggs', kp('3 egg whites'), [51, 10.8]);
eq('1 scoop whey with water or milk', kp('1 scoop whey with water or milk'), [120, 24]);
eq('soy milk is not milk', kp('1 glass soy milk'), [100, 7]);
eq('peanut butter is not peanuts', kp('1 tbsp peanut butter'), [95, 4]);
eq('two rotis in words', kp('two rotis'), [200, 6]);
eq('half a banana', kp('half a banana'), [53, 0.5]);
eq('1/2 cup rice', kp('1/2 cup rice'), [100, 2]);
eq('chana bowl is curry', kp('Chana or rajma bowl with cucumber, tomato, onion and lemon')[0], 200);
eq('plain water is zero', kp('Plain water'), [0, 0]);
eq('soya chunks by weight: 60 g dry = 2 servings', kp('60 g soya chunks'), [200, 30]);
eq('grams on a counted food are ignored', kp('100 g roti'), [100, 3]);
eq('first food named wins in an or-line', kp('About 100 g paneer or soya chunks'), [265, 18]);
eq('unknown food is null', kp('Quinoa XYZ'), null);
eq('empty is null', [estimateLine(''), estimateLine(null), estimateLine('   ')], [null, null, null]);
eq('absurd quantity is capped', estimateLine('2000 rotis').kcal, 2000);

eq('quantity: range of grams', parseQuantity('100 to 150 g paneer').grams, 125);
eq('quantity: kg', parseQuantity('0.5 kg chicken').grams, 500);
eq('quantity: default', parseQuantity('curd'), { n: 1, grams: null });

const m = estimateMeal(['2 rotis', 'A bowl of dal', 'Mystery sauce 9', '', 'Cucumber salad']);
eq('meal totals', [m.calories, m.protein], [375, 16]);
eq('meal reports what it could not find', m.missing, ['Mystery sauce 9']);
eq('meal of nothing', estimateMeal([]), { calories: 0, protein: 0, found: [], missing: [] });
eq('meal with undefined', estimateMeal(undefined).calories, 0);
console.log(fail ? `\n${fail} failed` : '\nAll estimate tests passed');
process.exit(fail ? 1 : 0);
