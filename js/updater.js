// updater.js
// Android app: new versions from inside the app, no trip to GitHub in a browser.
//
// Once a day (switch in More > App version) or when you tap "Check for updates", the app asks GitHub for
// TickFit's latest release. Nothing about you is sent: it is the same public page anyone can open. If the
// release is newer than this app, a note shows on Today; Update downloads the new APK (native code checks its
// SHA-256 fingerprint, android-app/native/java/TickFitUpdatePlugin.java) and opens Android's own installer.
// Your data stays: an update installs over the old app. In a browser none of this runs (the website updates
// itself through the service worker).

import { isNative, nativePlugin, appVersion } from './platform.js';
import { getState, setSetting } from './store.js';

export const RELEASES_API = 'https://api.github.com/repos/PredatorWoah/TickFit/releases/latest';
const DOWNLOADS = 'https://github.com/PredatorWoah/TickFit/releases/download/';
const DAY = 24 * 60 * 60 * 1000;

/** "2.4.0" -> [2, 4, 0]; "v2.4.0-main" -> [2, 4, 0] (and marked as a test build). Pure. */
export function parseVersion(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  return m ? { parts: [Number(m[1]), Number(m[2]), Number(m[3])], test: !!m[4] } : null;
}

/** Is version `a` newer than `b`? A test build ("2.4.0-main") counts as older than the real 2.4.0. Pure. */
export function newerThan(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x) return false;
  if (!y) return true; // a build with no version (a developer build) takes any real release
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i];
  return !x.test && y.test;
}

/** What the update needs from GitHub's release JSON, or null when it has no APK. Pure. */
export function pickRelease(json) {
  if (!json || json.draft || json.prerelease) return null;
  const version = String(json.tag_name || '').replace(/^v/i, '');
  if (!parseVersion(version)) return null;
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const apk = assets.find((a) => /\.apk$/i.test(a.name || '') && String(a.browser_download_url || '').startsWith(DOWNLOADS));
  if (!apk) return null;
  const sums = assets.find((a) => a.name === 'SHA256SUMS.txt' && String(a.browser_download_url || '').startsWith(DOWNLOADS));
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(apk.digest || '');
  if (!digest && !sums) return null; // nothing to check the file against: don't offer it
  // the changes, as plain lines (GitHub's notes are Markdown with links)
  const notes = String(json.body || '')
    .split('\n')
    .filter((l) => /^\s*[*-]\s+/.test(l))
    .map((l) => l.replace(/^\s*[*-]\s+/, '').replace(/\s+by @\S+ in https?:\/\/\S+$/, '').replace(/[*_`]/g, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  return { version, name: apk.name, url: apk.browser_download_url, sha256: digest ? digest[1].toLowerCase() : null, sumsUrl: sums ? sums.browser_download_url : null, size: Number(apk.size) || 0, notes, page: String(json.html_url || '') };
}

/** Should the daily check run now? Pure. */
export function checkDue(settings, now = Date.now()) {
  if (!settings || settings.updateCheck === false) return false;
  const last = Number(settings.updateCheckedAt) || 0;
  return now - last >= DAY || now < last;
}

/** The plugin, or null in a browser or an older app without it. */
const plugin = () => (isNative() ? nativePlugin('TickFitUpdate') : null);
export const canUpdateInApp = () => !!plugin();

let found = null; // the newer release, once a check found one

/** The newer release a check found (kept across restarts, so a restart never loses it), if any. */
export const pendingUpdate = () => found;

/**
 * At start: bring back a found update that is still newer than this app (Android often restarts the app when
 * you allow it to install updates), and tidy away a downloaded file once that version is installed.
 */
export function initUpdater() {
  if (!canUpdateInApp()) return;
  const st = getState().settings;
  const kept = st.updateFound && pickedOk(st.updateFound) && newerThan(st.updateFound.version, appVersion()) ? st.updateFound : null;
  found = kept;
  if (!kept && st.updateFound) setSetting('updateFound', null);
  if (st.updateDownloaded && (!kept || kept.version !== st.updateDownloaded)) {
    setSetting('updateDownloaded', null);
    clearDownloaded();
  }
}
const pickedOk = (r) => r && typeof r.version === 'string' && typeof r.url === 'string' && r.url.startsWith(DOWNLOADS) && Array.isArray(r.notes);

/** Already downloaded and checked (also before a restart)? */
export const isDownloaded = (rel) => !!rel && getState().settings.updateDownloaded === rel.version;

/**
 * Ask GitHub for the latest release. Resolves to the release when it is newer than this app, else null.
 * Throws a friendly Error when GitHub can't be reached.
 */
export async function checkForUpdate() {
  if (!canUpdateInApp()) return null;
  let res;
  try {
    res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  } catch {
    throw new Error('Could not reach GitHub. Check the internet connection.');
  }
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub says to wait a little before checking again.' : `GitHub answered ${res.status}. Try again later.`);
  setSetting('updateCheckedAt', Date.now());
  const rel = pickRelease(await res.json());
  found = rel && newerThan(rel.version, appVersion()) ? rel : null;
  setSetting('updateFound', found);
  return found;
}

/** The daily check, quietly: never throws, resolves to a newer release or null. */
export async function autoCheck() {
  if (!canUpdateInApp() || !checkDue(getState().settings)) return null;
  try {
    return await checkForUpdate();
  } catch {
    return null;
  }
}

/** Download the release's APK (checked against its fingerprint). onProgress(done, total) in bytes. */
export async function downloadUpdate(rel, onProgress) {
  const p = plugin();
  if (!p) throw new Error('Updating inside the app needs the Android app.');
  const listener = onProgress && p.addListener ? await p.addListener('progress', (e) => onProgress(e.done, e.total)) : null;
  try {
    await p.download({ url: rel.url, sha256: rel.sha256 || undefined, sumsUrl: rel.sumsUrl || undefined, name: rel.name });
    setSetting('updateDownloaded', rel.version);
  } finally {
    if (listener && listener.remove) listener.remove();
  }
}

/** Open Android's installer. Resolves to { needsPermission } when Android first asks to allow it. */
export async function installUpdate() {
  const p = plugin();
  if (!p) throw new Error('Updating inside the app needs the Android app.');
  try {
    return (await p.install()) || {};
  } catch (e) {
    setSetting('updateDownloaded', null); // the file is gone: download it again next time
    throw e;
  }
}

/** After an update is installed, the downloaded file is no longer needed. */
export function clearDownloaded() {
  const p = plugin();
  if (p && p.clear) p.clear().catch(() => {});
}
