// strideui.js
// "Exercises from Stride": its own screen, so bringing in a day or a week from Stride never looks like importing
// a whole plan. Choose the file, tick the dates you want, and only those dates get Stride's exercises
// (stride.js does the work). Opened from More, or from the Workout screen for the day you are looking at: then a
// one-day file goes onto that day, whatever date Stride gave it.

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { getState, getActivePlan, savePlans, snapshot, restoreSnapshot } from './store.js';
import { readStride, previewStride, applyStride, describeRow, retargetStride, onlyDates } from './stride.js';
import { todayStr, formatShort } from './dates.js';

const CHANGES = new Set(['replace', 'clear', 'rename']);
const MAX_FILE = 2 * 1024 * 1024;

export function renderStride(root, actions, targetDate = null) {
  clear(root);
  const plan = getActivePlan();
  const result = h('div', { 'aria-live': 'polite' });
  const status = h('p', { class: 'hint' });

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > MAX_FILE) return show(null, 'That file is too big to be a Stride export.');
      try {
        show(await file.text());
      } catch {
        show(null, 'Could not read that file.');
      }
    },
  });
  const paste = h('textarea', { class: 'import-box', rows: 5, placeholder: "Or paste the file's text here", spellcheck: false, autocapitalize: 'off', 'aria-label': 'Stride file text' });

  /** Read the text and draw the date list with tick boxes. */
  function show(text, error = '') {
    clear(result);
    status.textContent = '';
    if (error) return result.append(h('div', { class: 'msg error' }, error));
    const read = readStride(text);
    if (!read) {
      return result.append(
        h('div', { class: 'msg error' }, h('b', {}, "That isn't a Stride export."), h('p', {}, 'Choose a file you saved with "Export checked" or "Export checked week" in Stride. To bring in a whole plan instead, use More > New plan.'))
      );
    }
    if (!read.days.length) return result.append(h('div', { class: 'msg error' }, h('ul', {}, (read.errors.length ? read.errors : ['This Stride file has no days in it.']).map((x) => h('li', {}, x)))));
    const stride = targetDate ? retargetStride(read, targetDate) : read;
    const moved = stride.days.length === 1 && stride.days[0].from;
    const rows = previewStride(plan, getState().progress[plan.id], stride, todayStr());
    // with a day to fill (from the Workout screen) only that date starts ticked; otherwise every date that changes
    const startTicked = (r) => CHANGES.has(r.action) && (!targetDate || r.date === targetDate);
    const boxes = new Map();
    const go = h('button', { class: 'btn primary wide big', type: 'button' });
    const count = () => [...boxes.values()].filter((b) => b.checked).length;
    const refresh = () => {
      const n = count();
      go.disabled = !n;
      go.textContent = n ? `Replace exercises on ${n} day${n === 1 ? '' : 's'}` : rows.some((r) => CHANGES.has(r.action)) ? 'Tick a day to change' : 'Nothing to change';
    };
    const list = h(
      'ul',
      { class: 'stride-pick' },
      rows.map((r) => {
        const text = [h('b', {}, formatShort(r.date)), ' ', describeRow(r)];
        if (!CHANGES.has(r.action)) return h('li', { class: `stride-row stride-${r.action}` }, h('span', { class: 'stride-text' }, ...text));
        const box = h('input', { type: 'checkbox', checked: startTicked(r), onchange: refresh });
        boxes.set(r.date, box);
        return h('li', { class: 'stride-row' }, h('label', { class: 'stride-check' }, box, h('span', { class: 'stride-text' }, ...text)));
      })
    );
    go.onclick = () => {
      const dates = [...boxes].filter(([, b]) => b.checked).map(([d]) => d);
      if (!dates.length) return;
      const before = snapshot();
      const target = getActivePlan();
      const done = applyStride(target, getState().progress[target.id], onlyDates(stride, dates), todayStr());
      savePlans();
      toast(`Exercises replaced on ${done.changed.length} day${done.changed.length === 1 ? '' : 's'}`, {
        undo: () => {
          restoreSnapshot(before);
          actions.refresh();
        },
      });
      actions.show('workout', { date: done.changed[0] || dates[0] });
    };
    refresh();
    status.textContent = `A ${stride.scope} from Stride${moved ? `, made for ${formatShort(stride.days[0].from)}, going onto ${formatShort(stride.days[0].date)}` : ''}. Only the days you tick get Stride's exercises. Meals, every other day and everything you logged stay as they are.`;
    result.append(
      ...[
        list,
        stride.errors.length ? h('div', { class: 'msg warn' }, h('ul', {}, stride.errors.map((x) => h('li', {}, x)))) : null,
        go,
      ].filter(Boolean) // (append() would print a null as the word "null")
    );
    result.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  const back = h('button', { class: 'btn ghost back-btn', type: 'button', onclick: () => actions.show(targetDate ? 'workout' : 'more', targetDate ? { date: targetDate } : {}) }, icon('back', 20), targetDate ? 'Workout' : 'More');
  root.append(
    h('div', { class: 'edit-bar' }, back, h('h1', { class: 'page-title tight' }, 'From Stride')),
    !plan
      ? h('section', { class: 'card' }, h('p', {}, 'You have no plan yet. Make one first (More > New plan), then bring in exercises from Stride.'))
      : h(
          'section',
          { class: 'card' },
          h('p', {}, targetDate ? `Put a day from Stride onto ${formatShort(targetDate)}. Only that day's exercises change.` : "Bring in a day or a week of exercises from Stride. You pick which dates change; the rest of your plan stays."),
          h('button', { class: 'btn primary wide', type: 'button', onclick: () => fileInput.click() }, icon('upload', 18), 'Choose Stride file'),
          fileInput,
          h('details', { class: 'stride-paste' }, h('summary', {}, 'Paste it instead'), paste, h('button', { class: 'btn wide', type: 'button', onclick: () => show(paste.value) }, 'Read it')),
          status,
          result
        )
  );
}
