// Keeps the <link rel="modulepreload"> list in index.html in step with the files the app really loads at startup.
// The startup files are everything app.js imports (directly or through other imports). The plan builder and the plan
// editor are loaded on demand on purpose, so they must NOT be in the list. Run: node tests/preload.mjs
import { readFileSync, existsSync } from 'node:fs';

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const staticImports = (f) => [...strip(readFileSync(`js/${f}`, 'utf8')).matchAll(/(?:from|import)\s+'\.\/([\w-]+\.js)'/g)].map((m) => m[1]);
const startup = new Set();
const walk = (f) => { if (startup.has(f)) return; startup.add(f); staticImports(f).forEach(walk); };
walk('app.js');
startup.delete('app.js'); // loaded by its own <script> tag

const html = readFileSync('index.html', 'utf8');
const listed = [...html.matchAll(/<link rel="modulepreload" href="js\/([\w-]+\.js)">/g)].map((m) => m[1]);

const missing = [...startup].filter((f) => !listed.includes(f));
const extra = listed.filter((f) => !startup.has(f));
check('every startup module is preloaded', missing.length === 0, 'missing: ' + missing.join(', '));
check('nothing extra is preloaded', extra.length === 0, 'extra: ' + extra.join(', '));
check('every preloaded file exists', listed.every((f) => existsSync(`js/${f}`)));
check('no file is listed twice', new Set(listed).size === listed.length);
for (const lazy of ['build.js', 'editor.js', 'builder.js', 'exercises.js', 'foods.js', 'pickui.js', 'library.js']) check(`${lazy} is loaded on demand, not at startup`, !startup.has(lazy) && !listed.includes(lazy));
check('app.js loads the builder and editor with import()', /import\('\.\/build\.js'\)/.test(readFileSync('js/app.js', 'utf8')) && /import\('\.\/editor\.js'\)/.test(readFileSync('js/app.js', 'utf8')));
console.log(fail ? `\n${fail} failed` : `\nAll preload tests passed (${listed.length} modules preloaded)`);
process.exit(fail ? 1 : 0);
