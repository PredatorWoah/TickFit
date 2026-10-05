// Tests for the Android-app (Capacitor) code paths, with a pretend Capacitor. Run: node tests/platform.mjs
// The browser paths are covered by the other suites; this checks what happens inside the app.

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', m, ok ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); };

// A pretend phone: window.Capacitor with the two plugins backups need.
const calls = [];
let shareBehaviour = 'ok';
const store = new Map();
globalThis.window = {
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      Filesystem: { writeFile: async (o) => { calls.push(['writeFile', o.path, o.directory, o.encoding]); store.set(o.path, o.data); return { uri: 'file:///data/cache/' + o.path }; } },
      Share: { share: async (o) => { calls.push(['share', ...o.files]); if (shareBehaviour === 'cancel') throw new Error('Share canceled'); if (shareBehaviour === 'fail') throw new Error('boom'); return {}; } },
      SystemBars: { setStyle: async (o) => { calls.push(['bars', o.style]); } },
    },
  },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test' }, configurable: true });
globalThis.document = { querySelector: () => null, documentElement: { setAttribute() {} } };
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = String(v)) };

const { isNative, nativePlugin, appVersion } = await import('../js/platform.js');
const { canShareFiles, shareBackupFile, saveBackupFile } = await import('../js/backup.js');
const { getState, load } = await import('../js/store.js');
const { applyTheme } = await import('../js/theme.js');
const { isInstalledApp } = await import('../js/install.js');
load();

eq('inside the app', isNative(), true);
eq('plugins are found by name', [!!nativePlugin('Share'), nativePlugin('Nope')], [true, null]);
eq('app version falls back to dev when not stamped', appVersion(), 'dev');
eq('the app counts as installed (no "Get the app" card)', isInstalledApp(), true);
eq('sharing files is available in the app', canShareFiles(), true);

let ok = await shareBackupFile('my backup');
eq('share returns true', ok, true);
eq('the backup is written to the cache folder as utf8 then shared', calls.slice(0, 2), [['writeFile', 'my backup.json', 'CACHE', 'utf8'], ['share', 'file:///data/cache/my backup.json']]);
const written = JSON.parse(store.get('my backup.json'));
eq('the file is a real TickFit backup', [written.app, Array.isArray(written.data.plans)], ['tickfit', true]);
eq('the backup date is recorded', typeof getState().settings.lastBackup, 'string');

getState().settings.lastBackup = null;
shareBehaviour = 'cancel';
eq('closing the share sheet is not an error and does not count as a backup', [await shareBackupFile('x'), getState().settings.lastBackup], [false, null]);
shareBehaviour = 'fail';
let threw = false; try { await shareBackupFile('x'); } catch { threw = true; }
eq('a real failure is reported (so the screen can tell the person)', threw, true);
shareBehaviour = 'ok';
eq('"Download" in the app also goes through the share sheet', await saveBackupFile('y'), true);
eq('file names are cleaned in the app too', calls.filter((c) => c[0] === 'writeFile').pop()[1], 'y.json');

calls.length = 0;
applyTheme('light'); applyTheme('dark');
eq('status bar icons follow the theme', calls.filter((c) => c[0] === 'bars').map((c) => c[1]), ['LIGHT', 'DARK']);

// missing plugins must not crash
delete globalThis.window.Capacitor.Plugins.Share;
eq('without the Share plugin the share option is hidden', canShareFiles(), false);
threw = false; try { await shareBackupFile('z'); } catch { threw = true; }
eq('without the Share plugin sharing fails cleanly', threw, true);

// a normal browser
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
eq('in a browser: not native', [isNative(), appVersion(), nativePlugin('Share')], [false, null, null]);

console.log(fail ? `\n${fail} failed` : '\nAll platform tests passed');
process.exit(fail ? 1 : 0);
