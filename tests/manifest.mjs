// Checks the web app manifest has what Chrome, Android and the Play/APK tools need. Run: node tests/manifest.mjs
import { readFileSync, existsSync } from 'node:fs';

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };
const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));

check('has a name and short name', !!m.name && !!m.short_name && m.short_name.length <= 12);
check('has a stable id', typeof m.id === 'string' && m.id.length > 0);
check('start_url and scope are relative (work under /TickFit/ and at a domain root)', m.start_url === './' && m.scope === './');
check('opens like an app (standalone)', m.display === 'standalone');
check('colours are set', /^#[0-9a-f]{6}$/i.test(m.theme_color) && /^#[0-9a-f]{6}$/i.test(m.background_color));
check('has categories for app stores', Array.isArray(m.categories) && m.categories.includes('fitness'));
const sizes = (m.icons || []).map((i) => `${i.sizes}:${i.purpose}`);
check('has a 192 icon, a 512 icon and a maskable icon', sizes.includes('192x192:any') && sizes.includes('512x512:any') && sizes.some((s) => /maskable/.test(s)), sizes.join());
check('every icon file exists', (m.icons || []).every((i) => existsSync(i.src)), (m.icons || []).filter((i) => !existsSync(i.src)).map((i) => i.src).join());
console.log(fail ? `\n${fail} failed` : '\nAll manifest tests passed');
process.exit(fail ? 1 : 0);
