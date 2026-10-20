// Checks that every app file is listed in sw.js (so it works offline) and that listed files exist.
// Run: node tests/check-sw.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const sw = readFileSync('sw.js', 'utf8');
const listed = [...sw.matchAll(/^\s+'([^']+)',?$/gm)].map((m) => m[1]).filter((f) => f !== './');

const folders = { css: /\.css$/, js: /\.js$/, data: /\.json$/, icons: /\.(png|svg)$/, fonts: /\.woff2$/ };  // vendor/ is cached on first use, see sw.js
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
// Every file the service worker caches must also be published to GitHub Pages: one missing folder (fonts/ in
// 2.0 to 2.3) made every install of the website's service worker fail, and the site lost its fonts.
const pagesCopy = ((readFileSync('.github/workflows/pages.yml', 'utf8').match(/cp -r ([^\n]+) _site\//) || [])[1] || '').split(/\s+/);
if (!pagesCopy.length || !pagesCopy[0]) {
  console.log('Could not find the copy step in .github/workflows/pages.yml');
  bad++;
}
for (const f of listed) if (!pagesCopy.includes(f) && !pagesCopy.includes(f.split('/')[0])) { console.log('CACHED by sw.js but not published by pages.yml:', f); bad++; }
console.log(bad ? `${bad} problem(s)` : `sw.js file list OK (${listed.length} files), and pages.yml publishes all of them`);
process.exit(bad ? 1 : 0);
