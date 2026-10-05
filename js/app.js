// app.js
// Starts the app, owns the "which screen / which date" state, and draws the bottom tab bar.
//
// Screens:  welcome (first time only) | today | workout | meals | progress | more
// Under More: plans (your plans) | new (how to make one) | import | build | edit

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { load, getState, getActivePlan, isPersistent, protectStorage, snoozeBackupNudge, setSetting } from './store.js';
import { todayStr } from './dates.js';
import { renderHome } from './home.js';
import { renderWorkout, teardownWorkout } from './workout.js';
import { renderMeals } from './meals.js';
import { renderWelcome, renderPlans, renderNewPlan, renderImport } from './plans.js';
import { renderProgress } from './progress.js';
import { renderMore } from './more.js';
import { applyTheme } from './theme.js';
import { nudgeDue, backupStale, loggedDayCount, snoozeDate } from './safety.js';
import { openBackupSheet } from './backupui.js';
import { showUpdateBanner } from './update.js';
import './install.js'; // starts listening for the browser's install offer
import { isNative, onBackButton, exitApp } from './platform.js';
import { backTarget } from './backnav.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');

const view = { screen: 'today', date: todayStr(), planId: null };

// The plan builder and the plan editor are big and only used now and then, so they are loaded the first time
// they are opened instead of at startup (the rest of the app starts about a quarter smaller).
const lazyScreens = {
  build: () => import('./build.js').then((m) => m.renderBuild),
  edit: () => import('./editor.js').then((m) => m.renderEditor),
};
let drawId = 0; // each draw() gets a number, so a slow screen that finishes loading late cannot overwrite a newer one

/** Load a lazy screen, then show it unless the person has already moved on. */
function showLazy(id, key, render) {
  clear(root);
  lazyScreens[key]()
    .then((fn) => {
      if (id !== drawId) return;
      render(fn);
      warnIfStorageBlocked();
    })
    .catch(() => {
      if (id !== drawId) return;
      clear(root);
      root.append(h('p', { class: 'msg warn' }, 'Could not open this screen. Check your connection and try again.'));
    });
}

function warnIfStorageBlocked() {
  if (!isPersistent()) root.prepend(h('p', { class: 'msg warn' }, 'Your browser is blocking storage, so progress will be lost when you close this tab.'));
}

const TABS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'workout', label: 'Workout', icon: 'dumbbell' },
  { id: 'meals', label: 'Meals', icon: 'meal' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'more', label: 'More', icon: 'more' },
];
const MORE_TAB_SCREENS = ['more', 'plans', 'new', 'import', 'build', 'edit'];
const NEEDS_PLAN = ['today', 'workout', 'meals', 'progress'];

/** Switch screen. opts: { date } for Today, { planId } for the editor. */
function show(screen, opts = {}) {
  view.screen = screen;
  view.date = screen === 'today' ? opts.date || todayStr() : view.date;
  if (opts.planId) view.planId = opts.planId;
  draw();
  window.scrollTo(0, 0);
}

function gotoDate(date) {
  view.dir = date > view.date ? 'next' : 'prev';
  view.date = date;
  draw();
}

/** The tab bar is built once and then only updated, so the active tab can animate from one tab to the next. */
function drawNav() {
  nav.hidden = view.screen === 'welcome';
  if (nav.children.length !== TABS.length) {
    clear(nav);
    for (const t of TABS) {
      nav.append(
        h(
          'button',
          { class: 'tab', type: 'button', onclick: () => show(t.id) },
          icon(t.icon, 24),
          t.id === 'more' && h('span', { class: 'tab-dot', role: 'img', 'aria-label': 'Backup is overdue', hidden: true }),
          h('span', {}, t.label)
        )
      );
    }
  }
  const activeTab = MORE_TAB_SCREENS.includes(view.screen) ? 'more' : view.screen;
  const { progress, settings } = getState();
  const stale = backupStale({ loggedDays: loggedDayCount(progress), lastBackup: settings.lastBackup }, todayStr());
  TABS.forEach((t, i) => {
    const btn = nav.children[i];
    const active = activeTab === t.id;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
    const dot = btn.querySelector('.tab-dot');
    if (dot) dot.hidden = !stale;
  });
}

let lastScreenKey = null;

/** Fade the new screen in. Sliding sideways when you step to the next or previous day, rising when you change screen. */
function playEnter(dir) {
  root.dataset.dir = dir || 'up';
  root.classList.remove('enter');
  void root.offsetWidth; // restart the animation
  root.classList.add('enter');
}

function draw() {
  const id = ++drawId;
  teardownWorkout(); // stop the workout clock and floating bar unless the Workout screen redraws them
  const plan = getActivePlan();
  // Screens that need a plan: with none, send people to the welcome screen (first time) or Plans.
  if (!plan && NEEDS_PLAN.includes(view.screen)) view.screen = getState().settings.welcomed ? 'plans' : 'welcome';
  drawNav();

  const actions = { show, refresh: draw, hasBuilder: true };
  const s = view.screen;
  if (s === 'welcome') renderWelcome(root, actions);
  else if (s === 'plans') renderPlans(root, actions);
  else if (s === 'new') renderNewPlan(root, actions);
  else if (s === 'import') renderImport(root, actions);
  else if (s === 'build') showLazy(id, 'build', (render) => render(root, actions));
  else if (s === 'more') renderMore(root, actions);
  else if (s === 'progress') renderProgress(root, plan, (date) => show('today', { date }));
  else if (s === 'workout') renderWorkout(root, plan, view.date, gotoDate);
  else if (s === 'meals') renderMeals(root, plan, view.date, gotoDate);
  else if (s === 'edit') {
    const target = getState().plans.find((p) => p.id === view.planId);
    if (target) showLazy(id, 'edit', (render) => render(root, target, { close: () => show('plans') }));
    else return show('plans');
  } else {
    renderHome(root, plan, view.date, gotoDate, actions);
    showBackupNudge();
  }

  // Animate only when the screen or day really changed, not when the same screen is just redrawn after a change
  const screenKey = `${view.screen}|${view.date}|${view.planId || ''}`;
  if (screenKey !== lastScreenKey) playEnter(view.dir);
  lastScreenKey = screenKey;
  view.dir = null;

  if (s !== 'build' && s !== 'edit') warnIfStorageBlocked(); // the lazy screens do this themselves once they are drawn
}

/** A gentle, dismissible reminder to back up, shown on Today only when there is real progress to lose. */
function showBackupNudge() {
  const { progress, settings } = getState();
  const today = todayStr();
  if (!nudgeDue({ loggedDays: loggedDayCount(progress), lastBackup: settings.lastBackup, snoozeUntil: settings.backupSnoozeUntil }, today)) return;

  const doBackup = () => openBackupSheet(draw);
  root.prepend(
    h(
      'div',
      { class: 'nudge', role: 'region', 'aria-label': 'Backup reminder' },
      h('p', {}, settings.lastBackup ? 'Time for today\'s backup. It takes one tap, and your progress only lives on this phone.' : 'You have not backed up yet. Your progress only lives on this phone, so a backup file keeps it safe if you lose it or switch phones.'),
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
          'Later today'
        )
      )
    )
  );
}

/** Offline support. The service worker caches the app after the first visit and keeps it up to date. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || isNative()) return; // the Android app already has every file inside it
  // When a newer version takes over from one that was already running, offer a reload (never reloads on its own).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => hadController && showUpdateBanner());

  const register = () =>
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' }) // always check the server for a new sw.js
      .then((reg) => {
        // An installed app is often just resumed, not reloaded, so also look for updates when it comes back.
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
      })
      .catch((e) => console.warn('Service worker failed:', e));
  // By the time we get here the page may already be loaded, so don't wait for an event that has passed.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}

/** Android Back button / swipe-back: close a sheet, else go up one screen, and only leave the app from Today. */
function handleBack(canGoBack) {
  if (canGoBack || (history.state && history.state.tickfitSheet)) return history.back(); // an open sheet closes itself
  const target = backTarget(view.screen, view.date, todayStr());
  if (!target) return exitApp();
  show(target.screen, target.date ? { date: target.date } : {});
}

function start() {
  load();
  applyTheme(getState().settings.theme);
  protectStorage().then(() => view.screen === 'more' && draw()); // ask the browser to keep our data; shown on the More screen
  // People who already have plans never need the welcome screen.
  if (getState().plans.length && !getState().settings.welcomed) setSetting('welcomed', true);
  view.screen = getActivePlan() ? 'today' : getState().settings.welcomed ? 'plans' : 'welcome';
  draw();
  registerServiceWorker();
  onBackButton(handleBack);
}

start();
