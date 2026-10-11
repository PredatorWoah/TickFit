// bento.mjs
// The home screen widgets come in the app's two looks. The Pulse layouts and drawables in android-app/native/res
// are the only ones written by hand; this makes the Bento twin of each one ("widget_ring" -> "widget_ring_bento"):
//
//   * every @color/tf_x becomes @color/tb_x  (the Bento palette, values/widget_colors_bento.xml)
//   * every @drawable/x becomes @drawable/x_bento
//   * big numbers use a monospace font instead of the condensed one (Bento's Space Mono feel)
//
// A drawable that already has a hand-written "_bento" file (the outlined blocks) is left alone.
// TickFitWidgets.java picks the Bento files by name when the person chose Bento in the app.
// Used by scripts/customize.mjs (writes them into the Android project) and tests/widgets-native.mjs (checks them).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const swap = (xml) =>
  xml
    .replace(/@color\/tf_(\w+)/g, '@color/tb_$1')
    .replace(/@drawable\/(\w+)/g, (m, name) => (name.endsWith('_bento') ? m : `@drawable/${name}_bento`))
    .replace(/android:fontFamily="sans-serif-condensed"/g, 'android:fontFamily="monospace"');

/**
 * @param resDir  android-app/native/res
 * @returns {{ path: string, text: string }[]}  paths relative to resDir, like "layout/widget_ring_bento.xml"
 */
export function bentoFiles(resDir) {
  const out = [];
  for (const folder of ['layout', 'drawable']) {
    const names = readdirSync(join(resDir, folder));
    for (const f of names) {
      if (!f.endsWith('.xml') || f.endsWith('_bento.xml')) continue;
      const twin = f.replace(/\.xml$/, '_bento.xml');
      if (names.includes(twin)) continue; // written by hand
      const text = readFileSync(join(resDir, folder, f), 'utf8');
      out.push({ path: `${folder}/${twin}`, text: swap(text).replace(/^(<\?xml[^>]*\?>\n)?/, `$1<!-- Made by android-app/scripts/bento.mjs from ${f}. -->\n`) });
    }
  }
  return out;
}
