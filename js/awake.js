// awake.js
// Keeps the screen on while the rest timer is running, so the phone does not lock between sets.
// Android app: a window flag through the TickFitScreen plugin (works in every Android web view, no permission).
// Browser / installed web app: the Screen Wake Lock API where the browser has it, asked again when you come back
// to the page (browsers drop the lock when the page is hidden).
// Released the moment the rest ends, so the phone's own screen timeout is back in charge.

import { isNative, nativePlugin } from './platform.js';

let wanted = false;
let lock = null;
let listening = false;

async function acquire() {
  if (!wanted || lock || typeof navigator === 'undefined' || !navigator.wakeLock) return;
  try {
    const l = await navigator.wakeLock.request('screen');
    if (!wanted) return l.release().catch(() => {}); // the rest ended while we were asking
    lock = l;
    l.addEventListener('release', () => {
      if (lock === l) lock = null;
    });
  } catch {
    /* not allowed here (low battery saver, no permission): the phone just locks as usual */
  }
}

function onVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') acquire();
}

/** Keep the screen on (true) or let the phone lock again (false). Safe to call repeatedly. */
export function keepScreenOn(on) {
  wanted = !!on;
  const native = isNative() ? nativePlugin('TickFitScreen') : null;
  if (native) {
    native.keepOn({ on: wanted }).catch(() => {});
    return;
  }
  if (wanted) {
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
      listening = true;
    }
    acquire();
  } else if (lock) {
    const l = lock;
    lock = null;
    l.release().catch(() => {});
  }
}
