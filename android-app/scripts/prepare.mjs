// Copies the TickFit web app into android-app/www, ready to be packed into the Android app.
//   VERSION_NAME=1.0.0 node scripts/prepare.mjs
// Only the files the app needs go in. There is no service worker in the Android app (every file is
// already on the phone), so sw.js is left out.

import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const www = resolve(here, '..', 'www');
const version = process.env.VERSION_NAME || 'dev';
if (!/^[0-9A-Za-z.+-]{1,40}$/.test(version)) throw new Error(`Odd version name "${version}"`);

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'css', 'js', 'data', 'icons', 'vendor']) cpSync(join(repo, f), join(www, f), { recursive: true });

// Tell the app which version of the Android app it is (shown on the More screen).
const file = join(www, 'js', 'platform.js');
const before = readFileSync(file, 'utf8');
const after = before.replace('export const NATIVE_VERSION = null;', `export const NATIVE_VERSION = '${version}';`);
if (after === before) throw new Error('Could not set the app version in js/platform.js');
writeFileSync(file, after);
console.log(`Prepared ${www} for TickFit ${version}`);
