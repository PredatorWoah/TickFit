// app.js
// Starts the app, owns the "which screen / which date" state, and draws the bottom tab bar.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { load, getState, getActivePlan, isPersistent, protectStorage, snoozeBackupNudge } from './store.js';
import { todayStr } from './dates.js';
import { renderToday } from './today.js';
import { renderPlans, renderNewPlan, renderImport, addSamplePlan } from './plans.js';
import { renderProgress } from './progress.js';
import { renderEditor } from './editor.js';
import { renderMore } from './more.js';
import { applyTheme } from './theme.js';
import { nudgeDue, loggedDayCount, snoozeDate } from './safety.js';
import { canShareFiles, saveBackupFile, shareBackupFile } from './backup.js';
import { toast } from './dom.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');

// screen: today | progress | plans | new | import | edit | more.
// "new", "import" and "edit" belong to the Plans tab.
const view = { screen: 'today', date: todayStr(), planId: null };

const TABS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'plans', label: 'Plans', icon: 'plans' },
  { id: 'more', label: 'More', icon: 'more' },
];
const PLANS_TAB_SCREENS = ['plans', 'new', 'import', 'edit'];

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
  const activeTab = PLANS_TAB_SCREENS.includes(view.screen) ? 'plans' : view.screen;
  for (const t of TABS) {
    nav.append(
      h(
        'button',
        { class: 'tab' + (activeTab === t.id ? ' active' : ''), type: 'button', 'aria-current': activeTab === t.id ? 'page' : null, onclick: () => show(t.id) },
        icon(t.icon, 24),
        h('span', {}, t.label)
      )
    );
  }
}

function draw() {
  drawNav();
  const plan = getActivePlan();
  // These screens need a plan. Without one, send people to Plans to add one.
  if (!plan && (view.screen === 'today' || view.screen === 'progress')) view.screen = 'plans';

  const actions = { show, refresh: draw, hasBuilder: false };
  if (view.screen === 'plans') renderPlans(root, actions);
  else if (view.screen === 'new') renderNewPlan(root, actions);
  else if (view.screen === 'import') renderImport(root, actions);
  else if (view.screen === 'progress') renderProgress(root, plan, (date) => show('today', { date }));
  else if (view.screen === 'more') renderMore(root, actions);
  else if (view.screen === 'edit') {
    const target = getState().plans.find((p) => p.id === view.planId);
    if (target) renderEditor(root, target, { close: () => show('plans') });
    else return show('plans');
  } else {
    renderToday(root, plan, view.date, gotoDate);
    showBackupNudge();
  }

  if (!isPersistent()) {
    root.prepend(h('p', { class: 'msg warn' }, 'Your browser is blocking storage, so progress will be lost when you close this tab.'));
  }
}

/** A gentle, dismissible reminder to back up, shown on Today only when there is real progress to lose. */
function showBackupNudge() {
  const { progress, settings } = getState();
  const today = todayStr();
  if (!nudgeDue({ loggedDays: loggedDayCount(progress), lastBackup: settings.lastBackup, snoozeUntil: settings.backupSnoozeUntil }, today)) return;

  const doBackup = async () => {
    try {
      if (canShareFiles()) {
        if (!(await shareBackupFile())) return; // they closed the share sheet
      } else saveBackupFile();
      toast('Backup done. Nice.');
      draw();
    } catch {
      toast('Could not make the backup. Try More, then Save backup file.');
    }
  };
  root.prepend(
    h(
      'div',
      { class: 'nudge', role: 'region', 'aria-label': 'Backup reminder' },
      h('p', {}, settings.lastBackup ? 'It has been a while since your last backup. Your progress only lives on this phone.' : 'You have not backed up yet. Your progress only lives on this phone, so a backup file keeps it safe if you lose it or switch phones.'),
      h(
        'div',
        { class: 'nudge-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: doBackup }, 'Back up now'),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              snoozeBackupNudge(snoozeDate(today));
              draw();
            },
          },
          'Remind me later'
        )
      )
    )
  );
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
  applyTheme(getState().settings.theme);
  protectStorage().then(() => view.screen === 'more' && draw()); // ask the browser to keep our data; shown on the More screen
  // First open: add the built in sample plan so the app is useful straight away.
  if (!getActivePlan()) await addSamplePlan();
  view.screen = getActivePlan() ? 'today' : 'plans';
  draw();
  registerServiceWorker();
}

start();
