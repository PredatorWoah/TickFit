# The TickFit Android app

The Android app is a **complete app**: all of TickFit is packed inside the APK (using [Capacitor](https://capacitorjs.com)), so it works with no internet and no website. It is built from the same code as the website, by a GitHub Actions workflow, and attached to a GitHub Release.

## What is different from the website

- **Separate data.** The app keeps its own saved data, apart from the website's. To move your data in either direction, use **More, Back up now** on one side and **More, Restore from a backup file** on the other.
- **Backups use the share sheet.** An app cannot "download" a file like a browser can, so **Back up now** opens the phone's share sheet: pick Google Drive, Files, WhatsApp or email.
- **No service worker.** Every file is already on the phone. Updates come as a new APK (see below).
- The status bar icons follow your light or dark theme.
- **Back works inside the app.** The Back button or swipe-back closes a pop-up first, then goes up one screen (a sub-screen to its parent, another tab to Today), and only leaves the app from Today.
- Ticking a set or a meal gives a light haptic tap.
- **Home screen widgets.** Long press the home screen, **Widgets**, **TickFit**. Six of them: **Day ring** (2×2), **Today** (4×2: ring, workout, calories, protein, water), **Next up** (4×1: the next exercise with a live workout clock), **Water** (2×1, with a + button that adds 250 ml), **Streak and week** (4×1) and **Weight lifted** (2×2, compared with something Indian). They follow the phone's light or dark mode. Tapping one opens the right screen.

## How the widgets work (for developers)

- The app works out everything a widget shows in `js/widgetdata.js` (tested in `tests/widgetdata.mjs`) and sends it, as one small JSON snapshot, to a tiny native plugin (`TickFitWidget`) right after every save, when the app comes back and when you leave it. It is sent at once, never on a timer, because Android pauses the app the moment you leave it. The native side (`android-app/native/java`) only places that text and those numbers; it never reads or changes your data.
- The Water widget's + button can't run the app, so it adds the water to the widget straight away and keeps a note of it. The next time the app runs it takes that note and adds the water to that day itself. Your data in the app stays the one source of truth.
- The snapshot also holds tomorrow, and the widgets redraw themselves just after midnight (an inexact alarm, no special permission), so they switch to the new day even if the app is never opened. They also refresh about every 30 minutes.
- `android-app/scripts/customize.mjs` copies `android-app/native` into the generated project, adds the six widgets to the manifest and registers the plugin. `tests/widgets-native.mjs` checks the resources match the Java code, since this repo builds without the Android SDK locally.

## One-time setup: your signing key

Android only accepts an update if it is signed by the **same key** as the installed version, so you create the key once and keep it forever. **Never commit it to the repo.**

1. Make the key. On a computer with Java (or in a free GitHub Codespace, which has it), run:

   ```
   keytool -genkeypair -v -keystore tickfit-release.jks -alias tickfit -keyalg RSA -keysize 2048 -validity 10000
   ```

   It asks for a password (use a strong one) and your name. Press Enter to reuse the same password for the key.
2. Turn the key file into text:
   - Linux / Codespaces: `base64 -w0 tickfit-release.jks`
   - Mac: `base64 -i tickfit-release.jks`
3. In the repo go to **Settings, Secrets and variables, Actions, New repository secret** and add four secrets:

   | Secret name | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | the long text from step 2 |
   | `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
   | `ANDROID_KEY_ALIAS` | `tickfit` |
   | `ANDROID_KEY_PASSWORD` | the key password (the same one if you pressed Enter) |

4. **Keep `tickfit-release.jks` and the passwords safe** (a password manager plus an offline copy). If you lose them, nobody can update the app without uninstalling it first (which deletes their data).

## Publishing a version

**The easy way (automatic):** put the new version number in `android-app/VERSION` (for example `1.2.0`) in the same pull request as the change. When it is merged into `main`, the workflow sees there is no `v1.2.0` release yet, builds and signs the APK, and publishes the release **TickFit 1.2.0** with the APK, a checksum and notes listing the merged pull requests. Merges that keep the same version just make a test build, so nothing is published twice.

**By hand (still works):**

1. On GitHub: **Releases, Draft a new release**. Tag `v1.0.0` (create it), title `TickFit 1.0.0`, add a short description, and **Publish release**.
2. The **Build Android app** workflow starts by itself (about 10 minutes). It runs the tests, builds the app, signs it with your key and attaches `TickFit-1.0.0.apk` and `SHA256SUMS.txt` to the release.
3. For the next version use a higher number (`v1.1.0`) and publish another release. The version code goes up by itself.

The **Get the app** card in TickFit's More screen links to the latest release.

## Trying a build first

**Actions, Build Android app, Run workflow** makes a **test** APK (signed with a throwaway debug key) and keeps it as a download on the run page for 30 days. It is for your own phone only. It cannot be updated by a real release, so uninstall it before installing the real one.

## Installing (for people)

1. Download `TickFit-….apk` from the latest release on your phone.
2. Open it. Android asks you to allow installs from your browser or Files app, turn that on once.
3. If Play Protect warns about an unknown developer, choose **Install anyway**.
4. To update, download the newer APK and install it over the old one. Your data stays.

## How it is built (for developers)

- `android-app/capacitor.config.json` holds the app id (`io.github.predatorwoah.tickfit`) and settings.
- `android-app/scripts/prepare.mjs` copies the web app into `android-app/www`.
- `npx cap add android` generates the Android project (not stored in the repo).
- `android-app/scripts/customize.mjs` sets the version, the permissions, the icons and the launch screen.
- The workflow runs Gradle, then signs the APK with `apksigner`.
- `js/platform.js` is how the web code knows it is inside the app (and handles Back, haptics and the share sheet there).
- `android-app/scripts/make-icons.mjs` redraws the app icon (a barbell bent into a tick) and writes every size: `node scripts/make-icons.mjs` after `npm ci`.

To try it locally you need Node 22, Java 21 and the Android SDK:

```
cd android-app && npm ci
VERSION_NAME=1.0.0 node scripts/prepare.mjs
npx cap add android
VERSION_NAME=1.0.0 VERSION_CODE=1 node scripts/customize.mjs
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Later: Google Play

The same project can produce an `.aab` for Google Play (a one-time $25 developer account). Play needs the privacy policy page and the Data safety form (TickFit collects nothing), and has its own testing rules for new accounts. Ask if you want this set up.
