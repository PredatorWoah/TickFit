// pickui.js
// The "Choose exercises" / "Choose meals" sheet: mix and match what you do on one date.
//   * Filter chips by category (Back, Biceps, Breakfast...). It starts on the day's focus, so on
//     "Friday Back Biceps" you see back and biceps exercises first.
//   * Tick what you want. The order you tick them in is the order you do them.
//   * Add your own, or go back to the plan's list.
// Loaded on demand (only when someone opens it), so it costs nothing at startup.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { savePlans } from './store.js';
import { plannedDay } from './schedule.js';
import { mealNumbers } from './stats.js';
import { candidates, focusFor, savePick, resetPick, isPicked, customCandidate } from './library.js';
import { EXERCISES, CARDIO } from './exercises.js';

const GROUP_CATEGORY = { squat: 'Legs', hinge: 'Legs', lunge: 'Legs', hamstring: 'Legs', quad: 'Legs', glute: 'Legs', calf: 'Legs', hpush: 'Chest', chest: 'Chest', vpush: 'Shoulders', shoulder: 'Shoulders', hpull: 'Back', vpull: 'Back', triceps: 'Triceps', biceps: 'Biceps', core: 'Core' };
const DOSE = { compound: [3, '8 to 12', '90s'], isolation: [3, '10 to 15', '60s'], calf: [3, '12 to 15', '45s'], core: [3, '15', '45s'] };

/** TickFit's own exercise list, shaped like plan exercises. */
function builtinExercises() {
  const lifts = EXERCISES.map((e) => {
    const [sets, reps, rest] = DOSE[e.kind] || DOSE.isolation;
    const timed = /plank|wall sit/i.test(e.name);
    return { exercise: e.name, sets, reps: timed ? '30 sec' : reps, rest, weight: '', notes: '', video: '', category: GROUP_CATEGORY[e.groups[0]] || 'Other' };
  });
  const cardio = CARDIO.map((c) => ({ exercise: c.name, sets: 1, reps: '20 min', rest: '', weight: '', notes: '', video: '', category: 'Cardio' }));
  return [...lifts, ...cardio];
}

const SOURCE_NOTE = { day: 'on the plan today', library: '', plan: 'from another day', builtin: 'TickFit list', new: 'new' };

/**
 * @param plan    the active plan (changed in place and saved)
 * @param date    "YYYY-MM-DD"
 * @param kind    'workout' or 'meals'
 * @param onDone  called after saving, to redraw the screen
 */
export function openPicker({ plan, date, kind, onDone }) {
  const isWorkout = kind === 'workout';
  const all = candidates(plan, date, kind, isWorkout ? builtinExercises() : []);
  const current = (plan.picks && plan.picks[date] && plan.picks[date][kind]) || plannedDay(plan, date)[kind].map((x) => x.id);
  // What is ticked, in order. Library ids in a pick match candidates directly.
  let chosen = current.map((id) => all.find((c) => c.id === id)).filter(Boolean);

  const cats = [...new Set(all.map((c) => c.category))];
  let filter = new Set(focusFor(plannedDay(plan, date), cats));
  let query = '';

  openSheet({
    title: isWorkout ? 'Choose exercises' : 'Choose meals',
    build(body, close) {
      const count = h('p', { class: 'pick-count' });
      const chips = h('div', { class: 'pick-chips', role: 'group', 'aria-label': 'Filter by category' });
      const list = h('ul', { class: 'pick-list' });
      const search = h('input', {
        type: 'search',
        class: 'pick-search',
        placeholder: isWorkout ? 'Search exercises' : 'Search meals',
        'aria-label': isWorkout ? 'Search exercises' : 'Search meals',
        oninput: (e) => {
          query = e.target.value.trim().toLowerCase();
          drawList();
        },
      });

      const nameOf = (c) => (isWorkout ? c.item.exercise : c.item.name);
      const detail = (c) => {
        if (isWorkout) return [c.item.sets ? `${c.item.sets} × ${c.item.reps || '?'}` : c.item.reps, c.item.weight].filter(Boolean).join(' · ');
        const n = mealNumbers(c.item);
        const tilde = n.estimated ? '~' : '';
        return [c.item.items.join(', '), typeof n.calories === 'number' ? `${tilde}${n.calories} kcal` : null, typeof n.protein === 'number' ? `${tilde}${n.protein} g protein` : null].filter(Boolean).join(' · ');
      };

      function drawChips() {
        const chip = (label, on, click) => h('button', { type: 'button', class: 'pick-chip', 'aria-pressed': String(on), onclick: click }, label);
        chips.replaceChildren(
          chip('All', filter.size === 0, () => {
            filter = new Set();
            drawChips();
            drawList();
          }),
          ...cats.map((c) =>
            chip(c, filter.has(c), () => {
              if (filter.has(c)) filter.delete(c);
              else filter.add(c);
              drawChips();
              drawList();
            })
          )
        );
      }

      function drawList() {
        count.textContent = chosen.length ? `${chosen.length} chosen. They show in the order you tick them.` : `Nothing chosen yet. ${isWorkout ? 'An empty list makes it a rest day.' : ''}`;
        // Chosen ones always stay on top, so you can see and untick them whatever the filter.
        const rest = all.filter((c) => !chosen.includes(c) && (filter.size === 0 || filter.has(c.category)) && (!query || nameOf(c).toLowerCase().includes(query) || c.category.toLowerCase().includes(query)));
        const row = (c) => {
          const at = chosen.indexOf(c);
          return h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'pick-row' + (at >= 0 ? ' on' : ''),
                role: 'checkbox',
                'aria-checked': String(at >= 0),
                onclick: () => {
                  chosen = at >= 0 ? chosen.filter((x) => x !== c) : [...chosen, c];
                  drawList();
                },
              },
              h('span', { class: 'pick-num', 'aria-hidden': 'true' }, at >= 0 ? String(at + 1) : icon('plus', 18)),
              h('span', { class: 'pick-text' }, h('b', {}, nameOf(c)), h('small', {}, [detail(c), SOURCE_NOTE[c.source]].filter(Boolean).join(' · '))),
              h('span', { class: 'pick-cat' }, c.category)
            )
          );
        };
        list.replaceChildren(...chosen.map(row), ...rest.map(row));
        if (!chosen.length && !rest.length) list.append(h('li', { class: 'hint' }, 'Nothing matches. Try All, or add your own below.'));
      }

      // ----- add your own -----
      const newName = h('input', { type: 'text', placeholder: isWorkout ? 'Exercise name' : 'Meal name, like Oats bowl', 'aria-label': isWorkout ? 'New exercise name' : 'New meal name', maxlength: 80 });
      const newCat = h('input', { type: 'text', placeholder: isWorkout ? 'Category, like Back' : 'Category, like Breakfast', 'aria-label': isWorkout ? 'New exercise category' : 'New meal category', maxlength: 40, list: 'pick-cats' });
      const newFoods = isWorkout ? null : h('input', { type: 'text', placeholder: 'Foods, comma separated (optional)', 'aria-label': 'Foods in the new meal', maxlength: 300 });
      const addOwn = () => {
        const c = customCandidate(kind, newName.value, newCat.value, { items: newFoods ? newFoods.value.split(',').map((s) => s.trim()).filter(Boolean) : [] });
        if (!c) return newName.focus();
        all.unshift(c);
        if (!cats.includes(c.category)) cats.push(c.category);
        chosen = [...chosen, c];
        newName.value = '';
        newCat.value = '';
        if (newFoods) newFoods.value = '';
        drawChips();
        drawList();
      };

      const save = () => {
        savePick(plan, date, kind, chosen);
        savePlans();
        close();
        toast(isWorkout ? 'Workout updated for this day' : 'Meals updated for this day');
        onDone();
      };

      body.append(
        h('p', { class: 'hint' }, isWorkout ? 'Pick the exercises for this day only. The plan itself stays the same, and your logged sets are kept.' : 'Pick the meals for this day only. The plan itself stays the same.'),
        chips,
        search,
        count,
        list,
        h(
          'details',
          { class: 'pick-add' },
          h('summary', {}, isWorkout ? 'Add your own exercise' : 'Add your own meal'),
          h('datalist', { id: 'pick-cats' }, cats.map((c) => h('option', { value: c }))),
          newName,
          newCat,
          newFoods,
          h('button', { class: 'btn small', type: 'button', onclick: addOwn }, icon('plus', 18), 'Add and choose it')
        ),
        h(
          'div',
          { class: 'pick-actions' },
          isPicked(plan, date, kind) &&
            h('button', { class: 'btn', type: 'button', onclick: () => { resetPick(plan, date, kind); savePlans(); close(); toast('Back to the plan for this day'); onDone(); } }, 'Use the plan\'s list'),
          h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save for this day')
        )
      );
      drawChips();
      drawList();
    },
  });
}
