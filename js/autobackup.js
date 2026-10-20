// autobackup.js
// Android app only: once a day, quietly save a backup file in the phone's Documents/TickFit folder and keep
// the newest 7. That folder survives uninstalling the app or clearing its data, and the person can sync it to
// Google Drive (or copy it to a new phone). It never leaves the phone by itself.
//
// A copy on the same phone does not help if the phone is lost, so the reminder to save a copy elsewhere stays,
// just weekly instead of daily (see backupCovered).

import { getState, setSetting } from './store.js';
import { todayStr, diffDays } from './dates.js';
import { isNative, nativePlugin } from './platform.js';
import { prepareBackup } from './backup.js';

export const AUTO_FOLDER = 'TickFit';
const KEEP = 7;
const NAME = /^tickfit-auto-\d{4}-\d{2}-\d{2}\.json$/;

export const autoBackupOn = () => isNative() && getState().settings.autoBackup !== false;

/** The oldest automatic backups to delete so that only the newest `keep` stay. Pure. */
export function oldAutoBackups(names, keep = KEEP) {
  return names.filter((n) => NAME.test(n)).sort().reverse().slice(keep);
}

let running = false;

/** Make today's automatic backup if it isn't there yet. Never throws; problems are kept in settings for More. */
export async function runAutoBackup() {
  if (!autoBackupOn() || running) return false;
  const today = todayStr();
  if (getState().settings.lastAutoBackup === today) return false;
  const Filesystem = nativePlugin('Filesystem');
  if (!Filesystem) return false;
  running = true;
  try {
    const text = await prepareBackup({ photos: getState().settings.autoBackupPhotos === true });
    const write = () => Filesystem.writeFile({ path: `${AUTO_FOLDER}/tickfit-auto-${today}.json`, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
    try {
      await write();
    } catch (e) {
      // Android 10 and older need the storage permission for Documents; ask once, then try again
      if (!Filesystem.requestPermissions) throw e;
      const p = await Filesystem.requestPermissions();
      if (p && p.publicStorage && p.publicStorage !== 'granted') throw new Error('TickFit is not allowed to save files. Allow it in the phone settings.');
      await write();
    }
    try {
      const { files = [] } = await Filesystem.readdir({ path: AUTO_FOLDER, directory: 'DOCUMENTS' });
      for (const name of oldAutoBackups(files.map((f) => (typeof f === 'string' ? f : f.name)))) await Filesystem.deleteFile({ path: `${AUTO_FOLDER}/${name}`, directory: 'DOCUMENTS' }).catch(() => {});
    } catch {
      // tidying up is a nice-to-have
    }
    setSetting('lastAutoBackup', today);
    if (getState().settings.autoBackupError) setSetting('autoBackupError', null);
    return true;
  } catch (e) {
    setSetting('autoBackupError', (e && e.message) || 'Could not save the automatic backup.');
    return false;
  } finally {
    running = false;
  }
}

/**
 * True when the automatic backup ran today AND a copy was saved somewhere else in the last 7 days: then the
 * daily reminder and the red dot can rest. Pure, so it can be tested.
 */
export function backupCovered(settings, today, native = isNative()) {
  if (!native || settings.autoBackup === false || settings.lastAutoBackup !== today || !settings.lastBackup) return false;
  return diffDays(settings.lastBackup, today) < 7;
}
