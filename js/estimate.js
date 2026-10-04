// estimate.js
// Rough calories and protein for a line of food text like "2 rotis" or "100 g paneer".
// Works fully offline from a small built-in table of common (mostly Indian) foods. Pure functions.
//
// These are typical home-portion estimates, good enough to plan a day with, not lab values.

// [pattern, kcal, protein (g), grams in one serving (or null), name]. One "serving" is what the name says:
// 1 roti, 1 egg, 1 bowl of dal, 100 g paneer. FIRST MATCH IN THE TEXT WINS, and specific ones sit above general ones.
const FOODS = [
  // things that add nothing
  [/\b(plain )?water\b|\bblack coffee\b|\bblack tea\b|\bgreen tea\b|\bsoda water\b|\bzero.?sugar\b/, 0, 0, null, 'water, black tea or coffee'],
  // specific beans and curries first (a "bowl of chana" means curry, not roasted snack)
  [/\b(chole|chana masala|chana curry|chickpea curry)\b|\b(chana|rajma|chickpeas?|kidney beans?)\b.*\bbowl\b|\bbowl\b.*\b(chana|rajma)\b/, 200, 11, null, 'chole / rajma bowl'],
  [/\broasted chana\b|\bchana\b/, 110, 6, 30, 'roasted chana'],
  [/\brajma\b/, 200, 11, null, 'rajma'],
  [/\bsoy(a)? milk\b/, 100, 7, null, 'soy milk'],
  [/\bsoya\b|\bsoy chunks?\b|\bnutrela\b|\bmeal maker\b/, 100, 15, 30, 'soya chunks (dry)'],
  [/\bpeanut butter\b/, 95, 4, null, 'peanut butter (tbsp)'],
  [/\bpeanuts?\b|\bmoongphali\b/, 170, 7, 30, 'peanuts'],
  [/\begg whites?\b/, 17, 3.6, null, 'egg white'],
  [/\bomelet(te)?\b/, 160, 11, null, 'omelette (2 eggs)'],
  [/\beggs?\b|\banda\b/, 75, 6, null, 'egg'],
  [/\bchicken (curry|masala|gravy)\b/, 150, 16, 100, 'chicken curry'],
  [/\bchicken\b/, 165, 31, 100, 'chicken breast'],
  [/\bfish\b|\bsalmon\b|\btuna\b|\brohu\b|\bpomfret\b/, 130, 22, 100, 'fish'],
  [/\bmutton\b|\blamb\b|\bgoat\b/, 250, 25, 100, 'mutton'],
  [/\bpaneer\b|\bcottage cheese\b/, 265, 18, 100, 'paneer'],
  [/\btofu\b/, 120, 13, 100, 'tofu'],
  [/\bwhey\b/, 120, 24, null, 'whey protein (scoop)'],
  [/\bplant protein\b|\bpea protein\b/, 110, 22, null, 'plant protein (scoop)'],
  [/\bprotein bar\b/, 200, 20, null, 'protein bar'],
  [/\bdal\b|\bdaal\b|\blentils?\b/, 150, 9, null, 'dal'],
  [/\bsambar\b/, 70, 4, null, 'sambar'],
  [/\bkadhi\b/, 150, 6, null, 'kadhi'],
  [/\bkhichdi\b|\bkhichri\b/, 200, 7, null, 'khichdi'],
  [/\bbiryani\b|\bpulao\b/, 380, 12, null, 'biryani / pulao (plate)'],
  [/\bsprouts?\b/, 100, 8, null, 'sprouts'],
  [/\bbuttermilk\b|\bchaas\b|\blassi\b/, 60, 3, null, 'buttermilk / lassi'],
  [/\bcurd\b|\bdahi\b|\byogh?urt\b/, 90, 5, null, 'curd'],
  [/\bmilk\b|\bdoodh\b/, 150, 8, null, 'milk'],
  [/\bcheese\b/, 70, 4, null, 'cheese slice'],
  [/\bchai\b|\btea\b|\bcoffee\b/, 50, 2, null, 'tea or coffee with milk'],
  // breads and grains
  [/\brotis?\b|\bchapatis?\b|\bchapattis?\b|\bphulkas?\b/, 100, 3, null, 'roti'],
  [/\bparathas?\b|\bparanthas?\b/, 150, 4, null, 'plain paratha'],
  [/\bnaans?\b|\bnan\b/, 260, 8, null, 'naan'],
  [/\bidlis?\b|\bidlies\b|\bidly\b/, 40, 2, null, 'idli'],
  [/\bdosas?\b/, 130, 3, null, 'dosa'],
  [/\bchillas?\b|\bcheelas?\b/, 105, 6, null, 'chilla'],
  [/\bpoha\b/, 250, 5, null, 'poha (plate)'],
  [/\bupma\b/, 200, 5, null, 'upma (plate)'],
  [/\boats?\b|\boatmeal\b|\bporridge\b/, 150, 5, 40, 'oats'],
  [/\b(breads?|toasts?)\b/, 80, 3, null, 'bread slice'],
  [/\bsandwich(es)?\b/, 250, 9, null, 'sandwich'],
  [/\brice\b|\bchawal\b/, 200, 4, null, 'rice (cup cooked)'],
  [/\bpasta\b|\bnoodles\b/, 220, 8, null, 'pasta / noodles (cup)'],
  // snacks and fats
  [/\bsamosas?\b/, 260, 5, null, 'samosa'],
  [/\bpizzas?\b/, 285, 12, null, 'pizza slice'],
  [/\bburgers?\b/, 300, 15, null, 'burger'],
  [/\bmakhana\b|\bfox nuts?\b/, 110, 4, null, 'makhana (cup)'],
  [/\balmonds?\b|\bbadam\b/, 55, 2, null, 'almonds (8)'],
  [/\bcashews?\b|\bwalnuts?\b|\bpistachios?\b|\bnuts\b/, 170, 5, 30, 'mixed nuts'],
  [/\bdates?\b|\bkhajoor\b/, 20, 0.2, null, 'date'],
  [/\bghee\b|\bbutter\b/, 40, 0, null, 'ghee or butter (tsp)'],
  [/\boil\b/, 120, 0, null, 'oil (tbsp)'],
  [/\bsugar\b|\bhoney\b|\bjaggery\b/, 20, 0, null, 'sugar (tsp)'],
  [/\bjuice\b/, 110, 1, null, 'juice'],
  // fruit and veg
  [/\bbananas?\b|\bkela\b/, 105, 1, null, 'banana'],
  [/\bapples?\b/, 95, 0.5, null, 'apple'],
  [/\b(oranges?|mosambi|papaya|mango|guava|pomegranate|watermelon|grapes|fruits?)\b/, 70, 1, null, 'fruit'],
  [/\bsalad\b|\bcucumber\b|\btomato(es)?\b|\bonion\b|\blemon\b/, 25, 1, null, 'salad'],
  [/\bsoup\b/, 80, 3, null, 'soup'],
  [/\b(sabzi|sabji|vegetables?|veggies?|bhaji|curry|aloo|gobi|bhindi|palak|mix veg)\b/, 90, 3, null, 'sabzi'],
];

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25 };
const num = '(\\d+\\s*/\\s*\\d+|\\d+(?:\\.\\d+)?)';
const toNumber = (s) => {
  const m = String(s).match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? Number(m[1]) / Number(m[2]) : Number(s);
};

/**
 * How much food a line describes: { n, grams }. n is a count of servings (default 1);
 * grams is set when the text says grams ("100 g paneer"), kilograms or ml.
 * "1 or 2 bananas" is the middle (1.5).
 */
export function parseQuantity(text) {
  const t = String(text ?? '').toLowerCase().replace('½', ' 1/2 ').replace('¼', ' 1/4 ');
  // a number, optionally a range ("1 or 2", "2 to 3", "2-3"), optionally followed by a weight unit
  const re = new RegExp(`${num}(?:\\s*(?:to|or|-|–)\\s*${num})?\\s*(kg|kgs|kilograms?|grams?|gms?|g|ml|millilitres?|litres?|l)?\\b`);
  const m = t.match(re);
  let n = null;
  let grams = null;
  if (m) {
    const a = toNumber(m[1]);
    const v = m[2] !== undefined ? (a + toNumber(m[2])) / 2 : a;
    const unit = m[3];
    if (unit && /^(kg|kgs|kilo)/.test(unit)) grams = v * 1000;
    else if (unit && /^(l|litre)/.test(unit)) grams = v * 1000;
    else if (unit) grams = v;
    else n = v;
  } else {
    const w = t.match(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b/);
    if (w) n = WORDS[w[1]];
  }
  if (n === null && grams === null) n = 1;
  let size = 1;
  if (/\b(big|large|heaping|full)\b/.test(t)) size = 1.5;
  else if (/\b(small|little|mini)\b/.test(t)) size = 0.7;
  return { n: n === null ? null : n * size, grams: grams === null ? null : grams * size };
}

/** The matching food for a line (the one named earliest in the text), or null. */
export function matchFood(line) {
  const t = String(line ?? '').toLowerCase();
  let best = null;
  for (const f of FOODS) {
    const m = t.match(f[0]);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, food: f };
  }
  return best ? best.food : null;
}

/** Estimate one line. Returns { line, name, kcal, protein } or null when the food is not in the table. */
export function estimateLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return null;
  const food = matchFood(text);
  if (!food) return null;
  const [, kcal, p, servingGrams, name] = food;
  const q = parseQuantity(text);
  let servings = q.n ?? 1;
  if (q.grams !== null) servings = servingGrams ? q.grams / servingGrams : 1; // grams only mean something for foods sold by weight
  if (q.n === null && q.grams !== null && !servingGrams) servings = 1;
  servings = Math.min(servings, 20); // a typo like "2000 rotis" should not make a 200,000 kcal meal
  return { line: text, name, servings: Math.round(servings * 100) / 100, kcal: Math.round(kcal * servings), protein: Math.round(p * servings * 10) / 10 };
}

/**
 * Estimate a whole meal from its food lines.
 * Returns { calories, protein, found: [...], missing: [lines we could not recognise] }.
 */
export function estimateMeal(lines) {
  const found = [];
  const missing = [];
  for (const line of lines || []) {
    const text = String(line ?? '').trim();
    if (!text) continue;
    const e = estimateLine(text);
    if (e) found.push(e);
    else missing.push(text);
  }
  return {
    calories: Math.round(found.reduce((t, f) => t + f.kcal, 0)),
    protein: Math.round(found.reduce((t, f) => t + f.protein, 0)),
    found,
    missing,
  };
}
