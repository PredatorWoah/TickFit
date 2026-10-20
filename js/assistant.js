// assistant.js
// The AI assistant's logic, with no screen code (assistantui.js draws it). Optional and off by default.
//
//   assistantPrompt()   what the AI is told: your plan for the coming week, and (only if you allow it in More)
//                       your recent history, weights and steps, plus the conversation so far
//   parseReply()        the AI's answer as { reply, actions }; every action is checked and cleaned, odd ones dropped
//   describeAction()    a plain sentence for an action, shown with Apply and Skip
//   applyAction()       make the change. Only ever called when the person taps Apply.
//
// The AI can only suggest; it never changes anything by itself. Changes to one day go through the same picks
// as "Choose exercises" (the plan stays as it is); edits to an exercise or meal change the plan everywhere it
// appears, and the sentence says so.

import { getState, setBodyWeight, updateRecord } from './store.js';
import { dayFor } from './schedule.js';
import { pickItems } from './library.js';
import { addDays, todayStr } from './dates.js';
import { pctFor, mealNumbers, currentStreak } from './stats.js';
import { manualOf, validManual, MANUAL_MINUTES, MANUAL_KCAL } from './burn.js';
import { parseJsonLoose } from './parser.js';

export const MAX_ACTIONS = 12;
const DAYS_AHEAD = 7;
const DAYS_BACK = 14;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const str = (v, max = 80) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '').slice(0, max);
const num = (v, lo, hi) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null;
};
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Can the AI see history (ticks, weights, steps)? A separate tick in More, on by default once AI is on. */
export const historyAllowed = (settings = getState().settings || {}) => settings.aiHistory !== false;

const exLine = (w) => `${w.exercise}${w.sets || w.reps ? ` ${w.sets || '?'}x${w.reps || '?'}` : ''}${w.weight ? ` @${w.weight}` : ''}${w.rest ? ` rest ${w.rest}` : ''}`;
const mealLine = (m) => {
  const n = mealNumbers(m);
  return `${m.time ? m.time + ' ' : ''}${m.name}: ${(m.items || []).join(', ')}${typeof n.calories === 'number' ? ` (${n.estimated ? '~' : ''}${n.calories} kcal, ${n.protein ?? '?'} g protein)` : ''}`;
};

/** What the AI gets to know. Pure: everything comes in through the arguments. */
export function assistantContext(state, plan, date, { history = true, today = todayStr() } = {}) {
  const out = [];
  const p = (state.settings || {}).profile;
  out.push(`Today is ${today}. The person is looking at ${date}.`);
  if (p) out.push(`About them: ${[p.goal && `goal ${p.goal}`, p.experience && `experience ${p.experience}`, p.age && `age ${p.age}`, p.sex && `sex ${p.sex}`, p.heightCm && `height ${p.heightCm} cm`, p.weightKg && `weight ${p.weightKg} kg`, p.diet && `diet ${p.diet}`, p.equip && `equipment ${p.equip}`, p.avoid && [].concat(p.avoid).length && `avoid ${[].concat(p.avoid).join(', ')}`].filter(Boolean).join(', ')}.`);
  out.push(`Plan "${plan.name}". The next ${DAYS_AHEAD} days:`);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = addDays(date, i);
    const day = dayFor(plan, d);
    out.push(`- ${d} "${day.label}"`);
    out.push(`  workout: ${day.workout.length ? day.workout.map(exLine).join('; ') : 'rest'}`);
    if (day.meals.length) out.push(`  meals: ${day.meals.map(mealLine).join('; ')}`);
    if (day.extras.waterLiters) out.push(`  water target ${day.extras.waterLiters} L`);
    if (day.extras.supplements.length) out.push(`  supplements: ${day.extras.supplements.join(', ')}`);
  }
  if (history) {
    const records = (state.progress || {})[plan.id] || {};
    out.push(`History of the last ${DAYS_BACK} days (date: % of the day ticked, sets logged, typed-in workout time/kcal):`);
    for (let i = DAYS_BACK; i >= 1; i--) {
      const d = addDays(today, -i);
      const rec = records[d];
      const pct = pctFor(plan, records, d);
      if (!rec && pct === null) continue;
      const day = dayFor(plan, d);
      const sets = rec && rec.sets ? Object.entries(rec.sets).flatMap(([id, list]) => {
        const w = day.workout.find((x) => x.id === id);
        const done = (list || []).filter((x) => x && x.done);
        return done.length && w ? [`${w.exercise} ${done.map((x) => (x.w ? `${x.w}x${x.r}` : `${x.r}`)).join(',')}`] : [];
      }) : [];
      const m = manualOf(rec);
      out.push(`- ${d}: ${pct === null ? 'rest' : pct + '%'}${sets.length ? `; ${sets.join('; ')}` : ''}${m.minutes ? `; ${m.minutes} min` : ''}${m.kcal ? `; ${m.kcal} kcal` : ''}${rec && rec.notes ? `; note: ${String(rec.notes).slice(0, 120)}` : ''}`);
    }
    out.push(`Current streak: ${currentStreak(plan, records, today)} days.`);
    const weights = Object.entries(state.bodyLog || {}).filter(([d]) => d >= addDays(today, -30)).sort();
    if (weights.length) out.push(`Body weight (kg): ${weights.map(([d, kg]) => `${d} ${kg}`).join(', ')}.`);
    const steps = Object.entries(state.stepLog || {}).filter(([d]) => d >= addDays(today, -7)).sort();
    if (steps.length) out.push(`Steps: ${steps.map(([d, n]) => `${d} ${n}`).join(', ')}.`);
    const meas = Object.entries(state.measureLog || {}).sort().slice(-3);
    if (meas.length) out.push(`Body measurements (cm): ${meas.map(([d, v]) => `${d} ${Object.entries(v).map(([k, x]) => `${k} ${x}`).join(' ')}`).join('; ')}.`);
  } else out.push('(They chose not to share their history, weights or steps.)');
  return out.join('\n');
}

export const ACTION_HELP = `Actions you can propose (all optional, only when the person asks for a change):
{"type":"add_exercise","date":"YYYY-MM-DD","exercise":{"exercise":"Lat Pulldown","sets":3,"reps":"8 to 12","weight":"40 kg","rest":"90s","notes":"short tip"}}
{"type":"replace_exercise","date":"YYYY-MM-DD","name":"exact current exercise name","with":{same fields as exercise}}
{"type":"remove_exercise","date":"YYYY-MM-DD","name":"exact current exercise name"}
{"type":"edit_exercise","name":"exact name","changes":{"sets":4,"reps":"6 to 8","weight":"60 kg","rest":"2 min","notes":"..."}}  (changes the plan everywhere)
{"type":"add_meal","date":"YYYY-MM-DD","meal":{"name":"Paneer wrap","time":"1:00 PM","items":["100 g paneer","2 rotis"],"calories":520,"protein":28}}
{"type":"replace_meal","date":"YYYY-MM-DD","name":"exact current meal name","with":{same fields as meal}}
{"type":"remove_meal","date":"YYYY-MM-DD","name":"exact current meal name"}
{"type":"edit_meal","name":"exact name","changes":{"items":[...],"calories":450,"protein":30,"time":"8:00 AM"}}  (changes the plan everywhere)
{"type":"set_workout_numbers","date":"YYYY-MM-DD","minutes":55,"kcal":320}  (the time and calories of that day's workout)
{"type":"set_water","liters":3}  (the daily water target, every day)
{"type":"log_weight","date":"YYYY-MM-DD","kg":72.4}
{"type":"add_note","date":"YYYY-MM-DD","text":"..."}`;

/** The whole prompt. Pure. `chat` is [{ role: 'you' | 'ai', text }], oldest first. */
export function assistantPrompt(context, chat, message) {
  const turns = chat.slice(-8).map((t) => `${t.role === 'you' ? 'Person' : 'Assistant'}: ${t.text}`).join('\n');
  return [
    'You are the friendly personal training and nutrition assistant inside TickFit, a gym and meal checklist app.',
    'Help with whatever they ask: summarise progress, review goals, explain, motivate, and change their exercises, meals, calories, protein, water and workout time.',
    'You cannot change anything yourself. To make a change, propose actions; the app shows each one and the person taps Apply or Skip.',
    'Only propose actions the person asked for or clearly agreed to. Use names exactly as they appear in the plan. Dates must be YYYY-MM-DD.',
    'Be safe and realistic, no medical advice; suggest a doctor for pain or health conditions. Keep replies short and plain, no markdown tables.',
    '',
    ACTION_HELP,
    '',
    'Answer with ONLY one JSON object, no other text: {"reply": "what you say to the person", "actions": [ ...zero or more actions... ]}',
    '',
    'What you know:',
    context,
    '',
    turns && `Conversation so far:\n${turns}`,
    `Person: ${message}`,
  ]
    .filter((x) => x !== false && x !== '' && x != null)
    .join('\n');
}

function cleanExercise(x) {
  if (!x || typeof x !== 'object') return null;
  const e = { exercise: str(x.exercise || x.name), sets: num(x.sets, 1, 12) || 3, reps: str(x.reps, 30) || '10', weight: str(x.weight, 30), rest: str(x.rest, 20), notes: str(x.notes, 200), video: '' };
  return e.exercise ? e : null;
}
function cleanMeal(x) {
  if (!x || typeof x !== 'object') return null;
  const items = (Array.isArray(x.items) ? x.items : x.items ? [x.items] : []).map((i) => str(i, 120)).filter(Boolean).slice(0, 12);
  const m = { name: str(x.name), time: str(x.time, 20), items: items.length ? items : [str(x.name)] };
  const k = num(x.calories, 0, 5000);
  const p = num(x.protein, 0, 400);
  if (k !== null) m.calories = Math.round(k);
  if (p !== null) m.protein = p;
  return m.name ? m : null;
}
function cleanChanges(x, kind) {
  if (!x || typeof x !== 'object') return null;
  const c = {};
  if (kind === 'workout') {
    if (x.sets !== undefined && num(x.sets, 1, 12) !== null) c.sets = num(x.sets, 1, 12);
    for (const k of ['reps', 'weight', 'rest', 'notes']) if (typeof x[k] === 'string' || typeof x[k] === 'number') c[k] = str(x[k], k === 'notes' ? 200 : 30);
  } else {
    if (x.items !== undefined) {
      const items = (Array.isArray(x.items) ? x.items : [x.items]).map((i) => str(i, 120)).filter(Boolean).slice(0, 12);
      if (items.length) c.items = items;
    }
    if (num(x.calories, 0, 5000) !== null) c.calories = Math.round(num(x.calories, 0, 5000));
    if (num(x.protein, 0, 400) !== null) c.protein = num(x.protein, 0, 400);
    if (typeof x.time === 'string') c.time = str(x.time, 20);
  }
  return Object.keys(c).length ? c : null;
}

/** One action from the AI, checked and cleaned, or null. `fallbackDate` fills a missing date. Pure. */
export function cleanAction(a, fallbackDate) {
  if (!a || typeof a !== 'object') return null;
  const date = isDate(a.date) ? a.date : fallbackDate;
  const name = str(a.name);
  switch (a.type) {
    case 'add_exercise': { const exercise = cleanExercise(a.exercise); return exercise && { type: a.type, date, exercise }; }
    case 'replace_exercise': { const w = cleanExercise(a.with); return w && name && { type: a.type, date, name, with: w }; }
    case 'remove_exercise': return name ? { type: a.type, date, name } : null;
    case 'edit_exercise': { const changes = cleanChanges(a.changes, 'workout'); return changes && name && { type: a.type, name, changes }; }
    case 'add_meal': { const meal = cleanMeal(a.meal); return meal && { type: a.type, date, meal }; }
    case 'replace_meal': { const w = cleanMeal(a.with); return w && name && { type: a.type, date, name, with: w }; }
    case 'remove_meal': return name ? { type: a.type, date, name } : null;
    case 'edit_meal': { const changes = cleanChanges(a.changes, 'meals'); return changes && name && { type: a.type, name, changes }; }
    case 'set_workout_numbers': {
      const minutes = validManual(a.minutes, ...MANUAL_MINUTES);
      const kcal = validManual(a.kcal, ...MANUAL_KCAL);
      return minutes !== null || kcal !== null ? { type: a.type, date, minutes, kcal } : null;
    }
    case 'set_water': { const liters = num(a.liters, 0.5, 8); return liters !== null ? { type: a.type, liters } : null; }
    case 'log_weight': { const kg = num(a.kg, 20, 400); return kg !== null ? { type: a.type, date, kg } : null; }
    case 'add_note': { const text = str(a.text, 500); return text ? { type: a.type, date, text } : null; }
    default: return null;
  }
}

/** The AI's answer as { reply, actions }. Never trusts the shape; a plain text answer is just a reply. Pure. */
export function parseReply(text, fallbackDate) {
  const { value } = parseJsonLoose(String(text || ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { reply: String(text || '').trim().slice(0, 4000) || 'Sorry, I could not answer that.', actions: [] };
  const reply = str(value.reply || value.message || '', 4000) || (Array.isArray(value.actions) && value.actions.length ? 'Here is what I suggest:' : 'Done thinking. Anything else?');
  const actions = (Array.isArray(value.actions) ? value.actions : []).map((a) => cleanAction(a, fallbackDate)).filter(Boolean).slice(0, MAX_ACTIONS);
  return { reply, actions };
}

const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
const exText = (e) => `${e.exercise} ${e.sets} × ${e.reps}${e.weight ? ` at ${e.weight}` : ''}`;
const mealText = (m) => `${m.name}${m.items.length && m.items[0] !== m.name ? ` (${m.items.join(', ')})` : ''}${m.calories !== undefined ? `, ${m.calories} kcal` : ''}${m.protein !== undefined ? `, ${m.protein} g protein` : ''}`;
const changesText = (c) => Object.entries(c).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : v}`).join(', ');

/** A plain sentence for an action. Pure. */
export function describeAction(a) {
  switch (a.type) {
    case 'add_exercise': return `Add ${exText(a.exercise)} on ${shortDate(a.date)}`;
    case 'replace_exercise': return `On ${shortDate(a.date)}, swap ${a.name} for ${exText(a.with)}`;
    case 'remove_exercise': return `Take ${a.name} off ${shortDate(a.date)}`;
    case 'edit_exercise': return `Change ${a.name} in your plan (every day it appears): ${changesText(a.changes)}`;
    case 'add_meal': return `Add ${mealText(a.meal)} on ${shortDate(a.date)}`;
    case 'replace_meal': return `On ${shortDate(a.date)}, swap ${a.name} for ${mealText(a.with)}`;
    case 'remove_meal': return `Take ${a.name} off ${shortDate(a.date)}`;
    case 'edit_meal': return `Change ${a.name} in your plan (every day it appears): ${changesText(a.changes)}`;
    case 'set_workout_numbers': return `Set ${shortDate(a.date)}'s workout to ${[a.minutes !== null && `${a.minutes} min`, a.kcal !== null && `${a.kcal} kcal`].filter(Boolean).join(' and ')}`;
    case 'set_water': return `Make the daily water target ${a.liters} L`;
    case 'log_weight': return `Log ${a.kg} kg as your weight on ${shortDate(a.date)}`;
    case 'add_note': return `Add a note to ${shortDate(a.date)}: "${a.text}"`;
    default: return 'Unknown change';
  }
}

const nameOf = (kind, x) => (kind === 'workout' ? x.exercise : x.name);

/** Change one date's list (add, swap or remove). Returns false when the name isn't on that day. */
function changeDay(plan, date, kind, fn) {
  const list = dayFor(plan, date)[kind].map((x) => ({ ...x }));
  const next = fn(list);
  if (!next) return false;
  pickItems(plan, date, kind, next);
  return true;
}
const findIn = (kind, list, name) => list.findIndex((x) => norm(nameOf(kind, x)) === norm(name));

/** Everywhere an item with this name sits in the plan: every day and the library. */
function editEverywhere(plan, kind, name, changes) {
  let n = 0;
  const lists = [...plan.days.map((d) => d[kind]), ((plan.library || {})[kind === 'workout' ? 'exercises' : 'meals']) || []];
  for (const list of lists) for (const x of list) if (norm(nameOf(kind, x)) === norm(name)) (Object.assign(x, changes), n++);
  return n > 0;
}

/**
 * Make the change. Changes `plan` and the saved records in place; the caller saves the plans and offers Undo.
 * Returns { ok, message }.
 */
export function applyAction(plan, a) {
  const fail = (message) => ({ ok: false, message });
  switch (a.type) {
    case 'add_exercise':
      return changeDay(plan, a.date, 'workout', (l) => (findIn('workout', l, a.exercise.exercise) >= 0 ? null : [...l, a.exercise])) ? { ok: true } : fail(`${a.exercise.exercise} is already on that day.`);
    case 'replace_exercise':
      return changeDay(plan, a.date, 'workout', (l) => { const i = findIn('workout', l, a.name); if (i < 0) return null; l[i] = a.with; return l; }) ? { ok: true } : fail(`${a.name} is not on that day.`);
    case 'remove_exercise':
      return changeDay(plan, a.date, 'workout', (l) => { const i = findIn('workout', l, a.name); return i < 0 ? null : l.filter((_, k) => k !== i); }) ? { ok: true } : fail(`${a.name} is not on that day.`);
    case 'edit_exercise':
      return editEverywhere(plan, 'workout', a.name, a.changes) ? { ok: true } : fail(`${a.name} is not in your plan.`);
    case 'add_meal':
      return changeDay(plan, a.date, 'meals', (l) => (findIn('meals', l, a.meal.name) >= 0 ? null : [...l, a.meal])) ? { ok: true } : fail(`${a.meal.name} is already on that day.`);
    case 'replace_meal':
      return changeDay(plan, a.date, 'meals', (l) => { const i = findIn('meals', l, a.name); if (i < 0) return null; l[i] = a.with; return l; }) ? { ok: true } : fail(`${a.name} is not on that day.`);
    case 'remove_meal':
      return changeDay(plan, a.date, 'meals', (l) => { const i = findIn('meals', l, a.name); return i < 0 ? null : l.filter((_, k) => k !== i); }) ? { ok: true } : fail(`${a.name} is not on that day.`);
    case 'edit_meal':
      return editEverywhere(plan, 'meals', a.name, a.changes) ? { ok: true } : fail(`${a.name} is not in your plan.`);
    case 'set_workout_numbers':
      updateRecord(plan.id, a.date, (r) => {
        const m = manualOf(r);
        r.manual = { minutes: a.minutes ?? m.minutes, kcal: a.kcal ?? m.kcal };
      });
      return { ok: true };
    case 'set_water':
      for (const d of plan.days) d.extras.waterLiters = a.liters;
      return { ok: true };
    case 'log_weight':
      return setBodyWeight(a.date, a.kg) !== null ? { ok: true } : fail('That weight does not look right.');
    case 'add_note':
      updateRecord(plan.id, a.date, (r) => {
        r.notes = r.notes ? `${r.notes}\n${a.text}` : a.text;
      });
      return { ok: true };
    default:
      return fail('TickFit does not know that change.');
  }
}
