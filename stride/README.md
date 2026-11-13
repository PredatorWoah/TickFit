# Stride for TickFit

Android workout planner for general fitness, strength, and muscle growth. Choose gym machines plus dumbbells, gym dumbbells, or home bodyweight. Generate a seven-day plan and override today without changing the scheduled routine. The profile, history summary, and planned sessions stay on the device. Gemini 3.8 Flash supports a multi-turn chat with selectable exercise suggestions and receives recent workout records only when the history checkbox is selected. A Gemini key is held for the current app session.

Import a TickFit backup to seed the exercise library from its plans, exercise library and alternatives. Use the Exercises tab to browse muscle targets and open YouTube links. A search link is provided when the backup has no usable YouTube link. Today shows the saved workout first. Choose exercises opens a separate editor grouped by muscle, with equipment checkboxes, live match and selection counts, and a fixed Save workout action. The Exercises tab also groups the full library by muscle. Export only checked exercises from Today, the week, or the current Gemini suggestions. The offline catalog contains 275 exercise variations. Chest targets indicate emphasis.

The programming uses a small curated library, with [ACSM's 2026 resistance training position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/) as a reference for training principles. Home plans use bodyweight and have limited pulling options.

## Build and release

Stride lives in the TickFit repository and is released with it: every TickFit release carries `Stride-X.Y.Z.apk`
next to `TickFit-X.Y.Z.apk`, built by `.github/workflows/android.yml` and signed with the same key, so Stride
updates install over each other. Its version is TickFit's version.

To build it yourself: Android SDK Platform 34, JDK 17+ and Gradle 8.9, then from `stride/` run
`gradle :app:assembleDebug` (the APK is in `app/build/outputs/apk/debug/`). Tests run in Node:
`node stride/tests/engine.test.cjs`, and `node tests/stride-contract.mjs` checks that TickFit reads what Stride writes.

## Using it with TickFit

Export a day ("Export to TickFit") or a week ("Export checked week") and open the file in TickFit:
**From Stride** on TickFit's Workout screen puts a day onto the day you are looking at, and
**More > Exercises from Stride** lets you tick which dates of a week change. Only those dates get Stride's exercises
and Stride's name for the day; meals, other days and logged days stay. Week exports start today (days that have
passed are left out). Android's back gesture steps back inside Stride before it closes the app. The Gemini model name
can be changed in Setup if Google renames it.

## TickFit import contract

Stride writes JSON with `app: "tickfit"`, `format: "stride-workout"`, `version: 1`, and `scope: "day"` or `"week"`.
The nested `plan` has `name`, `startDate` and `days`. Each day has `date`, `label`, `workout`, `meals: []` and
`extras`. A workout entry has `id`, `exercise`, `sets`, `reps`, `weight`, `rest`, `notes` and `video` (extra fields
such as `target` are ignored by TickFit). An empty workout marks a rest day, which clears that date in TickFit.
TickFit's reader is `js/stride.js`; change both sides together.
