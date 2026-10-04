// Tests for backup reminders. Run: node tests/safety.mjs
import { loggedDayCount, daysSinceBackup, nudgeDue, describeBackupAge, snoozeDate, backupStale, cleanFilename } from '../js/safety.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const progress = {
  p1: { '2026-09-01': { ticks: { w1: true } }, '2026-09-02': { ticks: {}, sets: {} }, '2026-09-03': { sets: { w1: [{ done: true }] } }, '2026-09-04': { waterMl: 500 }, '2026-09-05': { notes: '  ' }, '2026-09-06': { notes: 'felt good' } },
  p2: { '2026-09-01': { ticks: { m1: true } }, '2026-09-07': { sets: { w1: [{ done: false }] } } },
};
eq('logged days: counts ticks, done sets, water, notes; same date across plans once', loggedDayCount(progress), 4);
eq('logged days: empty', loggedDayCount({}), 0);
eq('logged days: undefined', loggedDayCount(undefined), 0);

eq('days since: never', daysSinceBackup(null, '2026-10-04'), null);
eq('days since: 5', daysSinceBackup('2026-09-29', '2026-10-04'), 5);
eq('days since: same day', daysSinceBackup('2026-10-04', '2026-10-04'), 0);
eq('days since: clock went backwards is 0', daysSinceBackup('2026-10-10', '2026-10-04'), 0);

const T = '2026-10-04';
eq('no nudge when nothing is logged', nudgeDue({ loggedDays: 0, lastBackup: null, snoozeUntil: null }, T), false);
eq('nudge when never backed up', nudgeDue({ loggedDays: 1, lastBackup: null, snoozeUntil: null }, T), true);
eq('no nudge after a backup today', nudgeDue({ loggedDays: 30, lastBackup: '2026-10-04', snoozeUntil: null }, T), false);
eq('nudge the day after a backup (daily)', nudgeDue({ loggedDays: 30, lastBackup: '2026-10-03', snoozeUntil: null }, T), true);
eq('snoozed today: no nudge', nudgeDue({ loggedDays: 30, lastBackup: null, snoozeUntil: T }, T), false);
eq('snooze ends tomorrow', nudgeDue({ loggedDays: 30, lastBackup: null, snoozeUntil: T }, '2026-10-05'), true);
eq('snooze lasts the rest of today', snoozeDate('2026-10-04'), '2026-10-04');
eq('stale: never backed up with progress', backupStale({ loggedDays: 2, lastBackup: null }, T), true);
eq('stale: 2 days old is fine', backupStale({ loggedDays: 2, lastBackup: '2026-10-02' }, T), false);
eq('stale: 3 days old', backupStale({ loggedDays: 2, lastBackup: '2026-10-01' }, T), true);
eq('stale: nothing to lose', backupStale({ loggedDays: 0, lastBackup: null }, T), false);

eq('filename: plain', cleanFilename('my backup', 'x'), 'my backup.json');
eq('filename: strips .json and slashes', cleanFilename('../a/b:c*.JSON', 'x'), 'abc.json');
eq('filename: empty falls back', cleanFilename('   ', 'tickfit-backup'), 'tickfit-backup.json');
eq('filename: only illegal chars falls back', cleanFilename('///', 'fb'), 'fb.json');
eq('filename: long names are cut', cleanFilename('a'.repeat(200), 'x').length, 65);
eq('filename: leading dots removed', cleanFilename('...hidden', 'x'), 'hidden.json');

eq('describe never', describeBackupAge(null, T), 'never');
eq('describe today', describeBackupAge('2026-10-04', T), 'today');
eq('describe yesterday', describeBackupAge('2026-10-03', T), 'yesterday');
eq('describe 12 days', describeBackupAge('2026-09-22', T), '12 days ago');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
