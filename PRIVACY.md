# Privacy

**TickFit never sends your data anywhere.** There are no accounts, no servers, no analytics, no cookies and no ads.

## What is stored, and where

Everything you enter (plans, ticks, sets, weights, notes, water, settings, and the answers you give the plan builder such as age, height and weight) is saved in your browser's `localStorage`, on your own device. Progress photos are too big for that, so they go in the browser's own on-device database (IndexedDB, named `tickfit-photos`), shrunk to about 1280 pixels. Nothing else exists. The author of TickFit cannot see it, because there is nowhere for it to go.

## What leaves your device

Nothing, unless you switch on one of these optional features:

- **AI helpers: Claude or Gemini (off unless you add a key).** If you paste your own Anthropic (Claude) or Google (Gemini) API key in **More**, two things can send text to that company, and only when you tap them:
  - **Convert with Claude / Gemini** on the Import screen sends the text of the document you are converting.
  - **Suggest exercises / meals** in the Choose sheet sends the day's name and focus, the names of the exercises or meals already chosen and, if you used the plan builder, your goal, experience, equipment, injuries to avoid and diet. Never your history, weights, body weight or notes.

  Claude is billed to your Anthropic account and what you send is handled under Anthropic's API terms. On Google's free tier, Google may use what you send to improve its products, so do not send anything you consider private. If you never add a key, no request to either is ever made.

- **Online food lookup (off unless you turn it on).** If you switch on **More > Food lookup**, tapping **Estimate from foods** in the plan editor sends the *name* of a food the built-in table does not know (for example `quinoa crunch`) to Open Food Facts (`world.openfoodfacts.org`), a free open food database. No amounts, plans, progress, weight or personal details are sent. Like any website, they can see your IP address. If you never turn it on, no request is ever made.
- **Scanning a packet's barcode (same setting).** The camera picture stays on your phone: the phone reads the stripes itself. Only the barcode's digits (like `8901063012345`) are sent to Open Food Facts to find the product's name, calories and protein. If the lookup is off, TickFit asks before turning it on.

TickFit also tells your browser to enforce this: the page ships with a Content Security Policy that only allows connections to this site, to `api.anthropic.com`, to `generativelanguage.googleapis.com` and to `world.openfoodfacts.org`. A bug or a bad edit cannot quietly start talking to some other server.

## Your Claude and Gemini keys

- Each is stored unencrypted in this browser, in its own storage slot (`tickfit:claude`, `tickfit:gemini`).
- Anyone who can use this phone or browser profile, or a malicious browser extension, could read it. Use a key you can revoke, and never reuse an important one.
- They are **never** included in backup files.
- **More > Remove key from this device** deletes it.

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

A backup file contains all your plans, progress, notes, body weight log, settings and plan builder answers (but never your Claude or Gemini key). It is a normal file you control. "Share backup" hands the file to your phone's share sheet, and where it goes from there is up to you.

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
