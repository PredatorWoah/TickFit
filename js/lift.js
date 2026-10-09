// lift.js
// Fun comparisons for "total lifted" and a simple muscle-group guess for exercise names.
// Pure functions (no DOM), easy to test.
//
// The weights are round, typical figures (a bag of rice in an Indian shop is 10 kg, a city bus is
// about 12 tonnes). They are for fun and motivation, not a physics exam.

// [kg, one, many]. Smallest first. The last one is the top of the scale (100 million kg).
export const BENCHMARKS = [
  [10, 'a 10 kg bag of rice', 'bags of rice'],
  [50, 'a cement bag', 'cement bags'],
  [70, 'a grown adult', 'grown adults'],
  [110, 'a scooter', 'scooters'],
  [200, 'a motorbike', 'motorbikes'],
  [400, 'a grand piano', 'grand pianos'],
  [600, 'a dairy cow', 'dairy cows'],
  [1000, 'a small car', 'small cars'],
  [2500, 'a big SUV', 'big SUVs'],
  [6000, 'an African elephant', 'African elephants'],
  [12000, 'a city bus', 'city buses'],
  [30000, 'a humpback whale', 'humpback whales'],
  [41000, 'an empty Boeing 737', 'Boeing 737s'],
  [150000, 'a blue whale', 'blue whales'],
  [204000, 'the Statue of Liberty', 'Statues of Liberty'],
  [420000, 'the International Space Station', 'space stations'],
  [2900000, 'a Saturn V moon rocket', 'Saturn V rockets'],
  [7300000, 'the Eiffel Tower', 'Eiffel Towers'],
  [52000000, 'the Titanic', 'Titanics'],
  [100000000, 'an aircraft carrier', 'aircraft carriers'],
];

const nice = (n) => (n >= 10 ? Math.round(n).toLocaleString('en') : String(Math.round(n * 10) / 10));

/**
 * A fun line for a total weight, plus the next milestone.
 * Returns null under 10 kg. Otherwise { text, next } where next is null at the top of the scale or
 * { name, kg, toGo, pct } for the progress bar.
 */
export function liftFact(kg) {
  if (!(kg >= BENCHMARKS[0][0])) return null;
  let i = 0;
  while (i + 1 < BENCHMARKS.length && BENCHMARKS[i + 1][0] <= kg) i++;
  const [w, one, many] = BENCHMARKS[i];
  const times = kg / w;
  let text = times < 1.15 ? `That's about the weight of ${one}` : `That's about ${nice(times)} ${many}`;
  // A small multiple reads better with a second, countable comparison: "1.4 grown adults, or 10 bags of rice".
  if (i > 0 && times < 2) {
    const [w2, , many2] = kg <= 1000 ? BENCHMARKS[0] : BENCHMARKS[i - 1];
    text += `, or ${nice(kg / w2)} ${many2}`;
  }
  text += '.';
  const up = BENCHMARKS[i + 1];
  const next = up ? { name: up[1], kg: up[0], toGo: Math.round(up[0] - kg), pct: Math.round(((kg - w) / (up[0] - w)) * 100) } : null;
  return { text, next };
}

// Muscle groups, first match wins, so specific ones sit above general ones.
const GROUPS = [
  [/\b(rowing machine|row machine|rower|ergometer)\b/, 'Cardio'],
  [/\b(tricep|triceps|pushdown|skull ?crusher|close.?grip bench|dips?|kickback|overhead (dumbbell |cable )?extension)\b/, 'Triceps'],
  [/\b(bicep|biceps|curl|curls)\b/, 'Biceps'],
  [/\b(lateral raise|front raise|rear delt|face pull|shoulder|overhead press|military press|arnold|upright row|shrug)/, 'Shoulders'],
  [/\b(calf|calves)\b/, 'Legs'],
  [/\b(squat|lunge|leg press|leg curl|leg extension|hamstring|quad|glute|hip thrust|romanian|rdl|step.?up|deadlift)/, 'Legs'],
  [/\b(row|rows|pulldown|pull.?ups?|chin.?ups?|lat |lats|back extension|pullover)/, 'Back'],
  [/\b(bench|chest|fly|flye|flyes|pec|push.?ups?|press.?up|incline press|decline press|dumbbell press)/, 'Chest'],
  [/\b(plank|crunch|sit.?up|leg raise|ab |abs|ab wheel|core|hollow|russian twist|mountain climber|oblique)/, 'Core'],
  [/\b(walk|run|jog|treadmill|cycle|cycling|bike|swim|row(ing)? machine|rower|elliptical|stair|skipping|jump rope|cardio|hiit|sprint)/, 'Cardio'],
];

/** "Back", "Chest", ... for an exercise name, or "Other". */
export function muscleGroup(name) {
  const n = ' ' + String(name || '').toLowerCase() + ' ';
  for (const [re, g] of GROUPS) if (re.test(n)) return g;
  return 'Other';
}

/** Estimated one-rep max (Epley): what you could lift once, from a set of r reps at w kg. */
export function oneRepMax(w, r) {
  if (!(w > 0)) return null;
  if (!(r > 1)) return Math.round(w * 10) / 10;
  return Math.round(w * (1 + Math.min(r, 20) / 30) * 10) / 10;
}
