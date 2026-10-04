# Contributing

Thanks for helping! TickFit is deliberately simple so anyone can read and change it.

## The rules

1. **No build step.** Plain HTML, CSS and JavaScript (ES modules). No npm, no bundlers, no frameworks.
2. **No tracking, no backend, no paid APIs.** Data stays on the device. Do not add network calls. (The optional Gemini feature is the only exception, and it is user opt in.)
3. **Phone first.** Big tap targets (44px or more where you can), one handed use, dark mode by default.
4. **Comment your code** for beginners: say *why*, not just *what*.

## Run it locally

Service workers and ES modules need a web server, not `file://`:

```
python3 -m http.server 8000
```

Then open http://localhost:8000 (use your browser's phone size view to check layouts).

## Tests

```
node tests/all.mjs
```

This runs, with no setup:

- `tests/run.mjs`: the plan parser against valid, messy and broken inputs (`tests/cases.js`). **Found an input that breaks the importer? Add a case.**
- `tests/stats.mjs`: streaks and weekly percentages
- `tests/schedule.mjs`: weekday plans, rest days and jump to a day
- `tests/logging.mjs`: set by set logging and the "last time" lookup
- `tests/safety.mjs`: backup reminder logic
- `tests/builder.mjs`: the plan builder, over 2,700 combinations of answers
- `tests/timer.mjs`: rest time parsing ("90s", "2 min", "1:30")
- `tests/check-sw.mjs`: every app file is listed in `sw.js`

You can also open `tests/parser.test.html` through the local server to run the parser tests in a browser.

## Where things are

| File | What it does |
| --- | --- |
| `js/parser.js` | Turns pasted text into a clean plan, with friendly errors |
| `js/ai.js` | The "Copy AI prompt" text (keep it in sync with the parser) |
| `js/store.js` | localStorage, backups, storage protection |
| `js/schedule.js` | Which plan day lands on which date (cycle and weekday plans) |
| `js/stats.js` | Counting what is done, streaks, last-time lookup, target parsing |
| `js/logging.js` | Set by set logging and workout sessions (start, finish, summary) |
| `js/home.js` | The Today screen (summary, streak, cards) |
| `js/workout.js` | Workout mode: inline sets, the clock, Finish |
| `js/meals.js` | The Meals screen |
| `js/dayview.js` | Shared pieces of the day screens: date bar, week strip, ring, tiles, water |
| `js/sheet.js`, `js/icons.js`, `js/dom.js` | Bottom sheet, SVG icons, tiny DOM helper |
| `js/progress.js` | Streak, week percentage, calendar |
| `js/editor.js` | Editing a plan |
| `js/plans.js`, `js/more.js` | Welcome, plans, new plan and import screens; More (my plan, settings, your data) |
| `js/safety.js`, `js/backup.js` | Backup reminders, share sheet and file backup |
| `js/builder.js`, `js/exercises.js`, `js/foods.js` | The plan builder: maths, exercise library, Indian food library |
| `js/build.js` | The plan builder screen |
| `js/timer.js` | Rest timer |
| `js/extract.js`, `js/gemini.js` | PDF/text reading, optional Gemini |
| `sw.js` | Offline support |
| `data/sample-plan.json` | The built in 4 week sample plan |

**Adding exercises or foods** is the easiest way to contribute: add a line to `js/exercises.js` (tag its equipment, difficulty and any body part it can aggravate) or `js/foods.js` (calories and protein per unit). `node tests/builder.mjs` will tell you if it breaks anything.

## Adding or changing files

- **New file in `js/`, `css/`, `data/` or `icons/`?** Add it to the list in `sw.js` so it works offline, then run `node tests/check-sw.mjs`.
- **Changed anything users would notice?** Bump `CACHE_VERSION` in `sw.js`.
- **Changed the plan format?** Update `js/parser.js`, `js/ai.js`, `js/editor.js`, the README and add test cases.
- **Rendering text?** Use the `h()` helper in `js/dom.js`. Passing a `null` straight to the browser's own `append()` prints the word "null".
- **Icons** come from `icons/icon.svg` and `icons/icon-maskable.svg`. Export them to the PNG sizes listed in `manifest.webmanifest` if you change the design.

## Pull requests

Keep them small and focused, say what you changed and how you tried it (a phone screenshot helps for UI changes). By contributing you agree your work is released under the MIT license.
