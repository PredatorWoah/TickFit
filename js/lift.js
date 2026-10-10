// lift.js
// Fun comparisons for "total lifted" and a simple muscle-group guess for exercise names.
// Pure functions (no DOM), easy to test.
//
// Every benchmark is a thing you see around India, with a round, typical weight: a 10 kg bag of atta, a
// full LPG cylinder (about 30 kg with the steel), a Royal Enfield Bullet (about 195 kg), a WAP-7 electric
// engine (123 tonnes), the PSLV that launched Mangalyaan (about 320 tonnes), the steel in Howrah Bridge
// (about 26,500 tonnes) and INS Vikrant (about 45,000 tonnes). For fun and motivation, not a physics exam.

// [kg, one, many]. Smallest first. Past the last one it keeps counting INS Vikrants (100 million kg is about 2.2).
export const BENCHMARKS = [
  [10, 'a 10 kg bag of atta', 'bags of atta'],
  [30, 'a full LPG cylinder', 'full LPG cylinders'],
  [50, 'a cement bag', 'cement bags'],
  [65, 'a grown man', 'grown men'],
  [110, 'a Honda Activa', 'Activas'],
  [195, 'a Royal Enfield Bullet', 'Royal Enfield Bullets'],
  [375, 'an auto rickshaw', 'auto rickshaws'],
  [550, 'a Murrah buffalo', 'Murrah buffaloes'],
  [650, 'a Maruti 800', 'Maruti 800s'],
  [1750, 'a Mahindra Thar', 'Mahindra Thars'],
  [4000, 'an Indian elephant', 'Indian elephants'],
  [7500, 'a JCB digger', 'JCB diggers'],
  [25000, 'a fully loaded Tata truck', 'loaded Tata trucks'],
  [123000, 'an Indian Railways WAP-7 engine', 'WAP-7 engines'],
  [320000, 'a PSLV rocket, the kind that sent Mangalyaan to Mars', 'PSLV rockets'],
  [640000, 'an LVM3 rocket, the kind that flew Chandrayaan-3', 'LVM3 rockets'],
  [1000000, 'a full Rajdhani Express train', 'Rajdhani Express trains'],
  [26500000, 'all the steel in Howrah Bridge', 'Howrah Bridges'],
  [45000000, "INS Vikrant, India's aircraft carrier", 'INS Vikrants'],
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
  // A short version for small spaces like a home screen widget: "About a Royal Enfield Bullet".
  const plain = (s) => s.split(',')[0];
  const short = times < 1.15 ? `About ${plain(one)}` : `About ${nice(times)} ${many}`;
  const up = BENCHMARKS[i + 1];
  const next = up ? { name: plain(up[1]), kg: up[0], toGo: Math.round(up[0] - kg), pct: Math.round(((kg - w) / (up[0] - w)) * 100) } : null;
  return { text, short, next };
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
