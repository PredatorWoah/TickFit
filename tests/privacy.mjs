// Privacy guard. Run: node tests/privacy.mjs
// TickFit promises that your data never leaves your device. This test makes that promise hard to
// break by accident: it fails if the code starts using ways to send data somewhere, or talks to a
// website that isn't on the short list below.

import { readFileSync, readdirSync } from 'node:fs';

const files = ['sw.js', 'index.html', ...readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
const read = (f) => readFileSync(f, 'utf8');

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
};

// 1. APIs that can send data out (or share it between tabs, devices or sites) are not used at all.
const FORBIDDEN = [
  [/XMLHttpRequest/, 'XMLHttpRequest'], [/sendBeacon/, 'sendBeacon'], [/new\s+WebSocket/, 'WebSocket'], [/EventSource/, 'EventSource'],
  [/BroadcastChannel/, 'BroadcastChannel'], [/indexedDB/, 'indexedDB'], [/document\.cookie/, 'cookies'], [/<iframe/i, 'iframe'],
  [/importScripts/, 'importScripts'], [/navigator\.geolocation/, 'geolocation'], [/\.postMessage\(/, 'postMessage'], [/WebRTC|RTCPeerConnection/, 'WebRTC'],
];
for (const f of files) {
  const text = read(f).replace(/\/\/.*$/gm, ''); // ignore comments
  for (const [re, label] of FORBIDDEN) check(`${f} does not use ${label}`, !re.test(text));
}

// 2. fetch() is only used in the four places we expect.
const FETCH_ALLOWED = { 'js/plans.js': 1, 'js/gemini.js': 1, 'js/lookup.js': 1, 'sw.js': 1 };
for (const f of files) {
  const n = (read(f).replace(/\/\/.*$/gm, '').match(/\bfetch\(/g) || []).length;
  check(`${f} fetch() calls: ${n} (allowed ${FETCH_ALLOWED[f] || 0})`, n === (FETCH_ALLOWED[f] || 0));
}
check('plans.js only fetches the bundled sample plan', /fetch\('data\/sample-plan\.json'\)/.test(read('js/plans.js')));
check('gemini.js only calls the Gemini API host', /generativelanguage\.googleapis\.com\/v1beta\/models\//.test(read('js/gemini.js')));
check('lookup.js only calls Open Food Facts', /FOOD_API = 'https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl'/.test(read('js/lookup.js')));
check('lookup.js refuses to go online unless the opt-in setting is on', /if \(!lookupEnabled\(\)\) return null;[\s\S]*fetch\(/.test(read('js/lookup.js')));
check('lookup.js sends only the food name in the URL', /search_terms=\$\{encodeURIComponent\(q\)\}/.test(read('js/lookup.js')) && !/getState\(\)\.(plans|progress|bodyLog)/.test(read('js/lookup.js')));
check('sw.js only handles same-origin GET requests', /req\.method !== 'GET' \|\| url\.origin !== self\.location\.origin/.test(read('sw.js')));

// 3. Every website named in the code is on the allow list.
const HOSTS = new Set(['generativelanguage.googleapis.com', 'world.openfoodfacts.org', 'www.youtube.com', 'www.w3.org', 'aistudio.google.com']);
for (const f of files) {
  const urls = [...read(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  const extra = [...new Set(urls)].filter((h) => !HOSTS.has(h));
  check(`${f} names no unexpected websites`, extra.length === 0, extra.join(', '));
}

// 4. The browser itself blocks everything else (Content Security Policy).
const csp = (read('index.html').match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || '';
check('CSP exists', csp.length > 0);
check("CSP: connect-src is only this site, the Gemini API and Open Food Facts", /connect-src 'self' https:\/\/generativelanguage\.googleapis\.com https:\/\/world\.openfoodfacts\.org(;|$)/.test(csp));
check("CSP: default-src is 'self'", /default-src 'self'/.test(csp));
check('CSP: forms cannot post anywhere', /form-action 'none'/.test(csp));
check('CSP: no plugins or objects', /object-src 'none'/.test(csp));
check('CSP: scripts only from this site', /script-src 'self'/.test(csp) && !/script-src[^;]*https?:/.test(csp));

// 5. Only the storage keys we know about are used, and the Gemini key stays out of backups.
const keys = new Set();
for (const f of files) for (const m of read(f).matchAll(/(?:KEY|KEY_STORE)\s*=\s*'([^']+)'|localStorage\.\w+Item\('([^']+)'/g)) keys.add(m[1] || m[2]);
check('only known localStorage keys are used', [...keys].every((k) => ['tickfit:v1', 'tickfit:gemini'].includes(k)), [...keys].join(', '));
check('backups are built from the main state only (never the Gemini key)', /exportBackup\(\)\s*\{\s*return \{[^}]*data: state/.test(read('js/store.js').replace(/\n\s*/g, ' ')) && !/gemini/i.test(read('js/backup.js')));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
