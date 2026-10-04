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
- `tests/timer.mjs`: rest time parsing ("90s", "2 min", "1:30")
- `tests/check-sw.mjs`: every app file is listed in `sw.js`

You can also open `tests/parser.test.html` through the local server to run the parser tests in a browser.

## Where things are

| File | What it does |
| --- | --- |
| `js/parser.js` | Turns pasted text into a clean plan, with friendly errors |
| `js/ai.js` | The "Copy AI prompt" text (keep it in sync with the parser) |
| `js/store.js` | localStorage, backup export and import |
| `js/stats.js` | Counting what is done, streaks, weekly percentage |
| `js/today.js` | The Today screen |
| `js/progress.js` | Streak, week percentage, calendar |
| `js/editor.js` | Editing a plan |
| `js/plans.js`, `js/more.js` | Plans list and import, settings and backup |
| `js/timer.js` | Rest timer |
| `js/extract.js`, `js/gemini.js` | PDF/text reading, optional Gemini |
| `sw.js` | Offline support |
| `data/sample-plan.json` | The built in 4 week sample plan |

## Adding or changing files

- **New file in `js/`, `css/`, `data/` or `icons/`?** Add it to the list in `sw.js` so it works offline, then run `node tests/check-sw.mjs`.
- **Changed anything users would notice?** Bump `CACHE_VERSION` in `sw.js`.
- **Changed the plan format?** Update `js/parser.js`, `js/ai.js`, the README and add test cases.
- **Icons** come from `icons/icon.svg` and `icons/icon-maskable.svg`. Export them to the PNG sizes listed in `manifest.webmanifest` if you change the design.

## Pull requests

Keep them small and focused, say what you changed and how you tried it (a phone screenshot helps for UI changes). By contributing you agree your work is released under the MIT license.
