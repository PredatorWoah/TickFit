// exercises.js
// The exercise library used by the plan builder.
//
// Each exercise: { name, groups: [movement groups it can fill], equip, hard, flags, kind }
//   equip: 'gym' (machines, barbells, cables), 'dumbbell', or 'bodyweight'
//   hard:  1 easy, 2 medium, 3 demanding (beginners get easier picks first)
//   flags: body parts it can aggravate: 'knee', 'back', 'shoulder'. Someone who says "bad knees"
//          never gets an exercise flagged 'knee'.
//   kind:  'compound' | 'isolation' | 'core' | 'calf'  (decides sets, reps and rest)
//
// Groups are the slots a session template asks for: squat, hinge, lunge, hpush (horizontal push),
// vpush (overhead push), chest (chest isolation), hpull (rows), vpull (pulldowns, pull-ups),
// shoulder (side and rear delts), triceps, biceps, hamstring, quad, glute, calf, core.

const x = (name, groups, equip, hard, flags, kind) => ({ name, groups, equip, hard, flags, kind });

export const EXERCISES = [
  // legs
  x('Barbell Back Squat', ['squat'], 'gym', 3, ['knee', 'back'], 'compound'),
  x('Leg Press', ['squat'], 'gym', 1, [], 'compound'),
  x('Goblet Squat', ['squat'], 'dumbbell', 1, [], 'compound'),
  x('Bodyweight Squat', ['squat'], 'bodyweight', 1, [], 'compound'),
  x('Bulgarian Split Squat', ['squat', 'lunge'], 'dumbbell', 3, ['knee'], 'compound'),
  x('Romanian Deadlift', ['hinge'], 'gym', 3, ['back'], 'compound'),
  x('Dumbbell Romanian Deadlift', ['hinge'], 'dumbbell', 2, ['back'], 'compound'),
  x('Hip Thrust', ['hinge', 'glute'], 'gym', 2, [], 'compound'),
  x('Dumbbell Glute Bridge', ['hinge', 'glute'], 'dumbbell', 1, [], 'compound'),
  x('Glute Bridge', ['hinge', 'glute'], 'bodyweight', 1, [], 'compound'),
  x('Walking Lunges', ['lunge'], 'dumbbell', 2, ['knee'], 'compound'),
  x('Reverse Lunge', ['lunge'], 'dumbbell', 2, [], 'compound'),
  x('Step-ups', ['lunge'], 'dumbbell', 2, [], 'compound'),
  x('Bodyweight Reverse Lunge', ['lunge'], 'bodyweight', 1, [], 'compound'),
  x('Leg Curl Machine', ['hamstring'], 'gym', 1, [], 'isolation'),
  x('Single Leg Glute Bridge', ['hamstring', 'glute'], 'bodyweight', 2, [], 'isolation'),
  x('Leg Extension', ['quad'], 'gym', 1, ['knee'], 'isolation'),
  x('Wall Sit', ['quad'], 'bodyweight', 2, ['knee'], 'isolation'),
  x('Standing Calf Raise', ['calf'], 'gym', 1, [], 'calf'),
  x('Dumbbell Calf Raise', ['calf'], 'dumbbell', 1, [], 'calf'),
  x('Bodyweight Calf Raise', ['calf'], 'bodyweight', 1, [], 'calf'),

  // push
  x('Barbell Bench Press', ['hpush'], 'gym', 3, ['shoulder'], 'compound'),
  x('Machine Chest Press', ['hpush'], 'gym', 1, [], 'compound'),
  x('Dumbbell Bench Press', ['hpush'], 'gym', 2, [], 'compound'),
  x('Dumbbell Floor Press', ['hpush'], 'dumbbell', 1, [], 'compound'),
  x('Push-ups', ['hpush'], 'bodyweight', 2, [], 'compound'),
  x('Incline Push-ups', ['hpush'], 'bodyweight', 1, [], 'compound'),
  x('Incline Dumbbell Press', ['chest', 'hpush'], 'gym', 2, ['shoulder'], 'compound'),
  x('Cable Fly', ['chest'], 'gym', 1, [], 'isolation'),
  x('Dumbbell Fly', ['chest'], 'dumbbell', 2, ['shoulder'], 'isolation'),
  x('Decline Push-ups', ['chest'], 'bodyweight', 2, ['shoulder'], 'compound'),
  x('Barbell Overhead Press', ['vpush'], 'gym', 3, ['shoulder', 'back'], 'compound'),
  x('Machine Shoulder Press', ['vpush'], 'gym', 1, [], 'compound'),
  x('Dumbbell Shoulder Press', ['vpush'], 'dumbbell', 2, ['shoulder'], 'compound'),
  x('Pike Push-ups', ['vpush'], 'bodyweight', 2, ['shoulder'], 'compound'),
  x('Lateral Raises', ['shoulder'], 'dumbbell', 1, [], 'isolation'),
  x('Rear Delt Fly', ['shoulder'], 'dumbbell', 1, [], 'isolation'),
  x('Triceps Pushdown', ['triceps'], 'gym', 1, [], 'isolation'),
  x('Overhead Dumbbell Triceps Extension', ['triceps'], 'dumbbell', 2, ['shoulder'], 'isolation'),
  x('Close-grip Push-ups', ['triceps'], 'bodyweight', 2, [], 'isolation'),
  x('Bench Dips', ['triceps'], 'bodyweight', 2, ['shoulder'], 'isolation'),

  // pull
  x('Lat Pulldown', ['vpull'], 'gym', 1, [], 'compound'),
  x('Pull-ups', ['vpull'], 'gym', 3, ['shoulder'], 'compound'),
  x('Seated Cable Row', ['hpull'], 'gym', 1, [], 'compound'),
  x('Chest-supported Row', ['hpull'], 'gym', 1, [], 'compound'),
  x('Barbell Row', ['hpull'], 'gym', 3, ['back'], 'compound'),
  x('One Arm Dumbbell Row', ['hpull', 'vpull'], 'dumbbell', 1, [], 'compound'),
  x('Inverted Row (under a sturdy table)', ['hpull', 'vpull'], 'bodyweight', 2, [], 'compound'),
  x('Face Pull', ['shoulder'], 'gym', 1, [], 'isolation'),
  x('Dumbbell Curl', ['biceps'], 'dumbbell', 1, [], 'isolation'),
  x('Hammer Curl', ['biceps'], 'dumbbell', 1, [], 'isolation'),
  x('Cable Curl', ['biceps'], 'gym', 1, [], 'isolation'),
  x('Backpack Curl', ['biceps'], 'bodyweight', 1, [], 'isolation'),

  // core
  x('Plank', ['core'], 'bodyweight', 1, [], 'core'),
  x('Dead Bug', ['core'], 'bodyweight', 1, [], 'core'),
  x('Bicycle Crunch', ['core'], 'bodyweight', 1, [], 'core'),
  x('Side Plank', ['core'], 'bodyweight', 2, ['shoulder'], 'core'),
  x('Russian Twist', ['core'], 'bodyweight', 2, ['back'], 'core'),
  x('Cable Crunch', ['core'], 'gym', 2, [], 'core'),
  x('Hanging Knee Raise', ['core'], 'gym', 3, ['shoulder'], 'core'),
];

/** Cardio choices: { name, equip, flags }. Duration comes from the goal. */
export const CARDIO = [
  { name: 'Incline treadmill walk', equip: 'gym', flags: [] },
  { name: 'Cycling', equip: 'gym', flags: [] },
  { name: 'Elliptical', equip: 'gym', flags: [] },
  { name: 'Brisk walk', equip: 'bodyweight', flags: [] },
  { name: 'Easy jog', equip: 'bodyweight', flags: ['knee'] },
  { name: 'Skipping rope', equip: 'bodyweight', flags: ['knee'] },
  { name: 'Shadow boxing', equip: 'bodyweight', flags: ['shoulder'] },
];

// Equipment a person can use. A gym has dumbbells and floor space too.
export const ALLOWED_EQUIP = {
  gym: ['gym', 'dumbbell', 'bodyweight'],
  dumbbell: ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight'],
};
const EQUIP_RANK = { gym: 3, dumbbell: 2, bodyweight: 1 };

/**
 * All exercises that fit a group, ordered best first: the right difficulty for their experience,
 * then the best equipment they have. Returns [] if nothing fits.
 */
export function candidatesFor(group, { equip, avoid, experience }) {
  const allowed = ALLOWED_EQUIP[equip] || ALLOWED_EQUIP.bodyweight;
  const wantHard = { beginner: 1, intermediate: 2, advanced: 3 }[experience] || 1;
  return EXERCISES.filter((e) => e.groups.includes(group) && allowed.includes(e.equip) && !e.flags.some((f) => avoid.includes(f))).sort(
    (a, b) =>
      Math.abs(a.hard - wantHard) - Math.abs(b.hard - wantHard) || // the right difficulty comes first, so beginners get leg press before barbell squats
      EQUIP_RANK[b.equip] - EQUIP_RANK[a.equip] || // then the best equipment available
      a.name.localeCompare(b.name)
  );
}

export function cardioFor({ equip, avoid }) {
  const allowed = ALLOWED_EQUIP[equip] || ALLOWED_EQUIP.bodyweight;
  return CARDIO.filter((c) => allowed.includes(c.equip) && !c.flags.some((f) => avoid.includes(f)));
}
