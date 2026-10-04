// Runs every test that needs no browser. Run: node tests/all.mjs
import { spawnSync } from 'node:child_process';

const files = ['tests/run.mjs', 'tests/stats.mjs', 'tests/schedule.mjs', 'tests/logging.mjs', 'tests/timer.mjs', 'tests/check-sw.mjs'];
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync('node', [f], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nAll tests passed.');
process.exit(failed ? 1 : 0);
