// Runs every test that needs no browser. Run: node tests/all.mjs
import { spawnSync } from 'node:child_process';

const files = ['tests/run.mjs', 'tests/stats.mjs', 'tests/schedule.mjs', 'tests/logging.mjs', 'tests/summary.mjs', 'tests/lift.mjs', 'tests/library.mjs', 'tests/merge.mjs', 'tests/widgetdata.mjs', 'tests/widgets-native.mjs', 'tests/burn.mjs', 'tests/weight.mjs', 'tests/estimate.mjs', 'tests/lookup.mjs', 'tests/stamp.mjs', 'tests/preload.mjs', 'tests/notes.mjs', 'tests/manifest.mjs', 'tests/platform.mjs', 'tests/backnav.mjs', 'tests/safety.mjs', 'tests/builder.mjs', 'tests/privacy.mjs', 'tests/timer.mjs', 'tests/check-sw.mjs'];
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync('node', [f], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nAll tests passed.');
process.exit(failed ? 1 : 0);
