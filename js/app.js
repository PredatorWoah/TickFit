// app.js
// Starts the app, owns the "which screen / which date" state, and draws the bottom tab bar.

import { h, clear } from './dom.js';
import { load, getState, getActivePlan, isPersistent } from './store.js';
import { todayStr } from './dates.js';
import { renderToday } from './today.js';
import { renderPlans, addSamplePlan } from './plans.js';
import { renderProgress } from './progress.js';
import { renderEditor } from './editor.js';
import { renderMore } from './more.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');

// screen: today | progress | plans | edit | more.  "edit" belongs to the Plans tab.
const view = { screen: 'today', date: todayStr(), planId: null };

const TABS = [
  { id: 'today', label: 'Today', icon: '✅' },
  { id: 'progress', label: 'Progress', icon: '🔥' },
  { id: 'plans', label: 'Plans', icon: '📋' },
  { id: 'more', label: 'More', icon: '⚙️' },
];

/** Switch screen. opts: { date } for Today, { planId } for the editor. */
function show(screen, opts = {}) {
  view.screen = screen;
  view.date = screen === 'today' ? opts.date || todayStr() : view.date;
  if (opts.planId) view.planId = opts.planId;
  draw();
  window.scrollTo(0, 0);
}

function gotoDate(date) {
  view.date = date;
  draw();
}

function drawNav() {
  clear(nav);
  const activeTab = view.screen === 'edit' ? 'plans' : view.screen;
  for (const t of TABS) {
    nav.append(
      h(
        'button',
        { class: 'tab' + (activeTab === t.id ? ' active' : ''), 'aria-current': activeTab === t.id ? 'page' : null, onclick: () => show(t.id) },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon),
        h('span', {}, t.label)
      )
    );
  }
}

function draw() {
  drawNav();
  const plan = getActivePlan();
  // These screens need a plan. Without one, send people to Plans to import or add the sample.
  if (!plan && (view.screen === 'today' || view.screen === 'progress')) view.screen = 'plans';

  const actions = { show, refresh: draw };
  if (view.screen === 'plans') renderPlans(root, actions);
  else if (view.screen === 'progress') renderProgress(root, plan, (date) => show('today', { date }));
  else if (view.screen === 'more') renderMore(root, actions);
  else if (view.screen === 'edit') {
    const target = getState().plans.find((p) => p.id === view.planId);
    if (target) renderEditor(root, target, { close: () => show('plans') });
    else return show('plans');
  } else renderToday(root, plan, view.date, gotoDate);

  if (!isPersistent()) {
    root.prepend(h('p', { class: 'msg warn' }, 'Your browser is blocking storage, so progress will be lost when you close this tab.'));
  }
}

/** Offline support. The service worker caches the app after the first visit. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed:', e));
  // By the time we get here the page may already be loaded, so don't wait for an event that has passed.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}

async function start() {
  load();
  // First open: add the built in sample plan so the app is useful straight away.
  if (!getActivePlan()) await addSamplePlan();
  view.screen = getActivePlan() ? 'today' : 'plans';
  draw();
  registerServiceWorker();
}

start();
