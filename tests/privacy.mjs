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
// The one exception: progress photos are too big for localStorage, so photos.js keeps them in the browser's own
// on-device database (IndexedDB). It stores, it never sends: it has no fetch and no other way out (checked above).
const ALLOWED = { 'js/photos.js': ['indexedDB'] };
for (const f of files) {
  const text = read(f).replace(/\/\/.*$/gm, ''); // ignore comments
  for (const [re, label] of FORBIDDEN) if (!(ALLOWED[f] || []).includes(label)) check(`${f} does not use ${label}`, !re.test(text));
}
check('photos.js keeps photos only in its own local database', /DB_NAME = 'tickfit-photos'/.test(read('js/photos.js')) && !/\bfetch\(|navigator\.share|sendBeacon/.test(read('js/photos.js')));

// 2. fetch() is only used in the places we expect.
const FETCH_ALLOWED = { 'js/plans.js': 1, 'js/gemini.js': 1, 'js/claude.js': 1, 'js/lookup.js': 1, 'js/llm.js': 1, 'js/updater.js': 1, 'sw.js': 1 };
for (const f of files) {
  const n = (read(f).replace(/\/\/.*$/gm, '').match(/\bfetch\(/g) || []).length;
  check(`${f} fetch() calls: ${n} (allowed ${FETCH_ALLOWED[f] || 0})`, n === (FETCH_ALLOWED[f] || 0));
}
check('plans.js only fetches the bundled sample plan', /fetch\('data\/sample-plan\.json'\)/.test(read('js/plans.js')));
check('gemini.js only calls the Gemini API host', /generativelanguage\.googleapis\.com\/v1beta\/models\//.test(read('js/gemini.js')));
check('claude.js only calls the Anthropic Messages API', /ENDPOINT = 'https:\/\/api\.anthropic\.com\/v1\/messages'/.test(read('js/claude.js')));
check('llm.js only calls the four AI providers', (read('js/llm.js').match(/https:\/\/[a-z0-9.-]+/g) || []).every((u) => ['https://openrouter.ai', 'https://api.openai.com', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com', 'https://platform.openai.com', 'https://console.anthropic.com', 'https://docs.anthropic.com', 'https://aistudio.google.com', 'https://ai.google.dev'].includes(u)));
check('the assistant sends history only when allowed', /history \? \(|if \(history\)/.test(read('js/assistant.js')) && /historyAllowed\(\)/.test(read('js/assistantui.js')));
check('AI is off unless switched on (aiOn false wins over a saved key)', /if \(settings\.aiOn === false\) return false;/.test(read('js/llm.js')));
check('the assistant never applies a change by itself (applyAction only runs from the Apply buttons)', (read('js/assistantui.js').match(/applyAction\(/g) || []).length === 1 && /function doApply/.test(read('js/assistantui.js')));
check('aiassist.js never reads your history, weights or body log', !/\.progress|bodyLog|records|getRecord/.test(read('js/aiassist.js').replace(/\/\/.*$/gm, '')));
check('lookup.js only calls Open Food Facts', /FOOD_API = 'https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl'/.test(read('js/lookup.js')));
check('lookup.js refuses to go online unless the opt-in setting is on', /if \(!lookupEnabled\(\)\) return null;[\s\S]*fetch\(/.test(read('js/lookup.js')));
check('lookup.js sends only the food name in the URL', /search_terms=\$\{encodeURIComponent\(q\)\}/.test(read('js/lookup.js')) && !/getState\(\)\.(plans|progress|bodyLog)/.test(read('js/lookup.js')));
check('lookup.js barcode lookup only calls Open Food Facts', /BARCODE_API = 'https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/'/.test(read('js/lookup.js')));
check('lookup.js sends only the barcode digits', /const code = cleanBarcode\(text\);[\s\S]*\$\{BARCODE_API\}\$\{code\}\.json/.test(read('js/lookup.js')) && /\^\\d\{8,14\}\$/.test(read('js/lookup.js')));
check('lookup.js barcode lookup is opt-in too', /lookupBarcode\(text\) \{\n  if \(!lookupEnabled\(\)\) return null;/.test(read('js/lookup.js')));
check('steps.js only asks to READ steps, nothing else', /requestAuthorization\(\{ read: \['steps'\] \}\)/.test(read('js/steps.js')) && !/write:/.test(read('js/steps.js')) && !/dataType: '(?!steps')/.test(read('js/steps.js')));
check('the Android build keeps only the READ_STEPS health permission', /p !== 'android\.permission\.health\.READ_STEPS'/.test(read('android-app/scripts/customize.mjs')) && /tools:node="remove"/.test(read('android-app/scripts/customize.mjs')));
check('updater.js only asks GitHub for TickFit\'s latest release, with nothing about you', /RELEASES_API = 'https:\/\/api\.github\.com\/repos\/PredatorWoah\/TickFit\/releases\/latest'/.test(read('js/updater.js')) && /fetch\(RELEASES_API, \{ headers: \{ Accept: 'application\/vnd\.github\+json' \}, cache: 'no-store' \}\)/.test(read('js/updater.js')));
check('updater.js does nothing in a browser and can be switched off', /if \(!canUpdateInApp\(\)\) return null;/.test(read('js/updater.js')) && /settings\.updateCheck === false/.test(read('js/updater.js')));
check('the native updater only downloads TickFit release files and checks their SHA-256', /ALLOWED = "https:\/\/github\.com\/PredatorWoah\/TickFit\/releases\/download\/"/.test(read('android-app/native/java/TickFitUpdatePlugin.java')) && /MessageDigest\.getInstance\("SHA-256"\)/.test(read('android-app/native/java/TickFitUpdatePlugin.java')) && /did not match its fingerprint/.test(read('android-app/native/java/TickFitUpdatePlugin.java')));
check('sw.js only handles same-origin GET requests', /req\.method !== 'GET' \|\| url\.origin !== self\.location\.origin/.test(read('sw.js')));

// 3. Every website named in the code is on the allow list.
// predatorwoah.github.io is TickFit's own site: share.js only writes it into plan links, it never fetches anything (see 2).
const HOSTS = new Set(['api.anthropic.com', 'generativelanguage.googleapis.com', 'world.openfoodfacts.org', 'openrouter.ai', 'api.openai.com', 'api.github.com', 'platform.openai.com', 'console.anthropic.com', 'docs.anthropic.com', 'ai.google.dev', 'github.com', 'www.youtube.com', 'www.w3.org', 'aistudio.google.com', 'predatorwoah.github.io']);
for (const f of files) {
  const urls = [...read(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  const extra = [...new Set(urls)].filter((h) => !HOSTS.has(h));
  check(`${f} names no unexpected websites`, extra.length === 0, extra.join(', '));
}

// 4. The browser itself blocks everything else (Content Security Policy).
const csp = (read('index.html').match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || '';
check('CSP exists', csp.length > 0);
check("CSP: connect-src is only this site, the AI providers (Claude, Gemini, OpenRouter, OpenAI), Open Food Facts and GitHub's release info", /connect-src 'self' https:\/\/api\.anthropic\.com https:\/\/generativelanguage\.googleapis\.com https:\/\/world\.openfoodfacts\.org https:\/\/openrouter\.ai https:\/\/api\.openai\.com https:\/\/api\.github\.com(;|$)/.test(csp));
check("CSP: default-src is 'self'", /default-src 'self'/.test(csp));
check('CSP: forms cannot post anywhere', /form-action 'none'/.test(csp));
check('CSP: no plugins or objects', /object-src 'none'/.test(csp));
check('CSP: scripts only from this site', /script-src 'self'/.test(csp) && !/script-src[^;]*https?:/.test(csp));

// 5. Only the storage keys we know about are used, and the Gemini key stays out of backups.
const keys = new Set();
for (const f of files) for (const m of read(f).matchAll(/(?:KEY|KEY_STORE)\s*=\s*'([^']+)'|localStorage\.\w+Item\('([^']+)'/g)) keys.add(m[1] || m[2]);
check('only known localStorage keys are used', [...keys].every((k) => ['tickfit:v1', 'tickfit:gemini', 'tickfit:claude', 'tickfit:openrouter', 'tickfit:openai', 'tickfit:opencode'].includes(k)), [...keys].join(', '));
check('the old OpenCode key slot is only ever deleted', !/localStorage\.(get|set)Item\('tickfit:opencode'/.test(read('js/llm.js')) && /removeItem\('tickfit:opencode'\)/.test(read('js/llm.js')));
check('backups are built from the main state only (never the Gemini key)', /exportBackup\(\)\s*\{\s*return \{[^}]*data: state/.test(read('js/store.js').replace(/\n\s*/g, ' ')) && !/gemini/i.test(read('js/backup.js')));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
