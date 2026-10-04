// editor.js
// Edit a plan after importing it: rename it, add/remove/reorder days, and change
// exercises, meals and extras. Every change is saved straight away (no Save button),
// so nothing is lost if you close the app.
//
// Two views: the plan overview (list of days) and the editor for one day.

import { h, clear, toast } from './dom.js';
import { savePlans, newItemId } from './store.js';

/**
 * @param root     element to fill
 * @param plan     the plan being edited (changed in place)
 * @param actions  { close() } go back to the Plans screen
 * @param dayIdx   which day is open, or null for the overview
 */
export function renderEditor(root, plan, actions, dayIdx = null) {
  clear(root);
  const redraw = (idx = dayIdx) => renderEditor(root, plan, actions, idx);

  if (dayIdx === null || !plan.days[dayIdx]) return overview();
  return dayEditor(plan.days[dayIdx]);

  // ---------- overview ----------
  function overview() {
    root.append(
      h('div', { class: 'edit-bar' }, h('button', { class: 'btn ghost', onclick: actions.close }, '‹ Done'), h('h1', { class: 'page-title tight' }, 'Edit plan')),
      h(
        'section',
        { class: 'card' },
        textField('Plan name', plan.name, (v) => {
          plan.name = v;
        }, { required: true, fallback: plan.name }),
        h('h2', {}, `Days (${plan.days.length})`),
        h(
          'ul',
          { class: 'day-list' },
          plan.days.map((d, i) =>
            h(
              'li',
              {},
              h(
                'button',
                { class: 'day-link', onclick: () => redraw(i) },
                h('span', { class: 'row-title' }, d.label),
                h('span', { class: 'row-meta' }, d.workout.length ? `${d.workout.length} exercises · ${d.meals.length} meals` : `Rest day · ${d.meals.length} meals`)
              )
            )
          )
        ),
        h(
          'button',
          {
            class: 'btn wide',
            onclick: () => {
              plan.days.push({ label: `Day ${plan.days.length + 1}`, workout: [], meals: [], extras: { waterLiters: null, supplements: [], notes: '' } });
              savePlans();
              redraw(plan.days.length - 1);
            },
          },
          '+ Add a day'
        )
      )
    );
  }

  // ---------- one day ----------
  function dayEditor(day) {
    const i = dayIdx;
    const move = (delta) => {
      const j = i + delta;
      if (j < 0 || j >= plan.days.length) return;
      [plan.days[i], plan.days[j]] = [plan.days[j], plan.days[i]];
      savePlans();
      redraw(j);
    };

    root.append(
      h('div', { class: 'edit-bar' }, h('button', { class: 'btn ghost', onclick: () => redraw(null) }, '‹ All days'), h('h1', { class: 'page-title tight' }, `Day ${i + 1}`)),
      h(
        'section',
        { class: 'card' },
        textField('Day label', day.label, (v) => {
          day.label = v;
        }, { required: true, fallback: day.label }),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', disabled: i === 0, onclick: () => move(-1) }, '↑ Earlier'),
          h('button', { class: 'btn', disabled: i === plan.days.length - 1, onclick: () => move(1) }, '↓ Later'),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                const copy = JSON.parse(JSON.stringify(day));
                copy.label += ' (copy)';
                plan.days.splice(i + 1, 0, copy);
                savePlans();
                toast('Day duplicated');
                redraw(i + 1);
              },
            },
            'Duplicate'
          ),
          h(
            'button',
            {
              class: 'btn danger',
              onclick: () => {
                if (plan.days.length === 1) return toast('A plan needs at least one day');
                if (!confirm(`Delete "${day.label}"?`)) return;
                plan.days.splice(i, 1);
                savePlans();
                redraw(null);
              },
            },
            'Delete'
          )
        )
      ),

      // Workout
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Workout (leave empty for a rest day)'),
        day.workout.map((w, j) =>
          block(
            `Exercise ${j + 1}`,
            () => {
              day.workout.splice(j, 1);
              savePlans();
              redraw();
            },
            textField('Exercise', w.exercise, (v) => (w.exercise = v), { required: true, fallback: w.exercise }),
            h(
              'div',
              { class: 'grid3' },
              numberField('Sets', w.sets, (v) => (w.sets = v === null ? null : Math.max(1, Math.round(v)))),
              textField('Reps', w.reps, (v) => (w.reps = v)),
              textField('Rest', w.rest, (v) => (w.rest = v))
            ),
            textField('Notes', w.notes, (v) => (w.notes = v))
          )
        ),
        h(
          'button',
          {
            class: 'btn wide',
            onclick: () => {
              day.workout.push({ id: newItemId('w', day.workout), exercise: 'New exercise', sets: 3, reps: '10', rest: '60s', notes: '' });
              savePlans();
              redraw();
            },
          },
          '+ Add exercise'
        )
      ),

      // Meals
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Meals'),
        day.meals.map((m, j) =>
          block(
            `Meal ${j + 1}`,
            () => {
              day.meals.splice(j, 1);
              savePlans();
              redraw();
            },
            h('div', { class: 'grid2' }, textField('Time', m.time, (v) => (m.time = v)), textField('Meal name', m.name, (v) => (m.name = v), { required: true, fallback: m.name })),
            listField('Foods (one per line)', m.items, (list) => (m.items = list), { minOne: true }),
            h('div', { class: 'grid2' }, numberField('Calories', m.calories ?? null, (v) => setOrDelete(m, 'calories', v)), numberField('Protein (g)', m.protein ?? null, (v) => setOrDelete(m, 'protein', v)))
          )
        ),
        h(
          'button',
          {
            class: 'btn wide',
            onclick: () => {
              day.meals.push({ id: newItemId('m', day.meals), time: '', name: 'New meal', items: ['Food'] });
              savePlans();
              redraw();
            },
          },
          '+ Add meal'
        )
      ),

      // Extras
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Extras'),
        numberField('Water target (litres)', day.extras.waterLiters, (v) => (day.extras.waterLiters = v !== null && v > 0 ? v : null)),
        listField('Supplements (one per line)', day.extras.supplements, (list) => (day.extras.supplements = list)),
        textField('Notes for the day', day.extras.notes, (v) => (day.extras.notes = v), { multiline: true })
      )
    );
  }
}

// ---------- small form helpers ----------

function setOrDelete(obj, key, value) {
  if (value === null || value < 0) delete obj[key];
  else obj[key] = value;
}

/** A card-like block with a title and a remove button. */
function block(title, onRemove, ...children) {
  return h('div', { class: 'block' }, h('div', { class: 'block-head' }, h('b', {}, title), h('button', { class: 'btn danger small', 'aria-label': `Remove ${title}`, onclick: onRemove }, 'Remove')), ...children);
}

/** Text input that saves when you leave the field. `required` fields refuse to be empty. */
function textField(label, value, onCommit, opts = {}) {
  const input = h(opts.multiline ? 'textarea' : 'input', opts.multiline ? { rows: 3 } : { type: 'text' });
  input.value = value ?? '';
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (opts.required && !v) {
      input.value = opts.fallback ?? '';
      toast(`${label} can't be empty`);
      return;
    }
    onCommit(v);
    opts.fallback = v;
    savePlans();
  });
  return h('label', { class: 'f' }, h('span', {}, label), input);
}

/** Number input. Empty means "no value" (null). */
function numberField(label, value, onCommit) {
  const input = h('input', { type: 'number', inputMode: 'decimal', min: 0, step: 'any' });
  input.value = value ?? '';
  input.addEventListener('change', () => {
    const n = parseFloat(input.value);
    onCommit(isFinite(n) ? n : null);
    savePlans();
  });
  return h('label', { class: 'f' }, h('span', {}, label), input);
}

/** Several lines of text, saved as a list. */
function listField(label, list, onCommit, opts = {}) {
  const input = h('textarea', { rows: Math.max(2, Math.min(6, list.length + 1)) });
  input.value = list.join('\n');
  input.addEventListener('change', () => {
    const items = input.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (opts.minOne && items.length === 0) {
      input.value = list.join('\n');
      toast('Add at least one food');
      return;
    }
    onCommit(items);
    list = items;
    savePlans();
  });
  return h('label', { class: 'f' }, h('span', {}, label), input);
}
