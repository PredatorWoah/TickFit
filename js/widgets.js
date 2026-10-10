// widgets.js
// Keeps the Android home screen widgets in step with the app. Only does anything inside the Android app.
//
//   * After every save, when the app comes back and when it is left, it sends a fresh snapshot (widgetdata.js)
//     to the native TickFitWidget plugin, which redraws every widget. It is sent straight away, not after a
//     delay, because Android pauses the app as soon as you leave it and a delayed send would be lost.
//   * The snapshot also holds tomorrow, so the widgets roll over at midnight on their own.
//   * Water added with a widget's + button is held by the native side until the app runs again; then it is
//     added to that day's record here, so the app's own data stays the only source of truth.
//   * Tapping a widget opens the app on the right screen (Today, Workout or Meals).

import { isNative, nativePlugin } from './platform.js';
import { getState, onSaved, updateRecord } from './store.js';
import { todayStr } from './dates.js';
import { widgetSnapshot } from './widgetdata.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ML = 20000; // a day's water from the widget can't be more than this, whatever the native side says

/** The native plugin, or null in a browser or an older app build without it. */
function plugin() {
  if (!isNative()) return null;
  const cap = window.Capacitor;
  return nativePlugin('TickFitWidget') || (cap && typeof cap.registerPlugin === 'function' ? cap.registerPlugin('TickFitWidget') : null);
}

/** Add water that was logged on the widget: { "2026-10-10": 500 } -> the active plan's records. Returns true if anything changed. */
export function applyPendingWater(pending) {
  const plan = getState().plans.find((p) => p.id === getState().activePlanId) || getState().plans[0];
  if (!plan || !pending || typeof pending !== 'object') return false;
  let changed = false;
  for (const [date, ml] of Object.entries(pending)) {
    const n = Math.round(Number(ml));
    if (!DATE_RE.test(date) || !(n > 0)) continue;
    updateRecord(plan.id, date, (r) => (r.waterMl = (r.waterMl || 0) + Math.min(n, MAX_ML)));
    changed = true;
  }
  return changed;
}

/**
 * Start keeping the widgets up to date.
 * @param onOpen     function(screen) to show 'today', 'workout' or 'meals' (a widget was tapped)
 * @param onChanged  function() to redraw after water from a widget was added
 */
export function startWidgets({ onOpen, onChanged }) {
  const W = plugin();
  if (!W) return;

  const send = () => {
    try {
      const snap = widgetSnapshot(getState(), todayStr());
      if (snap) W.update({ data: JSON.stringify(snap) }).catch(() => {});
    } catch (e) {
      console.warn('Widget update failed', e);
    }
  };
  // Several saves in a row (one tap can save more than once) send one snapshot, still before the app can pause.
  let queued = false;
  const push = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      send();
    });
  };

  const takeWater = async () => {
    try {
      const r = await W.takeWater();
      if (applyPendingWater(JSON.parse((r && r.water) || '{}'))) onChanged();
    } catch {
      // an app build without the widget plugin: nothing to take
    }
    push();
  };

  onSaved(push);
  try {
    W.addListener('open', (e) => e && ['today', 'workout', 'meals'].includes(e.screen) && onOpen(e.screen));
  } catch {
    // no events on this build
  }
  const app = nativePlugin('App');
  if (app && typeof app.addListener === 'function') {
    app.addListener('resume', takeWater);
    app.addListener('pause', send); // leaving the app: make sure the widgets have the very latest
  }
  takeWater();
}
