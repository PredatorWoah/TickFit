// Tests for the AI helpers' prompt and reply handling (no network). Run: node tests/aiassist.mjs
import { suggestPrompt, parseSuggestions, activeAI } from '../js/aiassist.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const p = suggestPrompt('workout', { dayLabel: 'Monday Chest + Triceps', focus: ['Chest'], have: ['Bench Press', 'Dips'], profile: { goal: 'muscle', experience: 'beginner', equip: 'gym', avoid: ['knee'], diet: 'veg', weightKg: 80 } });
ok(/Monday Chest \+ Triceps/.test(p) && /focused on Chest/.test(p) && /Bench Press; Dips/.test(p), 'prompt names the day, focus and what is already chosen');
ok(/Goal: muscle/.test(p) && /Equipment: gym/.test(p) && /knee/.test(p) && !/veg/.test(p), 'workout prompt carries goal, equipment and injuries, not diet');
ok(!/80/.test(p), 'body weight is not sent');
ok(/Diet: veg/.test(suggestPrompt('meals', { profile: { diet: 'veg', equip: 'gym' } })) && !/Equipment/.test(suggestPrompt('meals', { profile: { diet: 'veg', equip: 'gym' } })), 'meal prompt carries diet, not equipment');

const ex = parseSuggestions('workout', '```json\n[{"exercise":"Cable Fly","category":"Chest","sets":"3","reps":"12 to 15","rest":"60s","notes":"squeeze"},{"name":"Close Grip Bench","category":"Triceps"},{"category":"junk"},"nope",{"exercise":"Way too many sets","sets":99}]\n```');
ok(ex.length === 3 && ex[0].exercise === 'Cable Fly' && ex[0].sets === 3 && ex[0].reps === '12 to 15' && ex[0].notes === 'squeeze', 'exercises parsed from a fenced reply: ' + ex.map((e) => e.exercise));
ok(ex[1].exercise === 'Close Grip Bench' && ex[1].reps === '10' && ex[1].sets === 3, 'missing fields get safe defaults');
ok(ex[2].sets === 10, 'silly numbers are capped');
const meals = parseSuggestions('meals', '{"suggestions":[{"name":"Moong chilla","category":"Breakfast","items":["3 moong chillas","mint chutney"],"calories":"320","protein":18},{"name":"Fruit","items":"1 apple","calories":99999}]}');
ok(meals.length === 2 && meals[0].items.length === 2 && meals[0].calories === 320 && meals[0].protein === 18, 'meals parsed, numbers as text accepted');
ok(meals[1].items[0] === '1 apple' && meals[1].calories === undefined, 'a single food string works; an absurd calorie number is dropped');
ok(parseSuggestions('workout', 'Sorry, I cannot help').length === 0, 'a non-JSON reply gives nothing');
ok(parseSuggestions('workout', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ exercise: 'E' + i })))).length === 8, 'at most 8 suggestions');
ok(activeAI() === null, 'no key, no AI');

console.log(fail ? `\n${fail} failed` : '\nAll AI helper tests passed');
process.exit(fail ? 1 : 0);
