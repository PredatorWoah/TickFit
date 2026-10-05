// Tests for the Back button logic. Run: node tests/backnav.mjs
import { backTarget } from '../js/backnav.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', m, ok ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); };
const T = '2026-10-05';

eq('Today on today leaves the app', backTarget('today', T, T), null);
eq('welcome screen leaves the app', backTarget('welcome', undefined, T), null);
eq('Today on another day goes to today first', backTarget('today', '2026-10-01', T), { screen: 'today', date: T });
for (const tab of ['workout', 'meals', 'progress', 'more']) eq(`${tab} goes to Today`, backTarget(tab, T, T), { screen: 'today' });
eq('Plans goes back to More', backTarget('plans', T, T), { screen: 'more' });
eq('New plan goes back to Plans', backTarget('new', T, T), { screen: 'plans' });
eq('Import goes back to New plan', backTarget('import', T, T), { screen: 'new' });
eq('Build goes back to New plan', backTarget('build', T, T), { screen: 'new' });
eq('Plan editor goes back to Plans', backTarget('edit', T, T), { screen: 'plans' });
// from any screen, repeated Back always ends up leaving the app (no loops)
for (const start of ['workout', 'meals', 'progress', 'more', 'plans', 'new', 'import', 'build', 'edit', 'today']) {
  let screen = start, date = start === 'today' ? '2026-09-01' : T, steps = 0;
  for (; steps < 10; steps++) { const t = backTarget(screen, date, T); if (!t) break; screen = t.screen; if (t.date) date = t.date; }
  eq(`from ${start}, Back eventually leaves the app (${steps} steps)`, steps < 10, true);
}
console.log(fail ? `\n${fail} failed` : '\nAll back-button tests passed');
process.exit(fail ? 1 : 0);
