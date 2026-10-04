// plans.js
// The Plans screen: your plans (switch, change start date, delete) and the import box.

import { h, clear, copyText, toast } from './dom.js';
import { getState, addPlan, setActivePlan, removePlan, setStartDate } from './store.js';
import { parsePlanText } from './parser.js';
import { buildPrompt } from './ai.js';
import { todayStr, isValidStr, formatShort } from './dates.js';

/** Fetch the built in sample plan and add it. Returns true on success. */
export async function addSamplePlan() {
  try {
    const res = await fetch('data/sample-plan.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const result = parsePlanText(await res.text());
    if (!result.ok) throw new Error(result.errors.join(' '));
    addPlan(result.plan, todayStr());
    return true;
  } catch (e) {
    console.warn('Could not load the sample plan:', e);
    return false;
  }
}

/**
 * @param root     element to fill
 * @param actions  { show(screen), refresh() }  provided by app.js
 */
export function renderPlans(root, actions) {
  clear(root);
  const state = getState();

  // ----- your plans -----
  const list = h('ul', { class: 'plan-list' });
  if (state.plans.length === 0) {
    list.append(h('li', { class: 'empty' }, 'No plans yet. Import one below or load the sample.'));
  }
  for (const p of state.plans) {
    const active = p.id === state.activePlanId;
    const startInput = h('input', {
      type: 'date',
      class: 'date-input',
      value: p.startDate,
      'aria-label': `Day 1 of ${p.name} starts on`,
      onchange: (e) => {
        if (isValidStr(e.target.value)) {
          setStartDate(p.id, e.target.value);
          toast('Start date updated');
        } else {
          e.target.value = p.startDate;
        }
      },
    });
    list.append(
      h(
        'li',
        { class: 'plan' + (active ? ' active' : '') },
        h('div', { class: 'plan-name' }, p.name, active && h('span', { class: 'pill' }, 'Active')),
        h('div', { class: 'row-meta' }, `${p.days.length} days · Day 1 on ${formatShort(p.startDate)}`),
        h('label', { class: 'field' }, h('span', {}, 'Day 1 starts on'), startInput),
        h(
          'div',
          { class: 'plan-actions' },
          !active &&
            h(
              'button',
              {
                class: 'btn',
                onclick: () => {
                  setActivePlan(p.id);
                  actions.show('today');
                },
              },
              'Use this plan'
            ),
          h(
            'button',
            {
              class: 'btn danger',
              onclick: () => {
                if (confirm(`Delete "${p.name}" and all its progress? This cannot be undone.`)) {
                  removePlan(p.id);
                  actions.refresh();
                }
              },
            },
            'Delete'
          )
        )
      )
    );
  }

  // ----- import box -----
  const box = h('textarea', {
    class: 'import-box',
    rows: 8,
    placeholder: 'Paste your plan JSON here',
    spellcheck: false,
    autocapitalize: 'off',
    autocomplete: 'off',
    'aria-label': 'Plan JSON',
  });
  const startDate = h('input', { type: 'date', class: 'date-input', value: todayStr(), 'aria-label': 'Day 1 starts on' });
  const messages = h('div', { class: 'messages', 'aria-live': 'polite' });

  function showResult(result) {
    clear(messages);
    if (result.errors.length) {
      messages.append(
        h('div', { class: 'msg error' }, h('b', {}, `Could not import (${result.errors.length} problem${result.errors.length > 1 ? 's' : ''}):`), h('ul', {}, result.errors.slice(0, 12).map((e) => h('li', {}, e))), result.errors.length > 12 && h('p', {}, `...and ${result.errors.length - 12} more.`))
      );
    }
    if (result.warnings.length) {
      messages.append(h('div', { class: 'msg warn' }, h('b', {}, 'Notes:'), h('ul', {}, result.warnings.slice(0, 8).map((w) => h('li', {}, w)))));
    }
  }

  function doImport() {
    const result = parsePlanText(box.value);
    showResult(result);
    if (!result.ok) return;
    const date = isValidStr(startDate.value) ? startDate.value : todayStr();
    addPlan(result.plan, date);
    toast(`Imported "${result.plan.name}"`);
    actions.show('today');
  }

  const addCard = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Add a plan'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, 'Tap "Copy AI prompt".'),
      h('li', {}, 'Paste it into any free chatbot, then paste your plan document under it.'),
      h('li', {}, 'Copy the JSON it replies with and paste it below.')
    ),
    h(
      'button',
      {
        class: 'btn wide',
        onclick: async () => toast((await copyText(buildPrompt())) ? 'Prompt copied' : 'Could not copy. Long press to copy manually.'),
      },
      'Copy AI prompt'
    ),
    box,
    h('label', { class: 'field' }, h('span', {}, 'Day 1 starts on'), startDate),
    h('button', { class: 'btn primary wide', onclick: doImport }, 'Import plan'),
    messages
  );

  const sampleBtn = h(
    'button',
    {
      class: 'btn ghost wide',
      onclick: async () => {
        if (await addSamplePlan()) {
          toast('Sample plan added');
          actions.show('today');
        } else toast('Could not load the sample plan');
      },
    },
    'Add the sample plan'
  );

  root.append(h('section', { class: 'card' }, h('h2', {}, 'Your plans'), list, sampleBtn), addCard);
}
