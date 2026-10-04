// Checks that every app file is listed in sw.js (so it works offline) and that listed files exist.
// Run: node tests/check-sw.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const sw = readFileSync('sw.js', 'utf8');
const listed = [...sw.matchAll(/^\s+'([^']+)',?$/gm)].map((m) => m[1]).filter((f) => f !== './');

const folders = { css: /\.css$/, js: /\.js$/, data: /\.json$/, icons: /\.(png|svg)$/, vendor: /./ };
const found = ['index.html', 'manifest.webmanifest'];
for (const [dir, re] of Object.entries(folders)) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir, { recursive: true })) if (re.test(f) && !/\/$/.test(f)) found.push(`${dir}/${f}`);
}

let bad = 0;
// icon-maskable.svg is only the source for a PNG, so it does not need caching.
const ignore = new Set(['icons/icon-maskable.svg']);
for (const f of found) if (!listed.includes(f) && !ignore.has(f) && existsSync(f) && !readdirSync('.', { withFileTypes: true }).some((d) => d.name === f && d.isDirectory())) { console.log('MISSING from sw.js:', f); bad++; }
for (const f of listed) if (!existsSync(f)) { console.log('LISTED but does not exist:', f); bad++; }
console.log(bad ? `${bad} problem(s)` : `sw.js file list OK (${listed.length} files)`);
process.exit(bad ? 1 : 0);
