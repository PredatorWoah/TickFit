// The Android build scripts only run on GitHub, so a typo in one would only show up there. Check that every
// script at least parses. Run: node tests/scripts-syntax.mjs
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let fail = 0;
for (const dir of ['android-app/scripts', 'scripts']) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => /\.(m?js)$/.test(f));
  } catch {
    continue;
  }
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', `${dir}/${f}`], { encoding: 'utf8' });
    if (r.status !== 0) {
      fail++;
      console.log('FAIL', `${dir}/${f} does not parse:\n${r.stderr}`);
    } else console.log('ok  ', `${dir}/${f} parses`);
  }
}
console.log(fail ? `\n${fail} failed` : '\nAll build scripts parse');
process.exit(fail ? 1 : 0);
