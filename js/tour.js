// tour.js
// The "?" button on Today and the tour it opens: the screen dims, one part at a time is lit up with a short
// note on what it is and what tapping or swiping it does. Each look (Arena, Deck, Bento) has its own notes;
// parts that are not on screen (no steps, no AI, a rest day) are skipped. In Deck the top card shows its
// swipe by itself. Back, Next, Skip, the Escape key and the phone's back gesture all work.

import { h } from './dom.js';
import { getState, setSetting } from './store.js';
import { lookOf } from './theme.js';

const LOOK_NAME = { arena: 'Arena', deck: 'Deck', bento: 'Bento' };

const COMMON_TOP = [
  { sel: '.home-head .strip', title: 'Pick a day', text: 'Tap any day to see it or fill it in. The mark under each day shows how it went: full when everything was ticked, small when some was, a dash when nothing was planned.' },
  { sel: '.home-head .plan-chip', title: 'Your plan', text: 'The plan you are following. Tap it to switch plans, edit this one or make a new one.' },
  { sel: '.home-head .steps-pill', title: 'Steps', text: "Today's steps, read from Health Connect on Android." },
];

const COMMON_END = [
  { sel: '#ai-fab', title: 'Ask AI', text: 'Your AI assistant: ask for a summary, a review of your progress, or changes to exercises and meals. It only suggests; nothing changes until you tap Apply. Turn it on or off in More.' },
  { sel: '#nav', title: 'The tabs', text: 'Today is this screen. Workout logs every set, Meals ticks food and water, Progress shows your charts and records, More holds your plan, looks, backups and settings.' },
  { sel: '.help-btn', title: 'Any time', text: 'Tap ? whenever you want this tour again. Each look has its own.' },
];

const STEPS = {
  arena: [
    { sel: '.ar-kicker', title: 'Matchday', text: 'MATCHDAY counts the days since your plan started. The flame is your streak: days in a row you ticked at least half of.' },
    ...COMMON_TOP,
    { sel: '.ar-teams', title: 'The scoreboard', text: "Every day is a match against the same day last week. Left is you today, right is last week, both in percent of the day's ticks (exercises, meals, water, supplements). Beat last week to win the day." },
    { sel: '.ar-line', title: 'The match line', text: 'Leading, level or behind, and how many plays are left. A play is one thing still to tick. The red dot blinks while today is still in play.' },
    { sel: '.ar-score .day-title', title: 'Plan day', text: "The day of your plan you're on. Tap it to jump to any other day of the plan." },
    { sel: '.ar-quarters', title: 'The quarters', text: 'Q1 Train: sets done of planned. Q2 Eat: calories eaten of the target. Q3 Water: litres drunk. Q4 Move: steps, when steps are on. Each bar fills as you go.' },
    { sel: '.ar-replay', title: 'Replay', text: 'A tip from last time. When you hit all your reps, TickFit suggests going a little heavier today.' },
    { sel: '.ar-lineup', title: "Today's line-up", text: 'Your exercises in order. A tick replaces the number when one is done. Tap any of them to open the workout.' },
    { sel: '.ar-kick', title: 'The big button', text: 'Kick off starts the workout clock. While it runs it says Back in the game, with the time. Full time means the workout is finished; Ended early means it was finished with sets left. Tap to open it.' },
    { sel: '.ar-lineup-host .pick-btn', title: 'Choose exercises', text: 'Swap, add or remove exercises for this day only. Your plan stays as it is.' },
    { sel: '.meal-card', title: 'Meals', text: 'Calories eaten so far and your next meal. Tap to open Meals and tick what you ate.' },
    ...COMMON_END,
  ],
  deck: [
    { sel: '.dk-head .date-main', title: 'Cards left', text: 'How many things are left today. The bar under it fills as you finish cards. The flame is your streak.' },
    ...COMMON_TOP,
    { sel: '.dk-card', title: 'The top card', text: 'The next thing to do: your workout, a meal, water or a supplement. The coloured edges behind it are the cards coming after.' },
    { sel: '.dk-card', title: 'Swipe it', demo: 'swipe', text: 'Swipe right to do it: start the workout, tick the meal, add a glass of water. Swipe left to put it at the back for later. Scrolling up and down never counts as a swipe.' },
    { sel: '.dk-actions', title: 'Or tap', text: 'Same as swiping. Later sends the card to the back; the right button does it. Ticked something by mistake? Tap Undo on the message that pops up.' },
    { sel: '.dk-done', title: 'Done pile', text: 'Cards you finished today collect here.' },
    ...COMMON_END,
  ],
  bento: [
    ...COMMON_TOP,
    { sel: '.t-ring', title: 'Your day', text: "The ring fills with the share of today's ticks done. Tap the day name to jump to another day of your plan." },
    { sel: '.t-streak', title: 'Streak', text: 'Days in a row you ticked at least half of the day.' },
    { sel: '.t-workout', title: 'Workout', text: "Today's exercises. The button starts the workout clock, or takes you back to it while it runs." },
    { sel: '.t-meals', title: 'Meals', text: 'Calories eaten so far and your next meal. Tap to open Meals.' },
    { sel: '.t-water', title: 'Water', text: 'Plus adds a glass, minus takes one away.' },
    { sel: '.t-weight', title: 'Weight', text: 'Log your weight to see how it changes week to week.' },
    ...COMMON_END,
  ],
};

/** The steps for a look, kept to the parts that are on screen right now. */
export function tourSteps(look = lookOf(), doc = document) {
  const list = STEPS[look] || STEPS.arena;
  const visible = (el) => el && el.getClientRects().length > 0 && !el.closest('[hidden]');
  return [{ title: `How Today works`, text: `A quick tour of this screen in the ${LOOK_NAME[look] || 'Arena'} look. Tap Next to go through it, or Skip any time.` }, ...list.filter((s) => visible(doc.querySelector(s.sel)))];
}

/** The round ? button for the top right of Today. Pulses until the tour has been seen once in this look. */
export function helpButton() {
  const look = lookOf();
  const seen = (getState().settings.helpSeen || {})[look];
  return h('button', { class: 'help-btn' + (seen ? '' : ' fresh'), type: 'button', 'aria-label': 'How this screen works', onclick: (e) => (e.currentTarget.classList.remove('fresh'), startTour()) }, '?');
}

let open = null;

export function startTour(steps = tourSteps()) {
  if (open) return;
  const look = lookOf();
  setSetting('helpSeen', { ...(getState().settings.helpSeen || {}), [look]: true });

  let i = 0;
  let demoStop = null;
  const hole = h('div', { class: 'tour-hole' });
  const count = h('span', { class: 'tour-count' });
  const title = h('h2', { class: 'tour-title', id: 'tour-title' });
  const text = h('p', { class: 'tour-text' });
  const back = h('button', { class: 'btn', type: 'button', onclick: () => go(i - 1) }, 'Back');
  const next = h('button', { class: 'btn primary', type: 'button', onclick: () => go(i + 1) }, 'Next');
  const tip = h('div', { class: 'tour-tip', role: 'document' }, h('div', { class: 'tour-top' }, count, h('button', { class: 'tour-skip', type: 'button', onclick: () => close() }, 'Skip')), title, text, h('div', { class: 'tour-btns' }, back, next));
  const layer = h('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title' }, hole, tip);
  // taps outside the card go nowhere (the lit part is only shown, not pressed)
  layer.addEventListener('click', (e) => e.target === layer && e.stopPropagation());

  const target = () => steps[i].sel && document.querySelector(steps[i].sel);

  function place() {
    const el = target();
    const pad = 8;
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    if (!el) {
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
      tip.style.cssText = `top:${Math.max(24, vh / 2 - tip.offsetHeight / 2)}px;`;
      return;
    }
    const r = el.getBoundingClientRect();
    const left = Math.max(4, r.left - pad);
    const top = Math.max(4, r.top - pad);
    const width = Math.min(vw - 8, r.right + pad) - left;
    const height = Math.min(vh - 8, r.bottom + pad) - top;
    const radius = Math.min(28, parseFloat(getComputedStyle(el).borderTopLeftRadius) + pad || 16);
    hole.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;border-radius:${radius}px;`;
    const th = tip.offsetHeight;
    const below = top + height + 12;
    const above = top - 12 - th;
    const y = below + th <= vh - 12 ? below : above >= 12 ? above : Math.max(12, vh - th - 12);
    tip.style.cssText = `top:${y}px;`;
  }

  function go(n) {
    if (n < 0) return;
    if (n >= steps.length) return close();
    demoStop && demoStop();
    demoStop = null;
    i = n;
    const s = steps[i];
    count.textContent = `${i + 1} of ${steps.length}`;
    title.textContent = s.title;
    text.textContent = s.text;
    back.hidden = i === 0;
    next.textContent = i === steps.length - 1 ? 'Got it' : 'Next';
    const el = target();
    const fixed = el && getComputedStyle(el).position === 'fixed';
    if (el && !fixed) {
      // scroll so the lit part and the note under it both fit; a part too tall for that goes to the top
      const r = el.getBoundingClientRect();
      const tipH = tip.offsetHeight || 230;
      const fits = r.height + tipH + 40 <= innerHeight;
      const seen = fits ? r.top >= 16 && r.bottom <= innerHeight - 16 && (r.bottom + tipH + 24 <= innerHeight || r.top - tipH - 24 >= 0) : r.top >= 0 && r.top < 40;
      if (!seen) scrollTo({ top: scrollY + r.top - (fits ? Math.max(16, (innerHeight - r.height - tipH - 20) / 3) : 16), behavior: 'smooth' });
    }
    place();
    setTimeout(place, 380); // after the smooth scroll lands
    if (s.demo === 'swipe' && el) demoStop = swipeDemo(el);
    next.focus({ preventScroll: true });
  }

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  const onPop = () => close(true);
  const onResize = () => place();

  function close(fromBack) {
    if (!open) return;
    demoStop && demoStop();
    open = null;
    removeEventListener('keydown', onKey);
    removeEventListener('popstate', onPop);
    removeEventListener('resize', onResize);
    removeEventListener('scroll', onResize);
    layer.classList.remove('on');
    setTimeout(() => layer.remove(), 250);
    if (!fromBack && history.state && history.state.tickfitSheet) history.back();
  }

  open = { close };
  document.body.append(layer);
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  addEventListener('scroll', onResize, { passive: true });
  history.pushState({ tickfitSheet: true }, ''); // like a sheet: the phone's back gesture closes it (app.js handleBack)
  addEventListener('popstate', onPop);
  requestAnimationFrame(() => layer.classList.add('on'));
  go(0);
}

/** Wiggle a Deck card right, then left, showing the DONE and LATER labels, until stopped. */
function swipeDemo(card) {
  let alive = true;
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(() => alive && fn(), ms));
  const pose = (x, cls) => {
    card.classList.remove('go-right', 'go-left');
    if (cls) card.classList.add(cls);
    card.style.transform = x ? `translateX(${x}px) rotate(${x / 24}deg)` : '';
  };
  const loop = (t0) => {
    at(t0 + 300, () => pose(90, 'go-right'));
    at(t0 + 1300, () => pose(0));
    at(t0 + 1800, () => pose(-90, 'go-left'));
    at(t0 + 2800, () => pose(0));
    at(t0 + 3300, () => loop(0));
  };
  loop(0);
  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    pose(0);
  };
}
