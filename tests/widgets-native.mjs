// The Android widgets' native files (android-app/native) can't be compiled here without the Android SDK, so this
// checks what usually breaks: every R.id / R.layout / R.drawable / R.color the Java code uses exists, every
// @drawable / @color / @string an XML file names exists, light and dark colours match, the XML is well formed,
// and each widget class has a layout, provider info and manifest entry. Run: node tests/widgets-native.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bentoFiles } from '../android-app/scripts/bento.mjs';

const N = 'android-app/native';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const files = (dir) => readdirSync(join(N, dir)).map((f) => join(N, dir, f));
const names = (dir) => new Set(readdirSync(join(N, dir)).map((f) => f.replace(/\.xml$/, '')));
const java = files('java').map((f) => readFileSync(f, 'utf8')).join('\n');
const ids = new Set();
for (const f of files('res/layout')) for (const m of readFileSync(f, 'utf8').matchAll(/@\+id\/(\w+)/g)) ids.add(m[1]);
const valueNames = (f) => new Set([...readFileSync(join(N, f), 'utf8').matchAll(/name="(\w+)"/g)].map((m) => m[1]));
const pulse = valueNames('res/values/widget_colors.xml');
const pulseNight = valueNames('res/values-night/widget_colors.xml');
const bentoColors = valueNames('res/values/widget_colors_bento.xml');
const bentoNight = valueNames('res/values-night/widget_colors_bento.xml');
const colors = new Set([...pulse, ...bentoColors]);
const night = new Set([...pulseNight, ...bentoNight]);
// The Bento look's layouts and drawables are made at build time (android-app/scripts/bento.mjs); check them too
const generated = bentoFiles(join(N, 'res'));
const genNames = (folder) => generated.filter((g) => g.path.startsWith(folder + '/')).map((g) => g.path.slice(folder.length + 1).replace(/\.xml$/, ''));
const strings = valueNames('res/values/widget_strings.xml');
const pools = { id: ids, layout: new Set([...names('res/layout'), ...genNames('layout')]), drawable: new Set([...names('res/drawable'), ...genNames('drawable')]), color: colors, string: strings, xml: new Set([...names('res/xml'), ...genNames('xml')]) };

const missingJava = [...java.matchAll(/R\.(id|layout|drawable|color|string)\.(\w+)/g)].filter(([, k, n]) => !pools[k].has(n)).map(([x]) => x);
ok(missingJava.length === 0, 'every R.* the Java code uses exists ' + missingJava.join(' '));
const allXml = ['res/values', 'res/values-night', 'res/drawable', 'res/layout', 'res/xml'].flatMap(files);
const xmlText = (f) => (f.startsWith('generated:') ? generated.find((g) => 'generated:' + g.path === f).text : readFileSync(f, 'utf8'));
allXml.push(...generated.map((g) => 'generated:' + g.path));
const missingXml = allXml.flatMap((f) => [...xmlText(f).matchAll(/@(drawable|color|layout|string|xml)\/(\w+)/g)].filter(([, k, n]) => !pools[k].has(n)).map(([x]) => `${x} in ${f}`));
ok(missingXml.length === 0, 'every @resource the XML names exists ' + missingXml.join(' '));
ok([...colors].every((c) => night.has(c)) && [...night].every((c) => colors.has(c)), 'light and dark themes define the same colours');
ok([...pulse].every((c) => bentoColors.has('tb_' + c.slice(3))) && [...bentoColors].every((c) => pulse.has('tf_' + c.slice(3))), 'Pulse (tf_) and Bento (tb_) define the same colours');
ok(generated.some((g) => g.path === 'layout/widget_today_bento.xml') && generated.every((g) => !/@color\/tf_/.test(g.text)), 'every widget layout gets a Bento twin, with no Pulse colours left in it');
ok(/views\(c, s, R\.layout\./.test(java) && !/new RemoteViews\(c\.getPackageName\(\), R\.layout\.widget_(?!message)/.test(java), 'every widget picks its layout through the look (views())');

// Well formed enough: every opening tag closes (a tiny stack check, comments and declarations skipped).
for (const f of allXml) {
  const text = xmlText(f).replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '');
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
const PULSE = [['Ring', 'ring'], ['Today', 'today'], ['NextUp', 'nextup'], ['Water', 'water'], ['Week', 'week'], ['Lifted', 'lifted']];
for (const [cls, key] of [...PULSE, ...PULSE.map(([c, k]) => [c + 'Bento', k + '_bento'])]) {
  const bentoOne = cls.endsWith('Bento');
  ok(new RegExp(`public static class ${cls} extends ${bentoOne ? cls.replace(/Bento$/, '') : 'Base'}`).test(java), `${cls} widget class exists`);
  ok(new RegExp(`\\b${cls}\\.class`).test(java), `${cls} is redrawn with the others`);
  if (bentoOne) ok(new RegExp(`class ${cls} extends \\w+ \\{\\s*@Override\\s*boolean bentoLook\\(\\) \\{\\s*return true;`).test(java), `${cls} draws in the Bento look`);
  ok(pools.layout.has(`widget_${key}`) && pools.xml.has(`widget_${key}_info`) && strings.has(`tf_w_${key}`) && strings.has(`tf_w_${key}_desc`), `${cls} has a layout, provider info, label and description`);
  ok(customize.includes(`['${cls}', '${key}']`), `${cls} is added to the manifest`);
}
ok(/registerPlugin\(TickFitWidgetPlugin\.class\)/.test(customize), 'the widget plugin is registered in MainActivity');
ok(/@CapacitorPlugin\(name = "TickFitWidget"\)/.test(java) && /nativePlugin\('TickFitWidget'\)/.test(readFileSync('js/widgets.js', 'utf8')), 'plugin name matches on both sides');
ok(/PendingIntent\.FLAG_IMMUTABLE/.test(java) && !/FLAG_MUTABLE/.test(java), 'widget taps use immutable PendingIntents');

console.log(fail ? `\n${fail} failed` : '\nAll native widget checks passed');
process.exit(fail ? 1 : 0);
