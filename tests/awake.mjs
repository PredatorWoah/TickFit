// The screen stays on during a rest and is released after. Run: node tests/awake.mjs
import fs from 'node:fs';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const tick = () => new Promise((r) => setTimeout(r, 5));

// ----- web: Screen Wake Lock API
const listeners = {};
let held = 0, requests = 0, onRelease = null;
globalThis.document = { visibilityState: 'visible', addEventListener: (e, f) => (listeners[e] = f) };
globalThis.window = {};
Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => { requests++; held++; return { release: async () => { held--; }, addEventListener: (e, f) => (onRelease = f) }; } } }, configurable: true });
const { keepScreenOn } = await import('../js/awake.js');

keepScreenOn(true); await tick();
ok(held === 1, 'a rest takes a screen wake lock');
keepScreenOn(true); await tick();
ok(held === 1 && requests === 1, 'asking again does not stack locks');
keepScreenOn(false); await tick();
ok(held === 0, 'the lock is released when the rest ends');
keepScreenOn(true); await tick();
held = 0; onRelease(); // the browser dropped it (page was hidden)
listeners.visibilitychange(); await tick();
ok(held === 1, 'coming back to the page takes the lock again while a rest runs');
keepScreenOn(false); await tick();
listeners.visibilitychange(); await tick();
ok(held === 0, 'but not once the rest is over');

// ----- Android app: the native window flag
const calls = [];
globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { TickFitScreen: { keepOn: async (a) => { calls.push(a.on); } } } } };
const platform = await import('../js/platform.js');
if (platform.isNative()) {
  keepScreenOn(true); keepScreenOn(false);
  ok(calls.join() === 'true,false', 'in the Android app the native flag is switched on and off');
} else console.log('skip native call check (platform check differs)');

// ----- wiring
const timer = fs.readFileSync(new URL('../js/timer.js', import.meta.url), 'utf8');
ok(/keepScreenOn\(true\)/.test(timer) && /keepScreenOn\(false\)/.test(timer), 'the rest timer holds and releases the screen');
const java = fs.readFileSync(new URL('../android-app/native/java/TickFitScreenPlugin.java', import.meta.url), 'utf8');
ok(/FLAG_KEEP_SCREEN_ON/.test(java) && /name = "TickFitScreen"/.test(java), 'the native plugin sets the keep screen on flag');
const custom = fs.readFileSync(new URL('../android-app/scripts/customize.mjs', import.meta.url), 'utf8');
ok(/registerPlugin\(TickFitScreenPlugin\.class\)/.test(custom), 'the native plugin is registered');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
