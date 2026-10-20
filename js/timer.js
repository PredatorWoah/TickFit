// timer.js
// Rest timer: parse "90s" / "2 min" / "1:30" from a plan, and show a countdown bar.
//
// The countdown is based on an END TIME, not on counting ticks, so it stays correct
// even if the phone throttles the page while the screen is dimmed.

import { restChanged } from './restalert.js';
import { h } from './dom.js';
import { getState } from './store.js';

/**
 * Turn a rest string from a plan into seconds. Returns null if it can't tell.
 *   "90s" "90 sec" -> 90      "2 min" "2 minutes" -> 120     "1:30" -> 90
 *   "60 to 90s" "60-90s" -> 90 (the longer one)             "1 min 30 sec" -> 90
 *   a bare number: 10 or more means seconds ("90"), below 10 means minutes ("2")
 */
export function parseRestSeconds(text) {
  const t = String(text ?? '').toLowerCase().trim();
  if (!t) return null;

  const clock = t.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const UNIT = { h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, s: 1, sec: 1, secs: 1, second: 1, seconds: 1 };
  const bare = (n) => (n >= 10 ? n : n * 60);

  // Ranges like "60 to 90s", "60-90 sec", "1-2 min": take the longer end, with the shared unit.
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*([a-z]*)/);
  if (range) {
    const hi = Math.max(Number(range[1]), Number(range[2]));
    const mult = UNIT[range[3]];
    return Math.round(mult ? hi * mult : bare(hi));
  }

  // One or more "number unit" pairs: "1 min 30 sec".
  let total = 0;
  let found = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]*)/g)) {
    const n = Number(m[1]);
    const mult = UNIT[m[2]];
    if (m[2] && !mult) continue; // some other word, like "rest"
    total += mult ? n * mult : bare(n);
    found = true;
  }
  return found && total > 0 ? Math.round(total) : null;
}

/** "75" -> "1:15" */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- the countdown bar (browser only) ----------

let bar = null; // the floating element, or null when no timer is running
let endAt = 0;
let interval = null;
let finished = false;
let audioCtx = null;

const soundOn = () => getState().settings.sound !== false;

/** Short beeps. Uses the Web Audio API, so there is no sound file to download. */
function beep() {
  try {
    if (!audioCtx) return;
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.15);
    });
  } catch {
    /* no audio, that's fine */
  }
}

export function stopRest() {
  restChanged(null);
  clearInterval(interval);
  interval = null;
  if (bar) bar.remove();
  bar = null;
  document.body.classList.remove('has-rest');
}

/** Start (or restart) the rest timer. Call this from a tap so audio is allowed. */
export function startRest(seconds, label) {
  stopRest();
  finished = false;
  endAt = Date.now() + seconds * 1000;

  // Audio must be unlocked by a user tap, which is why we create it here.
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }

  let total = seconds;
  const clock = h('div', { class: 'rest-clock', 'aria-live': 'off' }, formatClock(seconds));
  const title = h('div', { class: 'rest-title' }, 'Rest', label && h('span', {}, ` · ${label}`));
  // Arena shows the rest as a shot clock ring; Deck fills the screen and drains it (styles in css/arena.css,
  // css/deck.css). Both read --left, the share of the rest still to go.
  const svgNS = 'http://www.w3.org/2000/svg';
  const ringSvg = document.createElementNS(svgNS, 'svg');
  ringSvg.setAttribute('viewBox', '0 0 44 44');
  ringSvg.setAttribute('class', 'rest-ring');
  ringSvg.setAttribute('aria-hidden', 'true');
  for (const cls of ['rest-ring-track', 'rest-ring-fill']) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '22');
    c.setAttribute('cy', '22');
    c.setAttribute('r', '19');
    c.setAttribute('pathLength', '100');
    ringSvg.append(c);
  }
  bar = h(
    'div',
    { class: 'rest-bar', role: 'timer' },
    ringSvg,
    h('div', { class: 'rest-info' }, title, clock),
    h('div', { class: 'rest-btns' },
      h('button', { class: 'btn small', type: 'button', onclick: () => ((endAt += 15000), (total += 15), (finished = false), bar.classList.remove('done'), restChanged(endAt, label), tick()) }, '+15s'),
      h('button', { class: 'btn small', type: 'button', onclick: stopRest }, 'Skip'),
      h('button', { class: 'btn small rest-hide', type: 'button', onclick: (e) => (e.currentTarget.textContent = bar.classList.toggle('mini') ? 'Show' : 'Hide') }, 'Hide')
    )
  );
  document.body.append(bar);
  document.body.classList.add('has-rest');
  restChanged(endAt, label); // the Android app alerts from a notification if the screen goes off (restalert.js)

  function tick() {
    if (!bar) return;
    const left = (endAt - Date.now()) / 1000;
    bar.style.setProperty('--left', String(Math.max(0, Math.min(1, left / total))));
    if (left > 0) {
      clock.textContent = formatClock(left);
      return;
    }
    clock.textContent = 'Go!';
    bar.classList.add('done');
    if (!finished) {
      finished = true;
      // back in the app long after the end: the phone's notification already told you, so stay quiet
      if (soundOn() && Date.now() - endAt < 3000) {
        beep();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
      // Leave "Go!" up for a few seconds, then tidy away.
      const mine = bar;
      setTimeout(() => {
        if (bar === mine && finished) stopRest();
      }, 6000);
    }
  }
  interval = setInterval(tick, 250);
  tick();
}
