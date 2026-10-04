# Privacy

**TickFit never sends your data anywhere.** There are no accounts, no servers, no analytics, no cookies and no ads.

## What is stored, and where

Everything you enter (plans, ticks, sets, weights, notes, water, settings, and the answers you give the plan builder such as age, height and weight) is saved in your browser's `localStorage`, on your own device. Nothing else exists. The author of TickFit cannot see it, because there is nowhere for it to go.

## What leaves your device

Nothing, with one optional exception:

- **Gemini AI helper (off unless you turn it on).** If you paste your own Google Gemini API key in **More**, then tapping **Convert with Gemini** sends the text of the document you are converting to Google's servers. Nothing else is sent. On Google's free tier, Google may use what you send to improve its products, so do not send anything you consider private. If you never add a key, no request to Google is ever made.

TickFit also tells your browser to enforce this: the page ships with a Content Security Policy that only allows connections to this site and to `generativelanguage.googleapis.com`. A bug or a bad edit cannot quietly start talking to some other server.

## Your Gemini key

- It is stored unencrypted in this browser, in its own storage slot (`tickfit:gemini`).
- Anyone who can use this phone or browser profile, or a malicious browser extension, could read it. Use a key you can revoke, and never reuse an important one.
- It is **never** included in backup files.
- **More > Remove key from this device** deletes it.

## Plan builder

The "Build one for me" feature runs entirely on your phone using formulas and built in lists. Your age, height, weight and other answers are never sent anywhere. They are remembered locally so the form is pre-filled next time, and they are part of your backup file, so keep that file private. "Or copy a prompt for a chatbot" only copies text to your clipboard. If you then paste it into a chatbot, that chatbot's own privacy rules apply.

## Form videos

The "Form video" button simply opens a link (your own, or a YouTube search for the exercise's name) in a new tab. TickFit does not load or embed any video itself.

## Backups

A backup file contains all your plans, progress, notes, settings and plan builder answers (but never your Gemini key). It is a normal file you control. "Share backup" hands the file to your phone's share sheet, and where it goes from there is up to you.

## Files you upload

A PDF or text file you pick is read by code running on your device (using a bundled copy of [pdf.js](https://mozilla.github.io/pdf.js/)). It is not uploaded anywhere.

## Hosting

If you use the copy hosted on GitHub Pages, GitHub serves the files and, like any web host, can see standard request logs (IP address, time) when you open the page. That is about downloading the app, not about your data. After the first load the app works offline, so you can also use it with no connection at all.

## One thing to know about GitHub Pages

Browsers keep site data per *origin*, which is the host name, not the folder. On GitHub Pages every project site of one account lives at the same host (`USERNAME.github.io`), so **any other web page you publish under that same account can read TickFit's data in the same browser**. This is how browsers work for every site, not something TickFit can change from the inside. If you publish other pages on the same account that you don't fully trust, give TickFit its own custom domain, or host it under its own GitHub account or organisation. It never affects *other people*: their browsers are completely separate from yours.

## How we check the "nothing leaves your device" promise

`node tests/privacy.mjs` runs on every change. It fails if the code starts using anything that could send data away (uploads, web sockets, beacons, cookies, cross-tab messaging, embedded frames), if `fetch` appears anywhere unexpected, if the code names a website that isn't on a short allow list, or if the Content Security Policy is loosened. You can read the allow list at the top of that file.

## Deleting your data

- One plan: **Plans > Delete**.
- Everything: clear this site's data in your browser settings, or remove the installed app.
- Backups you exported are ordinary files you control.
