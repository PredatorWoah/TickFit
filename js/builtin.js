// builtin.js
// TickFit's own exercise list (the plan builder's, from exercises.js), shaped like plan exercises with a
// category, so the Choose exercises sheet and the Library can offer it. Loaded on demand with them.

import { EXERCISES, CARDIO } from './exercises.js';

const GROUP_CATEGORY = { squat: 'Legs', hinge: 'Legs', lunge: 'Legs', hamstring: 'Legs', quad: 'Legs', glute: 'Legs', calf: 'Legs', hpush: 'Chest', chest: 'Chest', vpush: 'Shoulders', shoulder: 'Shoulders', hpull: 'Back', vpull: 'Back', triceps: 'Triceps', biceps: 'Biceps', core: 'Core' };
const DOSE = { compound: [3, '8 to 12', '90s'], isolation: [3, '10 to 15', '60s'], calf: [3, '12 to 15', '45s'], core: [3, '15', '45s'] };

export function builtinExercises() {
  const lifts = EXERCISES.map((e) => {
    const [sets, reps, rest] = DOSE[e.kind] || DOSE.isolation;
    const timed = /plank|wall sit/i.test(e.name);
    return { exercise: e.name, sets, reps: timed ? '30 sec' : reps, rest, weight: '', notes: '', video: '', category: GROUP_CATEGORY[e.groups[0]] || 'Other' };
  });
  const cardio = CARDIO.map((c) => ({ exercise: c.name, sets: 1, reps: '20 min', rest: '', weight: '', notes: '', video: '', category: 'Cardio' }));
  return [...lifts, ...cardio];
}
