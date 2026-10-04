// Tests for the deploy-time URL stamping. Run: node tests/stamp.mjs
import { stampHtml, stampModule, stampSw, stampSite } from '../scripts/stamp.mjs';
import { cpSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', m, ok ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); };

eq('module: named import', stampModule("import { h } from './dom.js';", 'abc1234'), "import { h } from './dom.js?v=abc1234';");
eq('module: parent import', stampModule("import { x } from '../a/b.js';", 'v1'), "import { x } from '../a/b.js?v=v1';");
eq('module: side-effect import', stampModule("import './theme.js';", 'v1'), "import './theme.js?v=v1';");
eq('module: already stamped is left alone', stampModule("import { h } from './dom.js?v=old';", 'v1'), "import { h } from './dom.js?v=old';");
eq('module: dynamic import of a vendor file is left alone', stampModule("await import('../vendor/pdfjs/pdf.min.mjs');", 'v1'), "await import('../vendor/pdfjs/pdf.min.mjs');");
eq('module: bare/URL imports are left alone', stampModule("import x from 'https://a.b/c.js';", 'v1'), "import x from 'https://a.b/c.js';");
eq('html: script, module and css', stampHtml('<script src="js/theme-boot.js"></script><link href="css/styles.css"><script type="module" src="js/app.js"></script>', 'v1'),
  '<script src="js/theme-boot.js?v=v1"></script><link href="css/styles.css?v=v1"><script type="module" src="js/app.js?v=v1"></script>');
eq('html: icons and manifest are left alone', stampHtml('<link rel="manifest" href="manifest.webmanifest"><link href="icons/icon.svg">', 'v1'), '<link rel="manifest" href="manifest.webmanifest"><link href="icons/icon.svg">');
eq('sw: cache name', stampSw("const CACHE_VERSION = 'tickfit-v10';", 'abc1234'), "const CACHE_VERSION = 'tickfit-abc1234';");

// Stamp a copy of the real site and check nothing was missed.
const dir = mkdtempSync(join(tmpdir(), 'tickfit-'));
for (const f of ['index.html', 'sw.js', 'js']) cpSync(f, join(dir, f), { recursive: true });
stampSite(dir, 'abc1234');
const unstamped = [];
for (const f of readdirSync(join(dir, 'js'))) {
  const text = readFileSync(join(dir, 'js', f), 'utf8').replace(/\/\/.*$/gm, '');
  for (const m of text.matchAll(/\bfrom\s+'(\.{1,2}\/[^']+)'|\bimport\s+'(\.{1,2}\/[^']+)'/g)) if (!/\?v=abc1234$/.test(m[1] || m[2])) unstamped.push(`${f}: ${m[1] || m[2]}`);
}
eq('every relative import in the real site is stamped', unstamped, []);
eq('real index.html links are stamped', (readFileSync(join(dir, 'index.html'), 'utf8').match(/\?v=abc1234/g) || []).length, 3);
eq('real sw.js has the deploy cache name', /const CACHE_VERSION = 'tickfit-abc1234';/.test(readFileSync(join(dir, 'sw.js'), 'utf8')), true);
let threw = false; try { stampSite(dir, "x'; evil()"); } catch { threw = true; }
eq('an odd version string is refused', threw, true);

console.log(fail ? `\n${fail} failed` : '\nAll stamp tests passed');
process.exit(fail ? 1 : 0);
