// app.js
// Starts the app, owns the "which screen / which date" state, and draws the bottom tab bar.

import { h, clear } from './dom.js';
import { load, getActivePlan, isPersistent } from './store.js';
import { todayStr } from './dates.js';
import { renderToday } from './today.js';
import { renderPlans, addSamplePlan } from './plans.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');

const view = { screen: 'today', date: todayStr() };

const TABS = [
  { id: 'today', label: 'Today', icon: '✅' },
  { id: 'plans', label: 'Plans', icon: '📋' },
];

function show(screen) {
  view.screen = screen;
  if (screen === 'today') view.date = todayStr();
  draw();
  window.scrollTo(0, 0);
}

function gotoDate(date) {
  view.date = date;
  draw();
}

function drawNav() {
  clear(nav);
  for (const t of TABS) {
    nav.append(
      h(
        'button',
        { class: 'tab' + (view.screen === t.id ? ' active' : ''), 'aria-current': view.screen === t.id ? 'page' : null, onclick: () => show(t.id) },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon),
        h('span', {}, t.label)
      )
    );
  }
}

function draw() {
  drawNav();
  const plan = getActivePlan();
  // No plan yet? Always send people to the Plans screen.
  if (!plan && view.screen === 'today') view.screen = 'plans';

  if (view.screen === 'plans') renderPlans(root, { show, refresh: draw });
  else renderToday(root, plan, view.date, gotoDate);

  if (!isPersistent()) {
    root.prepend(h('p', { class: 'msg warn' }, 'Your browser is blocking storage, so progress will be lost when you close this tab.'));
  }
}

async function start() {
  load();
  // First open: add the built in sample plan so the app is useful straight away.
  if (!getActivePlan()) await addSamplePlan();
  view.screen = getActivePlan() ? 'today' : 'plans';
  draw();
}

start();
