# Stride for TickFit

Android workout planner for general fitness, strength, and muscle growth. Choose gym machines plus dumbbells, gym dumbbells, or home bodyweight. Generate a seven-day plan and override today without changing the scheduled routine. The profile, history summary, and planned sessions stay on the device. Gemini 3.8 Flash supports a multi-turn chat with selectable exercise suggestions and receives recent workout records only when the history checkbox is selected. A Gemini key is held for the current app session.

Import a TickFit backup to seed the exercise library from its plans, exercise library and alternatives. Use the Exercises tab to browse muscle targets and open YouTube links. A search link is provided when the backup has no usable YouTube link. Today shows the saved workout first. Choose exercises opens a separate editor grouped by muscle, with equipment checkboxes, live match and selection counts, and a fixed Save workout action. The Exercises tab also groups the full library by muscle. Export only checked exercises from Today, the week, or the current Gemini suggestions. The offline catalog contains 275 exercise variations. Chest targets indicate emphasis.

The programming uses a small curated library, with [ACSM's 2026 resistance training position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/) as a reference for training principles. Home plans use bodyweight and have limited pulling options.

## Build

Install Android SDK Platform 34, JDK 17 and Gradle 8.9. From this directory run `gradle :app:assembleDebug`. The APK is in `app/build/outputs/apk/debug/`. The included GitHub Actions workflow can also build it. Use the same private signing key across any releases you want Android to install as updates.

## TickFit import contract

Stride writes JSON with `app: "tickfit"`, `format: "stride-workout"`, `version: 1`, and `scope: "day"` or `"week"`. The nested `plan` has `name`, `startDate` and `days`. A day export has one date and a week export has seven consecutive dates, including rest days. Each day has `date`, `label`, `workout`, `meals: []` and TickFit-compatible `extras`. A workout entry has `id`, `exercise`, `sets`, `reps`, `weight`, `rest`, `notes` and `video`. An empty workout marks a rest day.

For a dedicated TickFit importer, validate the envelope and pass the nested plan through `parsePlanText`. For a single-day import, use the original `days[0].date` as the default target for a date-specific workout edit. For a week, offer to add the plan or apply the workouts to the stated dates. Preserve meal fields and existing completed workout records when updating an existing plan. Keep explicit dates from the envelope when applying date-specific changes, since TickFit's plan parser returns normalized plan days. For the current TickFit UI, the nested `plan` object can be pasted into its standard plan importer as a separate plan.
