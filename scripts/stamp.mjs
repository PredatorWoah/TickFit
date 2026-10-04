// scripts/stamp.mjs
// Runs ONLY when deploying (see .github/workflows/pages.yml). It stamps every file URL with the
// version of this deploy, so browsers cannot keep serving old files after an update.
//
// Why: GitHub Pages lets browsers keep each file for 10 minutes. After a deploy, a plain refresh could
// show the OLD app for up to 10 minutes, and some files could be old while others are new. A new
// ?v=abc1234 on every file URL makes every file a "new" file, so the update shows up straight away.
//
//   node scripts/stamp.mjs _site abc1234
//
// It changes: index.html (script and style links), the relative imports in js/*.js, and the offline
// cache name in sw.js. Your source files in the repo are never touched, only the copy in _site.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Stamp the text of index.html. */
export function stampHtml(text, v) {
  return text.replace(/((?:src|href)="(?:js|css)\/[^"?]+\.(?:js|css))"/g, `$1?v=${v}"`);
}

/** Stamp the relative imports in a JavaScript module: from './x.js' -> from './x.js?v=…' */
export function stampModule(text, v) {
  return text
    .replace(/(\bfrom\s+'\.{1,2}\/[^'?]+\.js)'/g, `$1?v=${v}'`)
    .replace(/(\bimport\s+'\.{1,2}\/[^'?]+\.js)'/g, `$1?v=${v}'`);
}

/** Give the service worker a cache name unique to this deploy, so old caches are dropped automatically. */
export function stampSw(text, v) {
  return text.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'tickfit-${v}';`);
}

export function stampSite(dir, v) {
  if (!/^[0-9a-zA-Z]{4,40}$/.test(v)) throw new Error(`Odd version "${v}"`);
  const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8'), v));
  edit(join(dir, 'index.html'), stampHtml);
  edit(join(dir, 'sw.js'), stampSw);
  for (const f of readdirSync(join(dir, 'js'))) if (f.endsWith('.js')) edit(join(dir, 'js', f), stampModule);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, version] = process.argv.slice(2);
  if (!dir || !version) {
    console.error('Usage: node scripts/stamp.mjs <site folder> <version>');
    process.exit(1);
  }
  stampSite(dir, version);
  console.log(`Stamped ${dir} with ${version}`);
}
