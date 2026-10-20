// backup.js
// Saving a backup file two ways: the phone's share sheet (save to Files, Drive, WhatsApp, email...)
// or a plain download. Either one counts as "backed up". The file can also carry the progress photos.
//
// The file's text is made first (prepareBackup, it is asynchronous because of the photos), then saved: phones
// only open the share sheet straight after a tap, so the text must be ready before the button is pressed.

import { h } from './dom.js';
import { exportBackup, markBackedUp } from './store.js';
import { todayStr } from './dates.js';
import { cleanFilename } from './safety.js';
import { isNative, nativePlugin } from './platform.js';
import { photosForBackup } from './photos.js';

/** The name we suggest: tickfit-backup-2026-10-05 (the person can change it). */
export const defaultBackupName = () => `tickfit-backup-${todayStr()}`;
const filename = (name) => cleanFilename(name, defaultBackupName());
const makeFile = (name, text) => new File([text], filename(name), { type: 'application/json' });

/** The backup file's text. With photos it is compact JSON (it can be several MB), without it is readable. */
export async function prepareBackup({ photos = false } = {}) {
  const obj = exportBackup();
  if (!photos) return JSON.stringify(obj, null, 2);
  obj.photos = await photosForBackup().catch(() => []);
  return JSON.stringify(obj);
}

/**
 * Android app: a WebView cannot download files, so write the backup into the app's cache folder and open
 * the phone's share sheet on it (the person picks Drive, Files, WhatsApp, email...).
 * Returns true when it was shared, or 'unsure' when Android said "cancelled": Android also says that when the
 * app they picked opens as a pop-up (Drive's "Save to Drive", Quick Share...) even though the file was saved,
 * so the screen asks the person instead of guessing.
 */
async function shareNative(name, text) {
  const Filesystem = nativePlugin('Filesystem');
  const Share = nativePlugin('Share');
  if (!Filesystem || !Share) throw new Error('The share sheet is not available');
  const written = await Filesystem.writeFile({ path: filename(name), data: text, directory: 'CACHE', encoding: 'utf8' });
  try {
    await Share.share({ title: 'TickFit backup', files: [written.uri], dialogTitle: 'Save your TickFit backup' });
    markBackedUp();
    return true;
  } catch (e) {
    if (/cancel/i.test(String((e && e.message) || e))) return 'unsure'; // closed the sheet, or saved through a pop-up
    throw e;
  }
}

/** Can this browser (or the Android app) hand a file to the phone's share sheet? */
export function canShareFiles() {
  if (isNative()) return !!(nativePlugin('Filesystem') && nativePlugin('Share'));
  try {
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [makeFile('test', '{}')] }));
  } catch {
    return false;
  }
}

/** Download the backup as a file. */
export function saveBackupFile(name, text) {
  if (isNative()) return shareNative(name, text); // no downloads in the app, the share sheet does the saving
  const file = makeFile(name, text);
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  markBackedUp();
}

/** Open the share sheet. Returns true if the person shared it, false if they cancelled. */
export async function shareBackupFile(name, text) {
  if (isNative()) return shareNative(name, text);
  try {
    await navigator.share({ files: [makeFile(name, text)], title: 'TickFit backup' });
    markBackedUp();
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false; // they closed the share sheet
    throw e;
  }
}

/** Desktop Chrome and Edge can save to a place you pick, and replace a file that is already there. Phones cannot. */
export const canOverwrite = () => !isNative() && typeof window.showSaveFilePicker === 'function'; // a WebView has the function but it does nothing

/** Opens the "save as" picker (it asks before replacing an existing file). Returns false if cancelled. */
export async function saveOverExisting(name, text) {
  const file = makeFile(name, text);
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
