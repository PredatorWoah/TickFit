// backup.js
// Saving a backup file two ways: the phone's share sheet (save to Files, Drive, WhatsApp, email...)
// or a plain download. Either one counts as "backed up".

import { h } from './dom.js';
import { exportBackup, markBackedUp } from './store.js';
import { todayStr } from './dates.js';

const filename = () => `tickfit-backup-${todayStr()}.json`;
const makeFile = () => new File([JSON.stringify(exportBackup(), null, 2)], filename(), { type: 'application/json' });

/** Can this browser hand a file to the phone's share sheet? */
export function canShareFiles() {
  try {
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [makeFile()] }));
  } catch {
    return false;
  }
}

/** Download the backup as a file. */
export function saveBackupFile() {
  const url = URL.createObjectURL(makeFile());
  const a = h('a', { href: url, download: filename() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  markBackedUp();
}

/** Open the share sheet. Returns true if the person shared it, false if they cancelled. */
export async function shareBackupFile() {
  try {
    await navigator.share({ files: [makeFile()], title: 'TickFit backup' });
    markBackedUp();
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false; // they closed the share sheet
    throw e;
  }
}
