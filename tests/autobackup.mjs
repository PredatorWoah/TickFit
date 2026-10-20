// The Android app's daily automatic backup: which old files go, and when the reminder can rest.
// Run: node tests/autobackup.mjs
import { oldAutoBackups, backupCovered } from '../js/autobackup.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

const days = Array.from({ length: 10 }, (_, i) => `tickfit-auto-2026-10-${String(11 + i).padStart(2, '0')}.json`);
const gone = oldAutoBackups([...days, 'my-own-backup.json', 'notes.txt']);
ok(gone.length === 3 && gone.every((n) => n < 'tickfit-auto-2026-10-14.json'), 'keeps the newest 7 automatic backups and deletes the 3 oldest: ' + gone.join(', '));
ok(!gone.includes('my-own-backup.json') && !gone.includes('notes.txt'), 'never touches files it did not make');
ok(oldAutoBackups(days.slice(0, 5)).length === 0, 'nothing to delete with 5 or fewer');

const today = '2026-10-20';
ok(backupCovered({ lastAutoBackup: today, lastBackup: '2026-10-15' }, today, true), 'saved today in the app + a copy elsewhere this week: no daily reminder');
ok(!backupCovered({ lastAutoBackup: today, lastBackup: '2026-10-10' }, today, true), 'the copy elsewhere is over a week old: remind again');
ok(!backupCovered({ lastAutoBackup: today, lastBackup: null }, today, true), 'never copied anywhere else: remind');
ok(!backupCovered({ lastAutoBackup: '2026-10-19', lastBackup: '2026-10-19' }, today, true), 'the automatic one did not run today: normal reminders');
ok(!backupCovered({ lastAutoBackup: today, lastBackup: '2026-10-19', autoBackup: false }, today, true), 'switched off: normal reminders');
ok(!backupCovered({ lastAutoBackup: today, lastBackup: '2026-10-19' }, today, false), 'in a browser it never applies');

console.log(fail ? `\n${fail} failed` : '\nAll automatic backup tests passed');
process.exit(fail ? 1 : 0);
