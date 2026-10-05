// platform.js
// Is TickFit running inside the Android app (a Capacitor wrapper) or in a normal browser?
// The Android app has the whole of TickFit packed inside it, so it works with no website at all.
// In the app, a few things differ: saving files goes through the phone's share sheet (a WebView cannot
// "download" a file), there is no service worker (the files are already on the phone), and the status
// bar colours follow the theme.

/** Set when the Android app is built (android-app/scripts/prepare.mjs rewrites this line). */
export const NATIVE_VERSION = null;

/** True inside the Android app. */
export const isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

/** A Capacitor plugin by name (Filesystem, Share, SystemBars...), or null when it is not there. */
export const nativePlugin = (name) => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;

/** Version of the Android app, like "1.0.0", or null in a browser. */
export const appVersion = () => (isNative() ? NATIVE_VERSION || 'dev' : null);

/**
 * Android app: run `handler(canGoBack)` when the Back button or swipe-back gesture is used.
 * `canGoBack` is true when the web view has history to go back to (an open sheet, for example).
 * Once a handler is set, the app no longer closes by itself on Back, the handler decides. No-op in a browser.
 */
export function onBackButton(handler) {
  const app = nativePlugin('App');
  if (!isNative() || !app || typeof app.addListener !== 'function') return;
  app.addListener('backButton', (event) => handler(!!(event && event.canGoBack)));
}

/** Android app: close the app. */
export function exitApp() {
  const app = nativePlugin('App');
  if (isNative() && app && typeof app.exitApp === 'function') app.exitApp();
}

/**
 * A tiny physical tap when you tick something, so the app feels alive. Uses the phone's haptic motor in the
 * Android app and the vibration API in a browser that has it. Never throws, does nothing where unsupported.
 * kind: 'tick' (light tap) or 'success' (a bit more, for finishing a workout)
 */
export function haptic(kind = 'tick') {
  try {
    const h = nativePlugin('Haptics');
    if (isNative() && h) {
      if (kind === 'success' && h.notification) return void h.notification({ type: 'SUCCESS' });
      if (h.impact) return void h.impact({ style: kind === 'success' ? 'MEDIUM' : 'LIGHT' });
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(kind === 'success' ? [12, 40, 18] : 8);
  } catch {
    // haptics are a nicety, never a problem
  }
}
