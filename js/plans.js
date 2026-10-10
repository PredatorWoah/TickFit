// plans.js
// The Plans area: your plans list, the "New plan" chooser, and the import screen.

import { h, clear, copyText, toast } from './dom.js';
import { icon } from './icons.js';
import { getState, addPlan, setActivePlan, removePlan, setStartDate, setSetting } from './store.js';
import { parsePlanText } from './parser.js';
import { buildPrompt } from './ai.js';
import { extractText } from './extract.js';
import { convertWithGemini, hasGeminiKey } from './gemini.js';
import { todayStr, isValidStr, formatShort } from './dates.js';
import { weeklyWeekdays, weekdayName } from './schedule.js';
import { openMergeSheet, offerMerge, canMergeInto } from './mergeui.js';

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

const backBar = (label, onBack, title) =>
  h('div', { class: 'edit-bar' }, h('button', { class: 'btn ghost back-btn', type: 'button', onclick: onBack }, icon('back', 20), label), h('h1', { class: 'page-title tight' }, title));

// ---------------------------------------------------------------------------
// Plans list
// ---------------------------------------------------------------------------

/**
 * @param root     element to fill
 * @param actions  { show(screen, opts), refresh() }  provided by app.js
 */
export function renderPlans(root, actions) {
  clear(root);
  const state = getState();

  const list = h('ul', { class: 'plan-list' });
  if (state.plans.length === 0) list.append(h('li', { class: 'empty' }, 'No plans yet. Tap "New plan" to add one.'));

  for (const p of state.plans) {
    const active = p.id === state.activePlanId;
    const weekly = weeklyWeekdays(p); // weekday labelled plans follow the real calendar
    const startInput = h('input', {
      type: 'date',
      class: 'date-input',
      value: p.startDate,
      'aria-label': `Day 1 of ${p.name} starts on`,
      onchange: (e) => {
        if (isValidStr(e.target.value)) {
          setStartDate(p.id, e.target.value);
          toast('Start date updated');
        } else e.target.value = p.startDate;
      },
    });
    list.append(
      h(
        'li',
        { class: 'plan' + (active ? ' active' : '') },
        h('div', { class: 'plan-name' }, p.name, active && h('span', { class: 'pill' }, 'Active')),
        weekly
          ? h('div', { class: 'row-meta' }, `Weekly plan, ${p.days.length} days (${weekly.map((w) => weekdayName(w).slice(0, 3)).join(', ')}). Follows the real weekdays.`)
          : h('div', { class: 'row-meta' }, `${p.days.length} days · Day 1 on ${formatShort(p.startDate)}`),
        !weekly && h('label', { class: 'field' }, h('span', {}, 'Day 1 starts on'), startInput),
        h(
          'div',
          { class: 'plan-actions' },
          !active &&
            h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  const prev = getState().activePlanId;
                  setActivePlan(p.id);
                  actions.show('today');
                  offerMerge(prev, p.id, actions.refresh);
                },
              },
              'Use this plan'
            ),
          active &&
            canMergeInto(p.id) &&
            h('button', { class: 'btn', type: 'button', onclick: () => openMergeSheet({ toId: p.id, onDone: actions.refresh }) }, icon('plus', 18), 'Bring in progress'),
          h('button', { class: 'btn', type: 'button', onclick: () => actions.show('edit', { planId: p.id }) }, 'Edit'),
          h(
            'button',
            {
              class: 'btn danger',
              type: 'button',
              onclick: () => {
                const tip = !active && canMergeInto(getState().activePlanId) ? ' Tip: to keep its days, use "Bring in progress" on your active plan first.' : '';
                if (confirm(`Delete "${p.name}" and all its progress? This cannot be undone.${tip}`)) {
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

  root.append(
    backBar('More', () => actions.show('more'), 'My plans'),
    list,
    h('button', { class: 'btn primary wide big', type: 'button', onclick: () => actions.show('new') }, icon('plus', 22), 'New plan')
  );
}

// ---------------------------------------------------------------------------
// Welcome: the first thing a new person sees
// ---------------------------------------------------------------------------

export function renderWelcome(root, actions) {
  clear(root);
  const choose = (fn) => async () => {
    setSetting('welcomed', true);
    await fn();
  };
  const option = (iconName, title, text, onclick) =>
    h('button', { class: 'option big', type: 'button', onclick: choose(onclick) }, h('span', { class: 'option-icon' }, icon(iconName, 28)), h('span', { class: 'option-text' }, h('b', {}, title), h('span', {}, text)), icon('chevron-right', 20));
  root.append(
    h('div', { class: 'welcome' }, h('img', { class: 'welcome-logo', src: 'icons/icon.svg', alt: '', width: 72, height: 72 }), h('h1', {}, 'Welcome to TickFit'), h('p', {}, 'Your gym and meal checklist. Free, private and it works offline. Everything stays on this phone.')),
    h('h2', { class: 'welcome-q' }, 'How do you want to start?'),
    h(
      'div',
      { class: 'options' },
      option('sparkle', 'Build a plan for me', 'Answer a few questions and get a full workout and meal plan.', () => actions.show('build')),
      option('paste', 'I already have a plan', 'Paste it, upload a PDF, or let a chatbot convert it.', () => actions.show('import')),
      option('today', 'Just show me around', 'Start with a 4 week beginner plan and vegetarian Indian meals.', async () => {
        if (await addSamplePlan()) actions.show('today');
        else toast('Could not load the sample plan');
      })
    )
  );
}

// ---------------------------------------------------------------------------
// New plan: pick how to make one
// ---------------------------------------------------------------------------

export function renderNewPlan(root, actions) {
  clear(root);
  const option = (iconName, title, text, onclick) =>
    h('button', { class: 'option', type: 'button', onclick }, h('span', { class: 'option-icon' }, icon(iconName, 26)), h('span', { class: 'option-text' }, h('b', {}, title), h('span', {}, text)), icon('chevron-right', 20));

  const options = [];
  if (actions.hasBuilder) options.push(option('sparkle', 'Build one for me', 'Answer a few questions about you and get a full workout and meal plan. Works offline.', () => actions.show('build')));
  options.push(
    option('paste', 'Paste or upload a plan', 'From a chatbot, a PDF or a text file.', () => actions.show('import')),
    option('today', 'Use the sample plan', '4 week beginner plan with vegetarian Indian meals.', async () => {
      if (await addSamplePlan()) {
        toast('Sample plan added');
        actions.show('today');
      } else toast('Could not load the sample plan');
    })
  );
  root.append(backBar('Plans', () => actions.show('plans'), 'New plan'), h('div', { class: 'options' }, options));
}

// ---------------------------------------------------------------------------
// Import: paste, upload, or convert
// ---------------------------------------------------------------------------

export function renderImport(root, actions) {
  clear(root);

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
  const status = h('div', { class: 'status', 'aria-live': 'polite' });

  function showResult(result) {
    clear(messages);
    if (result.errors.length) {
      messages.append(
        h(
          'div',
          { class: 'msg error' },
          h('b', {}, `Could not import (${result.errors.length} problem${result.errors.length > 1 ? 's' : ''}):`),
          h('ul', {}, result.errors.slice(0, 12).map((e) => h('li', {}, e))),
          result.errors.length > 12 && h('p', {}, `...and ${result.errors.length - 12} more.`)
        )
      );
    }
    if (result.warnings.length) {
      messages.append(h('div', { class: 'msg warn' }, h('b', {}, 'Notes:'), h('ul', {}, result.warnings.slice(0, 8).map((w) => h('li', {}, w)))));
    }
  }

  // Optional: upload a PDF / text file (read on this device, nothing is uploaded).
  const fileInput = h('input', {
    type: 'file',
    accept: '.pdf,.txt,.md,.json,.csv,application/pdf,text/plain',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      status.textContent = `Reading ${file.name}...`;
      try {
        box.value = await extractText(file);
        clear(messages);
        status.textContent = `Read ${file.name} (${box.value.length.toLocaleString()} characters) on this device. If it is already plan JSON, tap Import. If it is a normal document, convert it with ${hasGeminiKey() ? 'Gemini or ' : ''}a chatbot using "Copy prompt with this text".`;
      } catch (err) {
        status.textContent = '';
        showResult({ errors: [err.message], warnings: [] });
      }
    },
  });

  // Optional: convert with the user's own Gemini key.
  const geminiBtn = hasGeminiKey()
    ? h(
        'button',
        {
          class: 'btn wide',
          type: 'button',
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Converting with Gemini...';
            clear(messages);
            try {
              const reply = await convertWithGemini(box.value);
              const result = parsePlanText(reply);
              // Show the JSON so the user can look it over before importing.
              box.value = result.ok ? JSON.stringify(result.plan, null, 2) : reply;
              status.textContent = result.ok ? 'Gemini converted it. Have a look, then tap Import plan.' : '';
              showResult(result);
            } catch (err) {
              status.textContent = '';
              showResult({ errors: [err.message], warnings: [] });
            } finally {
              btn.disabled = false;
              btn.textContent = 'Convert with Gemini';
            }
          },
        },
        'Convert with Gemini'
      )
    : null;

  function doImport() {
    const result = parsePlanText(box.value);
    showResult(result);
    if (!result.ok) return;
    const date = isValidStr(startDate.value) ? startDate.value : todayStr();
    const prev = getState().activePlanId;
    const added = addPlan(result.plan, date);
    toast(`Imported "${result.plan.name}"`);
    actions.show('today');
    offerMerge(prev, added.id, actions.refresh);
  }

  root.append(
    backBar('Back', () => actions.show('new'), 'Import a plan'),
    h(
      'section',
      { class: 'card' },
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Tap "Copy AI prompt".'),
        h('li', {}, 'Paste it into any free chatbot, then paste your plan document under it.'),
        h('li', {}, 'Copy the JSON it replies with and paste it below.')
      ),
      h('button', { class: 'btn wide', type: 'button', onclick: async () => toast((await copyText(buildPrompt())) ? 'Prompt copied' : 'Could not copy. Long press to copy manually.') }, 'Copy AI prompt'),
      h(
        'div',
        { class: 'upload-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon('upload', 18), 'Upload PDF or text'),
        h('button', { class: 'btn', type: 'button', onclick: async () => toast((await copyText(buildPrompt(box.value))) ? 'Prompt copied' : 'Could not copy') }, 'Copy prompt with this text'),
        fileInput
      ),
      box,
      geminiBtn,
      status,
      h('label', { class: 'field' }, h('span', {}, 'Start date'), startDate),
      h('p', { class: 'hint' }, 'Day 1 of the plan lands on this date. Plans labelled Monday, Tuesday and so on ignore it and follow the real weekdays.'),
      h('button', { class: 'btn primary wide', type: 'button', onclick: doImport }, 'Import plan'),
      messages
    )
  );
}
