// libraryui.js
// More > Library: every exercise and meal you can use, in one place, by category.
//   * Your plan's library, the plan's other days and (for exercises) TickFit's own list.
//   * Search and filter, add any item to today with one tap, add your own, and remove ones you added.
// Loaded on demand (only when someone opens it).

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { savePlans } from './store.js';
import { todayStr } from './dates.js';
import { mealNumbers } from './stats.js';
import { candidates, chosenFor, addToDay, addToLibrary, customCandidate, libraryUses, removeFromLibrary } from './library.js';
import { builtinExercises } from './builtin.js';

const SOURCE = { day: 'in today\'s plan', library: 'your library', plan: 'from your plan', builtin: 'TickFit list' };
// Remembered while the app is open, so going to Today and back keeps your place.
const view = { kind: 'workout', cat: null, query: '' };

/**
 * @param root     element to fill
 * @param plan     the active plan
 * @param actions  { show(screen), refresh() }
 */
export function renderLibrary(root, plan, actions) {
  clear(root);
  const today = todayStr();
  const isWorkout = view.kind === 'workout';
  const nameOf = (c) => (isWorkout ? c.item.exercise : c.item.name);
  const all = candidates(plan, today, view.kind, isWorkout ? builtinExercises() : []);
  const onToday = new Set(chosenFor(plan, today, view.kind, all).map(nameOf).map((n) => n.toLowerCase()));
  const cats = [...new Set(all.map((c) => c.category))].sort((a, b) => a.localeCompare(b));
  if (view.cat && !cats.includes(view.cat)) view.cat = null;
  const redraw = () => {
    const y = window.scrollY;
    renderLibrary(root, plan, actions);
    window.scrollTo(0, y);
  };

  const detail = (c) => {
    if (isWorkout) return [c.item.sets ? `${c.item.sets} × ${c.item.reps || '?'}` : c.item.reps, c.item.rest && `rest ${c.item.rest}`].filter(Boolean).join(' · ');
    const n = mealNumbers(c.item);
    const t = n.estimated ? '~' : '';
    return [c.item.items.join(', '), typeof n.calories === 'number' && `${t}${n.calories} kcal`, typeof n.protein === 'number' && `${t}${n.protein} g protein`].filter(Boolean).join(' · ');
  };

  const shown = all.filter((c) => (!view.cat || c.category === view.cat) && (!view.query || `${nameOf(c)} ${c.category}`.toLowerCase().includes(view.query)));
  const groups = new Map();
  for (const c of shown) groups.set(c.category, [...(groups.get(c.category) || []), c]);

  const row = (c) => {
    const added = onToday.has(nameOf(c).toLowerCase());
    const uses = c.source === 'library' ? libraryUses(plan, c.id) : 0;
    return h(
      'li',
      { class: 'lib-row' },
      h('span', { class: 'lib-text' }, h('b', {}, nameOf(c)), h('small', {}, [detail(c), SOURCE[c.source]].filter(Boolean).join(' · '))),
      c.source === 'library' &&
        h(
          'button',
          {
            class: 'icon-btn small',
            type: 'button',
            'aria-label': `Remove ${nameOf(c)} from your library`,
            onclick: () => {
              if (uses > 0) return toast(`Used on ${uses} day${uses === 1 ? '' : 's'}, so it stays. Take it off those days first.`);
              const before = JSON.stringify(plan.library);
              removeFromLibrary(plan, view.kind, c.id);
              savePlans();
              redraw();
              toast(`Removed "${nameOf(c)}"`, {
                undo: () => {
                  plan.library = JSON.parse(before);
                  savePlans();
                  redraw();
                },
              });
            },
          },
          icon('trash', 18)
        ),
      h(
        'button',
        {
          class: 'btn small' + (added ? '' : ' primary'),
          type: 'button',
          disabled: added,
          'aria-label': added ? `${nameOf(c)} is on today` : `Add ${nameOf(c)} to today`,
          onclick: () => {
            if (addToDay(plan, today, view.kind, c, all)) {
              savePlans();
              toast(`Added to today`);
              redraw();
            }
          },
        },
        icon(added ? 'check' : 'plus', 18),
        added ? 'On today' : 'Today'
      )
    );
  };

  // ----- add your own -----
  const newName = h('input', { class: 'text-input', type: 'text', maxlength: 80, placeholder: isWorkout ? 'Exercise name' : 'Meal name', 'aria-label': isWorkout ? 'New exercise name' : 'New meal name' });
  const newCat = h('input', { class: 'text-input', type: 'text', maxlength: 40, list: 'lib-cats', placeholder: isWorkout ? 'Category, like Back' : 'Category, like Breakfast', 'aria-label': 'Category' });
  const newFoods = isWorkout ? null : h('input', { class: 'text-input', type: 'text', maxlength: 300, placeholder: 'Foods, comma separated (optional)', 'aria-label': 'Foods in the new meal' });
  const addOwn = () => {
    const cand = customCandidate(view.kind, newName.value, newCat.value, { items: newFoods ? newFoods.value.split(',').map((s) => s.trim()).filter(Boolean) : [] });
    if (!cand) return newName.focus();
    if (all.some((c) => nameOf(c).toLowerCase() === nameOf(cand).toLowerCase())) return toast('That one is already in the list');
    addToLibrary(plan, view.kind, cand);
    savePlans();
    toast('Added to your library');
    redraw();
  };

  root.append(
    h('div', { class: 'edit-bar' }, h('button', { class: 'btn ghost back-btn', type: 'button', onclick: () => actions.show('more') }, icon('back', 20), 'More'), h('h1', { class: 'page-title tight' }, 'Library')),
    h('p', { class: 'hint' }, `Everything you can add to a day: your plan's library, its other days${isWorkout ? " and TickFit's own exercises" : ''}. Tap Today to add one to today, or open Choose ${isWorkout ? 'exercises' : 'meals'} on any day.`),
    h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': 'Show' },
      ['workout', 'meals'].map((k) =>
        h('button', { type: 'button', 'aria-pressed': String(view.kind === k), onclick: () => { view.kind = k; view.cat = null; redraw(); } }, k === 'workout' ? 'Exercises' : 'Meals')
      )
    ),
    h('input', {
      class: 'pick-search',
      type: 'search',
      value: view.query,
      placeholder: isWorkout ? 'Search exercises' : 'Search meals',
      'aria-label': isWorkout ? 'Search exercises' : 'Search meals',
      onchange: (e) => {
        view.query = e.target.value.trim().toLowerCase();
        redraw();
      },
    }),
    h(
      'div',
      { class: 'pick-chips', role: 'group', 'aria-label': 'Filter by category' },
      h('button', { type: 'button', class: 'pick-chip', 'aria-pressed': String(!view.cat), onclick: () => { view.cat = null; redraw(); } }, `All ${all.length}`),
      cats.map((c) => h('button', { type: 'button', class: 'pick-chip', 'aria-pressed': String(view.cat === c), onclick: () => { view.cat = view.cat === c ? null : c; redraw(); } }, c))
    ),
    h(
      'details',
      { class: 'pick-add card' },
      h('summary', {}, isWorkout ? 'Add your own exercise' : 'Add your own meal'),
      h('datalist', { id: 'lib-cats' }, cats.map((c) => h('option', { value: c }))),
      newName,
      newCat,
      newFoods,
      h('button', { class: 'btn small', type: 'button', onclick: addOwn }, icon('plus', 18), 'Add to my library')
    ),
    ...(shown.length
      ? [...groups.entries()].map(([cat, list]) => h('section', { class: 'lib-group' }, h('h2', { class: 'lib-cat' }, cat, h('span', { class: 'pill' }, String(list.length))), h('ul', { class: 'lib-list' }, list.map(row))))
      : [h('p', { class: 'hint' }, 'Nothing matches. Try another search or All.')])
  );
}
