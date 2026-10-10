// library.js
// Mix and match: choose which exercises and meals to do on a date, from the plan's library, the
// plan's other days, or (for exercises) TickFit's built-in list. Pure functions, no DOM, easy to test.
//
// A plan can carry a library (see parser.js):  plan.library = { exercises: [...], meals: [...] },
// every item with an id and a "category" like "Back" or "Breakfast".
// What you chose for a date lives in plan.picks:  { "2026-10-09": { workout: [ids], meals: [ids] } }.
// schedule.js dayFor() reads the picks, so every screen, streak and summary follows them.

import { plannedDay } from './schedule.js';
import { slug } from './parser.js';
import { muscleGroup } from './lift.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const nameOf = (kind, item) => (kind === 'workout' ? item.exercise : item.name);
const listKey = (kind) => (kind === 'workout' ? 'exercises' : 'meals');

const libraryOf = (plan) => plan.library || { exercises: [], meals: [] };

/** Category for something that has none: the muscle group for an exercise, the meal's own name for a meal. */
const guessCategory = (kind, item) => (kind === 'workout' ? muscleGroup(item.exercise) : item.name || 'Meals');

/**
 * Everything you could pick for this date, without duplicates (same name counts once):
 * [{ id, item, category, source }] where source is 'day' (on the plan for this day), 'library',
 * 'plan' (another day of the plan) or 'builtin' (TickFit's own exercise list, passed in as `builtin`).
 * Items from 'plan' and 'builtin' get a temporary id and are copied into the library when picked.
 */
export function candidates(plan, date, kind, builtin = []) {
  const out = [];
  const seen = new Set();
  const picked = (plan.picks && plan.picks[date] && plan.picks[date][kind]) || [];
  const add = (item, category, source, id = item.id) => {
    const key = norm(nameOf(kind, item));
    if (!key || (seen.has(key) && !picked.includes(id))) return; // a picked item always stays, even if its name repeats
    seen.add(key);
    out.push({ id, item, category: category || guessCategory(kind, item), source });
  };
  const own = plannedDay(plan, date);
  for (const it of own[kind]) add(it, null, 'day');
  for (const it of libraryOf(plan)[listKey(kind)] || []) add(it, it.category, 'library');
  plan.days.forEach((d, i) => d[kind].forEach((it) => add(it, null, 'plan', `d${i}:${it.id}`)));
  if (kind === 'workout') for (const b of builtin) add(b, b.category, 'builtin', `bx-${slug(b.exercise)}`);
  return out;
}

/** The categories to start the filter on: the day's "focus", else categories named in its label ("Friday Back Biceps"). */
export function focusFor(day, categories) {
  if (day.focus && day.focus.length) return categories.filter((c) => day.focus.some((f) => norm(f) === norm(c)));
  const label = ' ' + norm(day.label).replace(/[^a-z0-9]+/g, ' ') + ' ';
  return categories.filter((c) => {
    const n = norm(c).replace(/[^a-z0-9]+/g, ' ').trim();
    return n && (label.includes(` ${n} `) || label.includes(` ${n.replace(/s$/, '')} `));
  });
}

/** Copy a picked item into the library if it isn't there yet. Returns its library id. */
function ensureInLibrary(plan, kind, cand) {
  if (cand.source === 'day' || cand.source === 'library') return cand.id;
  plan.library ||= { exercises: [], meals: [] };
  const list = (plan.library[listKey(kind)] ||= []);
  const same = list.find((x) => norm(nameOf(kind, x)) === norm(nameOf(kind, cand.item)));
  if (same) return same.id;
  const used = new Set([...plan.library.exercises, ...plan.library.meals].map((x) => x.id));
  const base = `${kind === 'workout' ? 'lx' : 'lm'}-${slug(nameOf(kind, cand.item))}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  list.push({ ...cand.item, id, category: cand.category });
  return id;
}

/**
 * Save what was chosen for a date (in the order given). Choosing exactly the plan's own list for
 * that day removes the pick, so the day simply follows the plan again. Changes `plan` in place.
 */
export function savePick(plan, date, kind, chosen) {
  const ids = chosen.map((c) => ensureInLibrary(plan, kind, c));
  const planned = plannedDay(plan, date)[kind].map((x) => x.id);
  plan.picks ||= {};
  const day = { ...(plan.picks[date] || {}) };
  if (ids.length === planned.length && ids.every((id, i) => id === planned[i])) delete day[kind];
  else day[kind] = ids;
  if (Object.keys(day).length) plan.picks[date] = day;
  else delete plan.picks[date];
  return ids;
}

/**
 * Make a date show exactly `items` (exercises or meals from another plan, in order). Items with the same name
 * as one on this plan's own day reuse that one; the rest are copied into the library. Returns the ids, in the
 * same order as `items`, so ticks and logged sets can be moved over to them (see merge.js).
 */
export function pickItems(plan, date, kind, items) {
  const own = plannedDay(plan, date)[kind];
  const chosen = items.map((it) => {
    const same = own.find((o) => norm(nameOf(kind, o)) === norm(nameOf(kind, it)));
    return same ? { id: same.id, item: same, source: 'day' } : { id: it.id, item: it, category: it.category || guessCategory(kind, it), source: 'plan' };
  });
  return savePick(plan, date, kind, chosen);
}

/** Go back to the plan's own list for this date. */
export function resetPick(plan, date, kind) {
  savePick(plan, date, kind, plannedDay(plan, date)[kind].map((it) => ({ id: it.id, item: it, source: 'day' })));
}

/** Is this date using its own pick for that kind? */
export const isPicked = (plan, date, kind) => !!(plan.picks && plan.picks[date] && Array.isArray(plan.picks[date][kind]));

/** A new item typed in by the person, as a candidate ready to pick. Returns null without a name. */
export function customCandidate(kind, name, category, extra = {}) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n) return null;
  const cat = String(category || '').trim().slice(0, 40);
  const item =
    kind === 'workout'
      ? { exercise: n, sets: extra.sets || 3, reps: extra.reps || '10', weight: '', rest: '90s', notes: '', video: '' }
      : { name: n, time: '', items: extra.items && extra.items.length ? extra.items : [n] };
  return { id: `new-${slug(n)}`, item, category: cat || guessCategory(kind, item), source: 'new' };
}
