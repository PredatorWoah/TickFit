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
