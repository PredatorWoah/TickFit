// skipday.js
// "Skip day": one tap and the whole day is set aside (travel, sick, rest you did not plan). A skipped day is
// neutral: it never breaks your streak and does not drag down your week (stats.js pctFor gives null for it, the
// same as a rest day). Anything you ticked on it is kept, and Undo brings the day back exactly as it was.
// Phone reminders stay quiet that day (reminders.js).

import { h, toast, clear } from './dom.js';
import { icon } from './icons.js';
import { updateRecord, getRecord } from './store.js';
import { createCtx, dateBar } from './dayview.js';
import { stopRest } from './timer.js';

/** Skip (on = true) or bring back (on = false) one date of a plan. */
export function setSkipped(plan, date, on) {
  updateRecord(plan.id, date, (rec) => {
    if (on) rec.skipped = true;
    else delete rec.skipped;
  });
  if (on) stopRest(); // a running rest timer belongs to a day that is no longer happening
}

/** The slim "Skip day" button row on Today, Workout and Meals. `redraw` shows the screen again. */
export function skipRow(plan, date, redraw) {
  return h(
    'div',
    { class: 'skip-row' },
    h(
      'button',
      {
        class: 'skip-btn',
        type: 'button',
        'aria-label': 'Skip this whole day',
        onclick: () => {
          setSkipped(plan, date, true);
          toast('Day skipped. Your streak is safe.');
          redraw();
        },
      },
      icon('skip', 16),
      'Skip day'
    )
  );
}

/** What the day screens show for a skipped date, in place of the exercises and meals. */
export function renderSkipped(root, plan, date, goto, redraw) {
  clear(root);
  const ctx = createCtx(plan, date, goto);
  const kept = Object.values(getRecord(plan.id, date).ticks || {}).some(Boolean);
  root.append(
    dateBar(ctx),
    h(
      'section',
      { class: 'card skipped-card' },
      h('div', { class: 'skipped-icon' }, icon('skip', 40)),
      h('h1', { class: 'skipped-title' }, 'Day skipped'),
      h('p', { class: 'hint' }, `Nothing is expected on this day. Your streak and your week's percentage ignore it.${kept ? ' What you ticked is kept.' : ''}`),
      h(
        'button',
        {
          class: 'btn primary wide',
          type: 'button',
          onclick: () => {
            setSkipped(plan, date, false);
            redraw();
          },
        },
        'Undo skip'
      )
    )
  );
}
