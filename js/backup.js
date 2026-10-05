// backup.js
// Saving a backup file two ways: the phone's share sheet (save to Files, Drive, WhatsApp, email...)
// or a plain download. Either one counts as "backed up".

import { h } from './dom.js';
import { exportBackup, markBackedUp } from './store.js';
import { todayStr } from './dates.js';
import { cleanFilename } from './safety.js';
import { isNative, nativePlugin } from './platform.js';

/** The name we suggest: tickfit-backup-2026-10-05 (the person can change it). */
export const defaultBackupName = () => `tickfit-backup-${todayStr()}`;
const filename = (name) => cleanFilename(name, defaultBackupName());
const makeFile = (name) => new File([JSON.stringify(exportBackup(), null, 2)], filename(name), { type: 'application/json' });

/**
 * Android app: a WebView cannot download files, so write the backup into the app's cache folder and open
 * the phone's share sheet on it (the person picks Drive, Files, WhatsApp, email...). Returns false if cancelled.
 */
async function shareNative(name) {
  const Filesystem = nativePlugin('Filesystem');
  const Share = nativePlugin('Share');
  if (!Filesystem || !Share) throw new Error('The share sheet is not available');
  const written = await Filesystem.writeFile({ path: filename(name), data: JSON.stringify(exportBackup(), null, 2), directory: 'CACHE', encoding: 'utf8' });
  try {
    await Share.share({ title: 'TickFit backup', files: [written.uri], dialogTitle: 'Save your TickFit backup' });
    markBackedUp();
    return true;
  } catch (e) {
    if (/cancel/i.test(String((e && e.message) || e))) return false; // they closed the share sheet
    throw e;
  }
}

/** Can this browser (or the Android app) hand a file to the phone's share sheet? */
export function canShareFiles() {
  if (isNative()) return !!(nativePlugin('Filesystem') && nativePlugin('Share'));
  try {
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [makeFile()] }));
  } catch {
    return false;
  }
}

/** Download the backup as a file. */
export function saveBackupFile(name) {
  if (isNative()) return shareNative(name); // no downloads in the app, the share sheet does the saving
  const file = makeFile(name);
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  markBackedUp();
}

/** Open the share sheet. Returns true if the person shared it, false if they cancelled. */
export async function shareBackupFile(name) {
  if (isNative()) return shareNative(name);
  try {
    await navigator.share({ files: [makeFile(name)], title: 'TickFit backup' });
    markBackedUp();
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false; // they closed the share sheet
    throw e;
  }
}

/** Desktop Chrome and Edge can save to a place you pick, and replace a file that is already there. Phones cannot. */
export const canOverwrite = () => typeof window.showSaveFilePicker === 'function';

/** Opens the "save as" picker (it asks before replacing an existing file). Returns false if cancelled. */
export async function saveOverExisting(name) {
  const file = makeFile(name);
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: file.name, types: [{ description: 'TickFit backup', accept: { 'application/json': ['.json'] } }] });
    const out = await handle.createWritable();
    await out.write(file);
    await out.close();
    markBackedUp();
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
    throw e;
  }
}
