// cases.js
// Test cases for the plan parser. Add one whenever you find an input that breaks it.
// Each case: { name, input, ok, errors?: [substrings], warnings?: [substrings], check?: fn(plan) }
// Run them with `node tests/run.mjs` or open tests/parser.test.html in a browser.

const goodPlan = {
  name: 'Beginner Muscle Plan',
  days: [
    {
      label: 'Day 1 Push',
      workout: [{ exercise: 'Bench Press', sets: 3, reps: '8 to 10', rest: '90s', notes: '' }],
      meals: [{ time: '8:00 AM', name: 'Breakfast', items: ['Paneer bhurji', '2 rotis'], calories: 450, protein: 25 }],
      extras: { waterLiters: 3, supplements: ['Creatine 5g'], notes: '' },
    },
    {
      label: 'Day 2 Rest',
      workout: [],
      meals: [{ time: '8:00 AM', name: 'Breakfast', items: ['Poha'] }],
    },
  ],
};
const good = JSON.stringify(goodPlan, null, 2);

export const cases = [
  // ----- should work -----
  { name: 'clean valid plan', input: good, ok: true, check: (p) => p.days.length === 2 && p.days[1].workout.length === 0 },
  { name: 'rest day keeps empty workout', input: good, ok: true, check: (p) => p.days[1].extras.waterLiters === null },
  { name: 'wrapped in ```json fence with chatter', input: 'Sure! Here is your plan:\n```json\n' + good + '\n```\nHope it helps!', ok: true },
  { name: 'chatter without fence', input: 'Here you go:\n' + good + '\nLet me know!', ok: true },
  { name: 'trailing commas', input: '{"name":"X","days":[{"label":"D","workout":[{"exercise":"Squat",},],"meals":[{"name":"B","items":["Egg",],},],},],}', ok: true },
  { name: 'curly quotes around keys and values', input: good.replace(/"/g, (m, i) => (i % 2 ? '”' : '“')), ok: true },
  { name: 'single quotes', input: good.replace(/"/g, "'"), ok: true },
  { name: 'unquoted keys', input: '{name: "X", days: [{label: "D", workout: [], meals: [{name: "B", items: ["Egg"]}]}]}', ok: true },
  { name: 'line comments', input: '{\n// my plan\n"name": "X", "days": [{"label": "D", "workout": [], "meals": [{"name": "B", "items": ["Egg"]}]}]}', ok: true },
  { name: 'numbers as strings', input: '{"name":"X","days":[{"label":"D","workout":[{"exercise":"Squat","sets":"3","reps":10,"rest":90}],"meals":[{"name":"B","items":["Egg"],"calories":"450 kcal","protein":"25g"}]}]}', ok: true,
    check: (p) => p.days[0].workout[0].sets === 3 && p.days[0].workout[0].reps === '10' && p.days[0].workout[0].rest === '90s' && p.days[0].meals[0].calories === 450 && p.days[0].meals[0].protein === 25 },
  { name: 'top level array of days', input: JSON.stringify(goodPlan.days), ok: true, warnings: ['no name'] },
  { name: 'missing label gets a default', input: '{"name":"X","days":[{"workout":[],"meals":[{"name":"B","items":["Egg"]}]}]}', ok: true, warnings: ['Day 1 had no "label"'], check: (p) => p.days[0].label === 'Day 1' },
  { name: 'items as a single string', input: '{"name":"X","days":[{"label":"D","workout":[],"meals":[{"name":"B","items":"Egg"}]}]}', ok: true, check: (p) => p.days[0].meals[0].items[0] === 'Egg' },
  { name: 'bad calories become a warning', input: '{"name":"X","days":[{"label":"D","workout":[],"meals":[{"name":"B","items":["Egg"],"calories":"lots"}]}]}', ok: true, warnings: ['calories'] },
  { name: 'duplicate ids are fixed', input: '{"name":"X","days":[{"label":"D","workout":[{"id":"a","exercise":"A"},{"id":"a","exercise":"B"}],"meals":[]}]}', ok: true, check: (p) => p.days[0].workout[0].id !== p.days[0].workout[1].id },
  { name: 'emoji and hindi text survive', input: '{"name":"योजना 💪","days":[{"label":"दिन 1","workout":[],"meals":[{"name":"नाश्ता","items":["पोहा"]}]}]}', ok: true, check: (p) => p.name === 'योजना 💪' },

  { name: 'weight and video are kept', input: '{"name":"X","days":[{"label":"D","workout":[{"exercise":"Squat","weight":"40 kg","video":"https://youtu.be/abc"}],"meals":[]}]}', ok: true, check: (p) => p.days[0].workout[0].weight === '40 kg' && p.days[0].workout[0].video === 'https://youtu.be/abc' },
  { name: 'numeric weight becomes text', input: '{"name":"X","days":[{"label":"D","workout":[{"exercise":"Squat","weight":40}],"meals":[]}]}', ok: true, check: (p) => p.days[0].workout[0].weight === '40' },
  { name: 'non web video link is dropped with a warning', input: '{"name":"X","days":[{"label":"D","workout":[{"exercise":"Squat","video":"javascript:alert(1)"}],"meals":[]}]}', ok: true, warnings: ['video'], check: (p) => p.days[0].workout[0].video === '' },
  { name: 'video text that is not a link is dropped', input: '{"name":"X","days":[{"label":"D","workout":[{"exercise":"Squat","video":"watch on youtube"}],"meals":[]}]}', ok: true, warnings: ['video'] },

  // ----- should fail with a friendly message -----
  { name: 'day missing meals', input: '{"name":"X","days":[{"label":"D1","workout":[],"meals":[{"name":"B","items":["Egg"]}]},{"label":"D2","workout":[]},{"label":"D3","workout":[]}]}', ok: false, errors: ['Day 2 is missing meals', 'Day 3 is missing meals'] },
  { name: 'day missing workout', input: '{"name":"X","days":[{"label":"D1","meals":[]}]}', ok: false, errors: ['Day 1 is missing "workout"', 'rest day'] },
  { name: 'workout is not a list', input: '{"name":"X","days":[{"label":"D1","workout":"squats","meals":[]}]}', ok: false, errors: ['"workout" must be a list'] },
  { name: 'exercise without a name', input: '{"name":"X","days":[{"label":"D1","workout":[{"sets":3}],"meals":[]}]}', ok: false, errors: ['Day 1, exercise 1 has no "exercise" name'] },
  { name: 'meal without foods', input: '{"name":"X","days":[{"label":"D1","workout":[],"meals":[{"name":"Lunch","items":[]}]}]}', ok: false, errors: ['Day 1, meal 1 (Lunch) has no foods'] },
  { name: 'no days key', input: '{"name":"X"}', ok: false, errors: ['needs a "days" list'] },
  { name: 'empty days', input: '{"name":"X","days":[]}', ok: false, errors: ['empty'] },
  { name: 'days is an object', input: '{"name":"X","days":{"a":1}}', ok: false, errors: ['needs a "days" list'] },
  { name: 'day is a string', input: '{"name":"X","days":["Monday"]}', ok: false, errors: ['Day 1 is not an object'] },
  { name: 'plain english, no json', input: 'Monday: bench press 3x10. Eat dal.', ok: false, errors: ['could not find any JSON'] },
  { name: 'empty input', input: '', ok: false, errors: ['could not find any JSON'] },
  { name: 'only whitespace', input: '   \n  ', ok: false, errors: ['could not find any JSON'] },
  { name: 'null input', input: null, ok: false, errors: ['could not find any JSON'] },
  { name: 'truncated reply', input: good.slice(0, good.length - 40), ok: false, errors: ['cut off'] },
  { name: 'missing comma gives line number', input: '{\n"name": "X"\n"days": []\n}', ok: false, errors: ['not valid JSON', 'line'] },
  { name: 'json number only', input: '[1,2,3]', ok: false, errors: ['Day 1 is not an object'] },
  { name: 'many errors are all reported', input: '{"days":[{"label":"a"},{"label":"b"},{"label":"c"}]}', ok: false, errors: ['Day 1 is missing "workout"', 'Day 2 is missing meals', 'Day 3 is missing meals'] },
  { name: 'too many days', input: JSON.stringify({ name: 'X', days: Array(400).fill({ label: 'D', workout: [], meals: [] }) }), ok: false, errors: ['maximum'] },
];

/** Runs every case against a parse function. Returns [{name, pass, why}]. */
export function runCases(parsePlanText) {
  return cases.map((c) => {
    const r = parsePlanText(c.input);
    const why = [];
    if (r.ok !== c.ok) why.push(`expected ok=${c.ok} but got ok=${r.ok} (${(r.errors || []).join(' | ')})`);
    for (const s of c.errors || []) {
      if (!(r.errors || []).some((e) => e.includes(s))) why.push(`missing error containing "${s}" in: ${(r.errors || []).join(' | ')}`);
    }
    for (const s of c.warnings || []) {
      if (!(r.warnings || []).some((e) => e.includes(s))) why.push(`missing warning containing "${s}"`);
    }
    if (c.check && r.plan && !c.check(r.plan)) why.push('check() failed');
    return { name: c.name, pass: why.length === 0, why: why.join('; ') };
  });
}
