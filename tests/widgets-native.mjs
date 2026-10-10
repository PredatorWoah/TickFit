// The Android widgets' native files (android-app/native) can't be compiled here without the Android SDK, so this
// checks what usually breaks: every R.id / R.layout / R.drawable / R.color the Java code uses exists, every
// @drawable / @color / @string an XML file names exists, light and dark colours match, the XML is well formed,
// and each widget class has a layout, provider info and manifest entry. Run: node tests/widgets-native.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const N = 'android-app/native';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const files = (dir) => readdirSync(join(N, dir)).map((f) => join(N, dir, f));
const names = (dir) => new Set(readdirSync(join(N, dir)).map((f) => f.replace(/\.xml$/, '')));
const java = files('java').map((f) => readFileSync(f, 'utf8')).join('\n');
const ids = new Set();
for (const f of files('res/layout')) for (const m of readFileSync(f, 'utf8').matchAll(/@\+id\/(\w+)/g)) ids.add(m[1]);
const valueNames = (f) => new Set([...readFileSync(join(N, f), 'utf8').matchAll(/name="(\w+)"/g)].map((m) => m[1]));
const colors = valueNames('res/values/widget_colors.xml');
const night = valueNames('res/values-night/widget_colors.xml');
const strings = valueNames('res/values/widget_strings.xml');
const pools = { id: ids, layout: names('res/layout'), drawable: names('res/drawable'), color: colors, string: strings, xml: names('res/xml') };

const missingJava = [...java.matchAll(/R\.(id|layout|drawable|color|string)\.(\w+)/g)].filter(([, k, n]) => !pools[k].has(n)).map(([x]) => x);
ok(missingJava.length === 0, 'every R.* the Java code uses exists ' + missingJava.join(' '));
const allXml = ['res/values', 'res/values-night', 'res/drawable', 'res/layout', 'res/xml'].flatMap(files);
const missingXml = allXml.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/@(drawable|color|layout|string|xml)\/(\w+)/g)].filter(([, k, n]) => !pools[k].has(n)).map(([x]) => `${x} in ${f}`));
ok(missingXml.length === 0, 'every @resource the XML names exists ' + missingXml.join(' '));
ok([...colors].every((c) => night.has(c)) && [...night].every((c) => colors.has(c)), 'light and dark themes define the same colours');

// Well formed enough: every opening tag closes (a tiny stack check, comments and declarations skipped).
for (const f of allXml) {
  const text = readFileSync(f, 'utf8').replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '');
  const stack = [];
  let good = true;
  for (const [, close, name, self] of text.matchAll(/<(\/?)([\w:-]+)[^>]*?(\/?)>/g)) {
    if (self) continue;
    if (!close) stack.push(name);
    else if (stack.pop() !== name) good = false;
  }
  ok(good && stack.length === 0, `${f} is well formed`);
}

const customize = readFileSync('android-app/scripts/customize.mjs', 'utf8');
for (const [cls, key] of [['Ring', 'ring'], ['Today', 'today'], ['NextUp', 'nextup'], ['Water', 'water'], ['Week', 'week'], ['Lifted', 'lifted']]) {
  ok(new RegExp(`public static class ${cls} extends Base`).test(java), `${cls} widget class exists`);
  ok(pools.layout.has(`widget_${key}`) && pools.xml.has(`widget_${key}_info`) && strings.has(`tf_w_${key}`) && strings.has(`tf_w_${key}_desc`), `${cls} has a layout, provider info, label and description`);
  ok(customize.includes(`['${cls}', '${key}']`), `${cls} is added to the manifest`);
}
ok(/registerPlugin\(TickFitWidgetPlugin\.class\)/.test(customize), 'the widget plugin is registered in MainActivity');
ok(/@CapacitorPlugin\(name = "TickFitWidget"\)/.test(java) && /nativePlugin\('TickFitWidget'\)/.test(readFileSync('js/widgets.js', 'utf8')), 'plugin name matches on both sides');
ok(/PendingIntent\.FLAG_IMMUTABLE/.test(java) && !/FLAG_MUTABLE/.test(java), 'widget taps use immutable PendingIntents');

console.log(fail ? `\n${fail} failed` : '\nAll native widget checks passed');
process.exit(fail ? 1 : 0);
