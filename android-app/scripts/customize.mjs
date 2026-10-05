// Tweaks the Android project that `npx cap add android` generated:
//   * version number and version code
//   * the vibrate permission (the rest timer buzzes)
//   * TickFit's launcher icon (normal, round and adaptive) and a dark launch screen
//
//   VERSION_NAME=1.0.0 VERSION_CODE=1 node scripts/customize.mjs
//
// Every edit checks that the text it wants to change is really there, so if a newer Capacitor changes its template
// the build fails loudly instead of quietly shipping an unconfigured app.

import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const res = resolve(here, '..', 'android', 'app', 'src', 'main', 'res');
const gradle = resolve(here, '..', 'android', 'app', 'build.gradle');
const manifest = resolve(here, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

const versionName = process.env.VERSION_NAME || '1.0.0';
const versionCode = parseInt(process.env.VERSION_CODE || '1', 10);
if (!/^[0-9A-Za-z.+-]{1,40}$/.test(versionName) || !(versionCode >= 1 && versionCode < 2100000000)) throw new Error('Odd VERSION_NAME or VERSION_CODE');

/** Replace text in a file and insist that the thing we are looking for was really there. */
function edit(file, from, to, label) {
  const text = readFileSync(file, 'utf8');
  const found = typeof from === 'string' ? text.includes(from) : from.test(text);
  if (!found) throw new Error(`Could not ${label} in ${file} (the Capacitor template may have changed)`);
  writeFileSync(file, text.replace(from, to));
}

// ----- version
edit(gradle, /versionCode\s+\d+/, `versionCode ${versionCode}`, 'set versionCode');
edit(gradle, /versionName\s+"[^"]*"/, `versionName "${versionName}"`, 'set versionName');

// ----- permissions
edit(manifest, '<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.VIBRATE" />', 'add the vibrate permission');

// ----- the web view: no stretchy overscroll (it drags the tab bar around) and no scroll bars
const mainActivity = resolve(here, '..', 'android', 'app', 'src', 'main', 'java', 'io', 'github', 'predatorwoah', 'tickfit', 'MainActivity.java');
edit(
  mainActivity,
  'public class MainActivity extends BridgeActivity {}',
  `public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() != null && getBridge().getWebView() != null) {
            android.webkit.WebView web = getBridge().getWebView();
            web.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
            web.setVerticalScrollBarEnabled(false);
            web.setHorizontalScrollBarEnabled(false);
        }
    }
}`,
  'turn off overscroll and scroll bars'
);

// ----- launcher icons: sizes in pixels for mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi
const BG = '#0a0d12';
const DENSITIES = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
const iconSvg = readFileSync(join(repo, 'icons', 'icon.svg'));
const maskableSvg = readFileSync(join(repo, 'icons', 'icon-maskable.svg'));
const circle = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

for (const [density, [legacy, adaptive]] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${density}`);
  const square = await sharp(iconSvg, { density: 300 }).resize(legacy, legacy).png().toBuffer();
  writeFileSync(join(dir, 'ic_launcher.png'), square);
  writeFileSync(join(dir, 'ic_launcher_round.png'), await sharp(square).composite([{ input: circle(legacy), blend: 'dest-in' }]).png().toBuffer());
  // The adaptive foreground is the artwork that already leaves room for Android's mask (the maskable icon).
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), await sharp(maskableSvg, { density: 300 }).resize(adaptive, adaptive).png().toBuffer());
}
edit(join(res, 'values', 'ic_launcher_background.xml'), /#[0-9A-Fa-f]{6}/, BG, 'set the icon background colour');

// ----- launch screen: plain dark instead of Capacitor's white default image
function removeSplashPngs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) removeSplashPngs(p);
    else if (name === 'splash.png') rmSync(p);
  }
}
removeSplashPngs(res);
mkdirSync(join(res, 'drawable'), { recursive: true });
writeFileSync(join(res, 'drawable', 'splash.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <solid android:color="${BG}" />\n</shape>\n`);

console.log(`Customized the Android project: TickFit ${versionName} (code ${versionCode})`);
