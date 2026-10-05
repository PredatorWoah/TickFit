# Making the Android app (APK) and putting it on GitHub Releases

TickFit's Android app is a **Trusted Web Activity (TWA)**: a thin Android shell that opens the website full screen, with no browser bars. That means:

- the website and the app are **the same code**, so every website update reaches the app automatically
- the app shares its saved data with Chrome for the same site
- you only make a new APK when you change the app's name, icon or package, not when you change TickFit

You do this once. No Android Studio and no coding.

## 1. Build the APK with PWABuilder (about 10 minutes)

1. Make sure the site is live: https://predatorwoah.github.io/TickFit/
2. Open https://www.pwabuilder.com, paste that address and press **Start**. It should show the manifest and service worker as passing.
3. Choose **Package for stores**, then **Android**.
4. Fill in the options:
   - **Package ID:** `io.github.predatorwoah.tickfit` (choose once, never change it)
   - **App name:** `TickFit`
   - **App version:** `1.0.0` and **version code** `1` (raise the code by 1 for every later release)
   - **Signing key:** choose **Create new**, and fill in your name and a strong password
   - leave the rest as the defaults
5. Press **Generate** and download the zip.

The zip contains your `.apk` (and an `.aab`), a **signing key file** (`signing.keystore`), a text file with its **passwords and SHA-256 fingerprint**, and an `assetlinks.json`.

> **Keep `signing.keystore` and its passwords safe and private** (a password manager, plus an offline copy). Never put them in the repo. Every future update must be signed with the same key, and if it is lost, people have to uninstall and reinstall to get updates.

## 2. Remove the address bar (Digital Asset Links)

Android only goes fully full screen if the website proves it belongs to the app. The proof is a small file served at the **root of the domain**:

`https://predatorwoah.github.io/.well-known/assetlinks.json`

Because TickFit lives in a project folder (`/TickFit/`), that file has to come from a separate repository named exactly `predatorwoah.github.io`. It only needs:

- a `.nojekyll` file (so the hidden `.well-known` folder is published)
- `.well-known/assetlinks.json`, using `docs/assetlinks.example.json` as the template. Put your package ID and your **SHA-256 fingerprint** (from the text file in the zip) into it, or just use the `assetlinks.json` from the zip

Turn on GitHub Pages for that repo (Settings, Pages, deploy from the main branch).

Without this step the app still works, it just shows a small address bar at the top.

## 3. Publish it on GitHub Releases

1. In the TickFit repo: **Releases, Draft a new release**.
2. **Tag:** `v1.0.0`. **Title:** `TickFit for Android 1.0.0`.
3. Drag the `.apk` into the release. Rename it to `TickFit-1.0.0.apk` first.
4. In the description, say how to install it (below), and paste the file's SHA-256 so people can check it (`sha256sum TickFit-1.0.0.apk`).
5. **Publish release.** The **Get the app** card in TickFit's More screen links to the latest release.

### Install steps for people
1. Download `TickFit-….apk` from the latest release on your phone.
2. Open it. Android asks to allow installs from your browser or Files app, turn that on for this once.
3. If Play Protect warns about an unknown developer, choose **Install anyway**.

## Updating later

- **Changes to TickFit itself:** nothing to do. The app loads the website, and the website updates itself.
- **Changes to the app shell** (name, icon, package settings): run PWABuilder again with the **same package ID and the same signing key**, raise the version code, and publish a new release.

## Later: Google Play

The same APK/AAB can go to Google Play (a one-time $25 developer account). It needs the privacy policy page (PRIVACY.md published on the site) and the Data safety form (TickFit collects nothing). Check Google's current rules for new accounts, which have required a period of closed testing first.
