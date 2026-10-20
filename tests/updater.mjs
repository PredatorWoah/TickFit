// Updates from inside the Android app: which release counts as newer, what is taken from GitHub's answer, and
// when the daily check runs. Run: node tests/updater.mjs
import { parseVersion, newerThan, pickRelease, checkDue, canUpdateInApp, checkForUpdate } from '../js/updater.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ----- versions
ok(eq(parseVersion('v2.4.0'), { parts: [2, 4, 0], test: false }) && eq(parseVersion('2.4.0-main'), { parts: [2, 4, 0], test: true }), 'versions are read with or without the v, test builds marked');
ok(parseVersion('dev') === null && parseVersion('') === null && parseVersion(null) === null, 'no version for developer builds or junk');
ok(newerThan('2.4.0', '2.3.0') && newerThan('2.10.0', '2.9.9') && newerThan('3.0.0', '2.99.99'), 'newer by number, not by text (2.10 beats 2.9)');
ok(!newerThan('2.3.0', '2.3.0') && !newerThan('2.2.9', '2.3.0'), 'the same or an older version is not offered');
ok(newerThan('2.4.0', '2.4.0-main') && !newerThan('2.4.0-main', '2.4.0'), 'a test build takes the real release of the same number');
ok(newerThan('2.4.0', 'dev') && !newerThan('junk', '2.4.0'), 'a developer build takes any release; a junk tag is never newer');

// ----- GitHub's release answer
const DL = 'https://github.com/PredatorWoah/TickFit/releases/download/v2.5.0/';
const release = {
  tag_name: 'v2.5.0',
  html_url: 'https://github.com/PredatorWoah/TickFit/releases/tag/v2.5.0',
  draft: false,
  prerelease: false,
  body: 'Download TickFit-2.5.0.apk below.\n\n## What\'s Changed\n* 2.5.0: **faster** rest timer by @PredatorWoah in https://github.com/PredatorWoah/TickFit/pull/31\n* Fix the `water` tile\n\n**Full Changelog**: https://github.com/x',
  assets: [
    { name: 'SHA256SUMS.txt', browser_download_url: DL + 'SHA256SUMS.txt', size: 84 },
    { name: 'TickFit-2.5.0.apk', browser_download_url: DL + 'TickFit-2.5.0.apk', size: 6295723, digest: 'sha256:' + 'AB'.repeat(32) },
  ],
};
const rel = pickRelease(release);
ok(rel && rel.version === '2.5.0' && rel.url === DL + 'TickFit-2.5.0.apk' && rel.name === 'TickFit-2.5.0.apk' && rel.size === 6295723, 'the APK, its name, size and version are found');
ok(rel.sha256 === 'ab'.repeat(32) && rel.sumsUrl === DL + 'SHA256SUMS.txt', "GitHub's fingerprint is used, the SHA256SUMS file kept as a second way");
ok(eq(rel.notes, ['2.5.0: faster rest timer', 'Fix the water tile']), 'the changes become plain lines: ' + JSON.stringify(rel.notes));
const noDigest = pickRelease({ ...release, assets: [release.assets[0], { ...release.assets[1], digest: undefined }] });
ok(noDigest && noDigest.sha256 === null && noDigest.sumsUrl, 'no digest: the SHA256SUMS file is checked instead');
ok(pickRelease({ ...release, assets: [{ ...release.assets[1], digest: undefined }] }) === null, 'nothing to check the file against: not offered');
ok(pickRelease({ ...release, assets: [{ ...release.assets[1], browser_download_url: 'https://evil.example/TickFit.apk' }, release.assets[0]] }) === null, 'an APK from anywhere but TickFit\'s releases is never offered');
ok(pickRelease({ ...release, draft: true }) === null && pickRelease({ ...release, prerelease: true }) === null, 'drafts and pre-releases are skipped');
ok(pickRelease({ ...release, assets: [release.assets[0]] }) === null && pickRelease(null) === null && pickRelease({ tag_name: 'latest' }) === null, 'no APK or no version: nothing');

// ----- the daily check
const now = 1_800_000_000_000;
ok(checkDue({}, now) && checkDue({ updateCheckedAt: now - 25 * 3600e3 }, now), 'due on first run and after a day');
ok(!checkDue({ updateCheckedAt: now - 3600e3 }, now), 'not again within the day');
ok(!checkDue({ updateCheck: false }, now), 'never when switched off');
ok(checkDue({ updateCheckedAt: now + 3600e3 }, now), 'a clock that went backwards does not block it for good');

// ----- in a browser (or these tests) nothing goes online
globalThis.window = {};
ok(canUpdateInApp() === false, 'no in-app updates outside the Android app');
let fetched = false;
globalThis.fetch = () => ((fetched = true), Promise.reject(new Error('no')));
ok((await checkForUpdate()) === null && !fetched, 'and a check does not even ask GitHub');

if (fail) {
  console.log(`\n${fail} failed`);
  process.exit(1);
}
console.log('\nall passed');
