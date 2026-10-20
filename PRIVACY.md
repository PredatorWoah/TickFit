# Privacy

**TickFit never sends your data anywhere.** There are no accounts, no servers, no analytics, no cookies and no ads.

## What is stored, and where

Everything you enter (plans, ticks, sets, weights, notes, water, settings, and the answers you give the plan builder such as age, height and weight) is saved in your browser's `localStorage`, on your own device. Progress photos are too big for that, so they go in the browser's own on-device database (IndexedDB, named `tickfit-photos`), shrunk to about 1280 pixels. Nothing else exists. The author of TickFit cannot see it, because there is nowhere for it to go.

## What leaves your device

Nothing, unless you switch on one of these optional features (plus one check for new versions in the Android app, described right after them):

- **AI helpers (off unless you tick "Use AI helpers" in More and add a key).** You pick one provider: OpenRouter (`openrouter.ai`), OpenAI (`api.openai.com`), Anthropic Claude (`api.anthropic.com`) or Google Gemini (`generativelanguage.googleapis.com`), with your own key. Then, and only when you tap something:
  - **The assistant** (the Ask AI button) sends your message, the conversation so far, and your plan for the next 7 days (exercises, meals, water, and your plan builder answers if you used it). Your last 2 weeks of ticks, logged sets, typed-in workout time, notes, body weight, steps and measurements are added **only** while "Let the assistant see my history" is ticked. The AI only suggests changes: nothing in your data changes until you tap **Apply**, and Undo puts it back.
  - **Convert with AI** on the Import screen sends the text of the document you are converting.
  - **Suggest exercises / meals** in the Choose sheet sends the day's name and focus, the names already chosen and your plan builder answers. Never your history.
  - Saving a key asks that provider for its list of models (only the key is sent).

  Each provider handles what you send under its own terms. Paid models cost money on your account with them; free models (OpenRouter's free ones, Gemini's free tier) may use what you send to improve their models, so do not send anything you consider private. With AI switched off, no request to any of them is ever made.

- **Online food lookup (off unless you turn it on).** If you switch on **More > Food lookup**, tapping **Estimate from foods** in the plan editor sends the *name* of a food the built-in table does not know (for example `quinoa crunch`) to Open Food Facts (`world.openfoodfacts.org`), a free open food database. No amounts, plans, progress, weight or personal details are sent. Like any website, they can see your IP address. If you never turn it on, no request is ever made.
- **Scanning a packet's barcode (same setting).** The camera picture stays on your phone: the phone reads the stripes itself. Only the barcode's digits (like `8901063012345`) are sent to Open Food Facts to find the product's name, calories and protein. If the lookup is off, TickFit asks before turning it on.

- **Looking for a new version (Android app only, on unless you switch it off).** Once a day, and when you tap **More > App version > Check for updates**, the app asks GitHub for TickFit's latest release (`api.github.com/repos/PredatorWoah/TickFit/releases/latest`), the same public page anyone can open. Nothing about you, your plans or your progress is sent; GitHub sees an ordinary request from your phone's internet address. When you tap **Update**, the new APK is downloaded from TickFit's releases on GitHub, its SHA-256 fingerprint is checked against the one GitHub publishes, and Android's own installer takes over (Android also refuses an update not signed by TickFit's key). Switch the daily check off with **Look for a new version by itself** in the same card. The website never does this: it updates through its service worker from this site.

These two stay on the phone too, but are worth spelling out:

- **Steps (Android app, off unless you connect it).** **More > Steps** asks Health Connect for permission to *read step counts* and nothing else; the app's install file even removes every other health permission the plugin would add. The daily counts are saved with the rest of your data (and go into backups and spreadsheet exports). Nothing is written to Health Connect and nothing is sent anywhere. **Stop showing steps** stops reading; you can also take the permission away in Health Connect.
- **Reminders (Android app, off unless you turn them on).** They are scheduled on the phone with Android's own notifications. Nothing is sent anywhere.

TickFit also tells your browser to enforce this: the page ships with a Content Security Policy that only allows connections to this site, to the four AI providers above (`openrouter.ai`, `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`), to `world.openfoodfacts.org` and to `api.github.com` (the version check). A bug or a bad edit cannot quietly start talking to some other server.

## Your AI keys

- Each is stored unencrypted on this device, in its own storage slot (`tickfit:openrouter`, `tickfit:openai`, `tickfit:claude`, `tickfit:gemini`), apart from your data. (TickFit 2.1 to 2.3 offered OpenCode Zen instead of OpenRouter; its old key slot, `tickfit:opencode`, is deleted when you update.)
- Anyone who can use this phone or browser profile, or a malicious browser extension, could read them. Use keys you can revoke, and never reuse an important one.
- They are **never** included in backup files.
- **Remove key** in More deletes it from this device.

## Plan builder

The "Build one for me" feature runs entirely on your phone using formulas and built in lists. Your age, height, weight and other answers are never sent anywhere. They are remembered locally so the form is pre-filled next time, and they are part of your backup file, so keep that file private. "Or copy a prompt for a chatbot" only copies text to your clipboard. If you then paste it into a chatbot, that chatbot's own privacy rules apply.

## Form videos

The "Form video" button simply opens a link (your own, or a YouTube search for the exercise's name) in a new tab. TickFit does not load or embed any video itself.

## Progress photos

Photos you take or pick on the Progress tab stay on this device. They are never uploaded. The backup sheet has a tick box to put them inside the backup file (it gets bigger, about 0.1 to 0.3 MB per photo); you can also save single photos with **Save a copy**. Delete one by tapping it, then **Delete**. Taking a photo uses the camera inside TickFit (the Android app asks for the camera permission the first time). The picture goes straight into the on-device photo database; nothing is uploaded. If the camera can't be used, TickFit opens your phone's own camera app instead.

## Sharing a plan

**Share** on a plan puts the plan (its name, days, exercises, meals and options) into a link and a QR code, made on your phone. Nothing is uploaded: whoever you give the link to gets the plan when they open it. Your progress, weights, notes, photos and settings are never in it. The QR code is drawn by the bundled qrcode-generator library (MIT, in `vendor/qrcode`). **Share this workout** draws a picture on your phone and hands it to your share sheet.

## Backups

In the Android app, TickFit also saves an automatic backup once a day in your phone's `Documents/TickFit` folder (the last 7 are kept). It stays on your phone; it only goes elsewhere if you sync that folder yourself. Switch it off in **More > Your data**. On Android 10 and older this needs the storage permission, which the app asks for once.

A backup file contains all your plans, progress, notes, body weight log, settings and plan builder answers (but never your AI keys). It is a normal file you control. "Share backup" hands the file to your phone's share sheet, and where it goes from there is up to you.

## Files you upload

A PDF or text file you pick is read by code running on your device (using a bundled copy of [pdf.js](https://mozilla.github.io/pdf.js/)). It is not uploaded anywhere.

## Hosting

If you use the copy hosted on GitHub Pages, GitHub serves the files and, like any web host, can see standard request logs (IP address, time) when you open the page. That is about downloading the app, not about your data. After the first load the app works offline, so you can also use it with no connection at all.

## One thing to know about GitHub Pages

Browsers keep site data per *origin*, which is the host name, not the folder. On GitHub Pages every project site of one account lives at the same host (`USERNAME.github.io`), so **any other web page you publish under that same account can read TickFit's data in the same browser**. This is how browsers work for every site, not something TickFit can change from the inside. If you publish other pages on the same account that you don't fully trust, give TickFit its own custom domain, or host it under its own GitHub account or organisation. It never affects *other people*: their browsers are completely separate from yours.

## How we check the "nothing leaves your device" promise

`node tests/privacy.mjs` runs on every change. It fails if the code starts using anything that could send data away (uploads, web sockets, beacons, cookies, cross-tab messaging, embedded frames; the on-device photo database is allowed only in `js/photos.js`, which has no way to send anything), if `fetch` appears anywhere unexpected, if the code names a website that isn't on a short allow list, or if the Content Security Policy is loosened. You can read the allow list at the top of that file.

## Deleting your data

- One plan: **Plans > Delete**.
- One progress photo: tap it on the Progress tab, then **Delete**.
- Everything: clear this site's data in your browser settings, or remove the installed app.
- Backups you exported are ordinary files you control.
