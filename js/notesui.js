// notesui.js
// The "Notes for today" card on the Workout screen: tidy bullet points, a warnings box, and an
// Edit button. Edits are saved straight into the plan (for this day, or every day that has the same note).

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { savePlans } from './store.js';
import { parseNotes, tidyNotes, daysWithNote } from './notes.js';

const COLLAPSE_OVER = 3; // notes with more points than this start collapsed
let openState = null; // remembers if you opened or closed it while using the app (null = use the default)

/** @param ctx  the day context (plan, day, idx, date, goto) */
export function notesCard(ctx) {
  const { plan, day } = ctx;
  const text = (day.extras && day.extras.notes) || '';
  const edit = () => editNotes(ctx);
  if (ctx.idx < 0) return h('div'); // a weekday this weekly plan does not list: nothing stored to edit

  if (!text.trim()) {
    return h('button', { class: 'notes-add', type: 'button', onclick: edit }, icon('edit', 18), 'Add notes for this day');
  }

  const { points, warnings } = parseNotes(text);
  const count = points.length + warnings.length;
  let open = openState === null ? count <= COLLAPSE_OVER : openState;

  const pointEl = (p) => h('li', {}, p.label && h('b', { class: 'note-label' }, p.label + ': '), p.text);
  const body = h(
    'div',
    { class: 'notes-body' },
    points.length > 0 && h('ul', { class: 'note-list' }, points.map(pointEl)),
    warnings.length > 0 && h('div', { class: 'note-warn' }, h('b', {}, 'Stay safe'), h('ul', { class: 'note-list' }, warnings.map(pointEl)))
  );
  const chev = h('span', { class: 'chev' }, icon('chevron-down', 20));
  const toggle = h(
    'button',
    {
      class: 'notes-toggle',
      type: 'button',
      onclick: () => {
        open = !open;
        openState = open;
        sync();
      },
    },
    h('span', { class: 'notes-title' }, 'Notes for today'),
    h('span', { class: 'notes-count' }, `${count} point${count === 1 ? '' : 's'}`),
    chev
  );
  const sync = () => {
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    chev.classList.toggle('up', open);
  };
  sync();

  return h('section', { class: 'notes-card', 'aria-label': 'Notes for today' }, h('div', { class: 'notes-head' }, toggle, h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Edit notes', onclick: edit }, icon('edit', 18))), body);
}

/** Sheet to edit the notes of one day. */
function editNotes(ctx) {
  const { plan, day } = ctx;
  openSheet({
    title: 'Edit notes',
    build(body, close) {
      const old = (day.extras && day.extras.notes) || '';
      const area = h('textarea', { class: 'notes-edit', rows: 10, 'aria-label': 'Notes for this day', placeholder: 'One point per line works best.\nWarm up: 5 minutes walking\nStop if something hurts.' });
      area.value = old;
      const others = daysWithNote(plan, old, ctx.idx);

      const save = (all) => {
        const value = area.value.trim();
        const targets = all ? [ctx.idx, ...others] : [ctx.idx];
        for (const i of targets) {
          const d = plan.days[i];
          if (!d.extras) d.extras = { waterLiters: null, supplements: [], notes: '' };
          d.extras.notes = value;
        }
        savePlans();
        close();
        toast(all && others.length ? `Notes saved for ${targets.length} days` : 'Notes saved');
        ctx.goto(ctx.date); // redraw with the new notes
      };

      body.append(
        ...[
          h('p', { class: 'hint' }, 'Write what you like. One point per line shows as a neat list. Warnings about pain or dizziness are placed in their own box.'),
          area,
          h('button', { class: 'btn small', type: 'button', onclick: () => (area.value = tidyNotes(area.value)) }, icon('sparkle', 18), 'Tidy up into points'),
          h('button', { class: 'btn primary wide big', type: 'button', onclick: () => save(false) }, others.length ? 'Save for this day only' : 'Save'),
          others.length > 0 && h('button', { class: 'btn wide', type: 'button', onclick: () => save(true) }, `Save for all ${others.length + 1} days with this note`),
        ].filter(Boolean)
      );
      requestAnimationFrame(() => area.focus());
    },
  });
}
