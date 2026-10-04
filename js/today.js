// today.js
// The Today screen: a header with a week strip, then workout / meals / supplements / water as tiles.
// Tap an exercise to open its set-by-set sheet. Tap the round check to tick the whole exercise.
//
// Design note: ticking something does NOT rebuild the screen. Each piece registers a small
// "refresher" function and after every change we just run them all. That keeps scroll position,
// focus and the ring animation smooth on a phone.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, getRecord, updateRecord } from './store.js';
import { mealTotals, WATER_STEP_ML, dayStats, pctFor, exerciseProgress, plannedSets, lastPerformance, formatSets, repsTarget } from './stats.js';
import { rowsFor, saveRows, toggleExercise } from './logging.js';
import { todayStr, addDays, fromStr } from './dates.js';
import { dayIndexFor, dayFor, jumpDelta } from './schedule.js';
import { parseRestSeconds, startRest } from './timer.js';

const LOCALE = 'en';
const RING_R = 26;
const RING_LEN = 2 * Math.PI * RING_R;
const STRIP_DAYS = 21; // days shown before and after the selected date in the week strip

/** SVG shapes must be made with createElementNS (h() makes HTML elements, which an <svg> ignores). */
function ringCircle(cls) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('class', cls);
  c.setAttribute('cx', '32');
  c.setAttribute('cy', '32');
  c.setAttribute('r', String(RING_R));
  return c;
}

/**
 * Draw the Today screen into `root`.
 * @param root   the element to fill
 * @param plan   the active plan
 * @param date   "YYYY-MM-DD" being viewed
 * @param goto   function(date) to change the viewed date
 */
export function renderToday(root, plan, date, goto) {
  clear(root);

  const today = todayStr();
  const idx = dayIndexFor(plan, date); // -1 = a weekday this weekly plan doesn't list, so a rest day
  const day = dayFor(plan, date);
  const records = () => getState().progress[plan.id] || {};
  const rec = () => getRecord(plan.id, date);
  const refreshers = [];
  /** Change the saved record, then update everything on screen. */
  const change = (fn) => {
    updateRecord(plan.id, date, fn);
    refreshers.forEach((r) => r());
  };

  // ---------- header ----------
  const ringFill = ringCircle('ring-fill');
  ringFill.style.strokeDasharray = String(RING_LEN);
  const ringPct = h('div', { class: 'ring-pct' }, '0%');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'ring-svg');
  svg.append(ringCircle('ring-track'), ringFill);
  const status = h('div', { class: 'day-status' });

  const d = fromStr(date);
  const dayTitle = h(
    'button',
    { class: 'day-title', type: 'button', 'aria-haspopup': 'dialog', onclick: openJump },
    h('span', {}, day.label),
    icon('chevron-down', 18)
  );

  // The week strip: a row of days you can scroll sideways. Tap one to open it.
  const strip = h('div', { class: 'strip', role: 'group', 'aria-label': 'Pick a day' });
  const chipFor = {};
  for (let off = -STRIP_DAYS; off <= STRIP_DAYS; off++) {
    const cd = addDays(date, off);
    const dt = fromStr(cd);
    const dot = h('span', { class: 'dot' });
    const chip = h(
      'button',
      {
        class: 'chip' + (cd === date ? ' sel' : '') + (cd === today ? ' is-today' : ''),
        type: 'button',
        'aria-label': dt.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
        'aria-pressed': String(cd === date),
        onclick: () => cd !== date && goto(cd),
      },
      h('span', { class: 'dow' }, dt.toLocaleDateString(LOCALE, { weekday: 'narrow' })),
      h('span', { class: 'dnum' }, String(dt.getDate())),
      dot
    );
    chipFor[cd] = { dot };
    strip.append(chip);
    setDot(cd, dot);
  }
  function setDot(cd, dot) {
    const pct = cd > today ? 0 : pctFor(plan, records(), cd);
    dot.className = 'dot ' + (pct === null ? 'rest' : pct >= 100 ? 'full' : pct > 0 ? 'part' : '');
  }

  root.append(
    h(
      'header',
      { class: 'today-head' },
      h(
        'div',
        { class: 'head-row' },
        h(
          'div',
          { class: 'head-text' },
          h('h1', { class: 'date-main' }, date === today ? 'Today' : d.toLocaleDateString(LOCALE, { weekday: 'long' })),
          h('p', { class: 'date-sub' }, d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })),
          date !== today && h('button', { class: 'link-btn', type: 'button', onclick: () => goto(today) }, 'Back to today')
        ),
        h('div', { class: 'ring', role: 'img', 'aria-label': 'Day progress' }, svg, h('div', { class: 'ring-center' }, ringPct))
      ),
      dayTitle,
      status,
      strip
    )
  );
  refreshers.push(() => {
    const s = dayStats(day, rec());
    ringFill.style.strokeDashoffset = String(RING_LEN * (1 - s.pct / 100));
    ringFill.classList.toggle('complete', s.total > 0 && s.done === s.total);
    ringPct.textContent = `${s.pct}%`;
    status.textContent = s.total === 0 ? 'Rest day. Nothing to tick.' : s.done === s.total ? 'All done. Great work!' : `${s.total - s.done} left to tick`;
    status.classList.toggle('good', s.total > 0 && s.done === s.total);
    setDot(date, chipFor[date].dot);
  });

  /** Sheet to jump to any day of the plan. */
  function openJump() {
    openSheet({
      title: 'Jump to a day',
      build(body, close) {
        body.append(
          h(
            'ul',
            { class: 'jump-list' },
            plan.days.map((pd, i) => {
              const target = addDays(today, jumpDelta(plan, today, i));
              return h(
                'li',
                {},
                h(
                  'button',
                  {
                    class: 'jump-item' + (i === idx ? ' current' : ''),
                    type: 'button',
                    onclick: () => {
                      close();
                      goto(target);
                    },
                  },
                  h('span', { class: 'jump-label' }, pd.label),
                  h('span', { class: 'jump-date' }, fromStr(target).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }))
                )
              );
            })
          )
        );
      },
    });
  }

  // ---------- plan notes for the day ----------
  // Long notes fold away so the workout stays on screen.
  if (day.extras.notes) {
    root.append(
      day.extras.notes.length > 140
        ? h('details', { class: 'callout' }, h('summary', {}, 'Notes for today'), h('p', {}, day.extras.notes))
        : h('p', { class: 'callout' }, day.extras.notes)
    );
  }

  const section = (title, meta, ...children) =>
    h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, title), meta), ...children);

  // ---------- workout ----------
  if (day.workout.length) {
    const meta = h('span', { class: 'sec-meta' });
    refreshers.push(() => {
      const done = day.workout.filter((w) => rec().ticks[w.id]).length;
      meta.textContent = `${done} of ${day.workout.length}`;
    });
    root.append(section('Workout', meta, h('ul', { class: 'tiles' }, day.workout.map(exerciseTile))));
  } else if (day.meals.length) {
    root.append(h('div', { class: 'banner' }, icon('flame', 20), h('span', {}, 'Rest day. Recovery is part of the plan.')));
  }

  function exerciseTile(w) {
    const facts = [];
    if (w.sets || w.reps) facts.push(w.sets && w.reps ? `${w.sets} × ${w.reps}` : w.sets ? `${w.sets} sets` : w.reps);
    if (w.weight) facts.push(/^\d/.test(w.weight) && !/[a-z]/i.test(w.weight) ? `${w.weight} kg` : w.weight);
    if (w.rest) facts.push(`rest ${w.rest}`);

    const progress = h('span', { class: 'tile-prog' });
    const check = h(
      'button',
      {
        class: 'check',
        type: 'button',
        role: 'checkbox',
        'aria-checked': 'false',
        'aria-label': `Mark ${w.exercise} done`,
        onclick: () => change((r) => toggleExercise(r, w, lastPerformance(plan, records(), date, w.exercise))),
      },
      icon('check', 22)
    );
    const body = h(
      'button',
      { class: 'tile-body', type: 'button', onclick: () => openSets(w) },
      h('span', { class: 'tile-title' }, w.exercise),
      facts.length > 0 && h('span', { class: 'tile-sub' }, facts.join(' · ')),
      progress
    );
    const li = h('li', { class: 'tile' }, check, body, h('span', { class: 'chev' }, icon('chevron-right', 20)));
    refreshers.push(() => {
      const r = rec();
      const p = exerciseProgress(w, r);
      const ticked = !!r.ticks[w.id];
      check.setAttribute('aria-checked', String(ticked));
      li.classList.toggle('done', ticked);
      progress.textContent = ticked ? 'Done' : p.done > 0 ? `${p.done} of ${p.total} sets done` : '';
    });
    return li;
  }

  /** The set-by-set sheet for one exercise. */
  function openSets(w) {
    const last = lastPerformance(plan, records(), date, w.exercise);
    let rows = rowsFor(rec(), w, last);
    const save = () => change((r) => saveRows(r, w, rows));
    const restSecs = parseRestSeconds(w.rest);
    // Timed work like "30 min" or "45 sec" has no weight or reps to log, so it only gets a tick.
    const timed = !!w.reps && repsTarget(w.reps) === null;

    openSheet({
      title: w.exercise,
      build(body, close) {
        const target = [`${plannedSets(w)} sets`, w.reps && `${w.reps} reps`, w.weight && `target ${w.weight}`, w.rest && `rest ${w.rest}`].filter(Boolean).join(' · ');
        const list = h('div', { class: 'sets' });
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(w.exercise + ' proper form')}`;

        const numInput = (value, placeholder, label, onValue) => {
          const input = h('input', {
            class: 'set-in',
            type: 'number',
            inputMode: 'decimal',
            min: 0,
            step: 'any',
            placeholder,
            'aria-label': label,
            oninput: (e) => {
              const v = parseFloat(e.target.value);
              onValue(isFinite(v) && v >= 0 ? v : null);
            },
          });
          input.value = value ?? '';
          return input;
        };

        function draw() {
          clear(list);
          list.append(h('div', { class: 'set-head' + (timed ? ' timed' : '') }, h('span', {}, 'Set'), timed ? h('span', {}, 'Target') : [h('span', {}, 'Kg'), h('span', {}, 'Reps')], h('span', {}, '')));
          rows.forEach((s, i) => {
            const chk = h(
              'button',
              {
                class: 'set-check' + (s.done ? ' on' : ''),
                type: 'button',
                role: 'checkbox',
                'aria-checked': String(s.done),
                'aria-label': `Set ${i + 1} done`,
                onclick: () => {
                  s.done = !s.done;
                  save();
                  // Start the rest timer after a finished set (not after the very last one).
                  if (s.done && restSecs && i < rows.length - 1 && getState().settings.autoRest !== false) startRest(restSecs, `${w.exercise}, set ${i + 1} done`);
                  draw();
                },
              },
              icon('check', 22)
            );
            list.append(
              h(
                'div',
                { class: 'set-row' + (s.done ? ' done' : '') + (timed ? ' timed' : '') },
                h('span', { class: 'set-n' }, String(i + 1)),
                timed
                  ? h('span', { class: 'set-timed' }, w.reps)
                  : [numInput(s.w, 'kg', `Set ${i + 1} weight in kilograms`, (v) => ((s.w = v), save())), numInput(s.r, 'reps', `Set ${i + 1} reps`, (v) => ((s.r = v), save()))],
                chk
              )
            );
          });
          list.append(
            h(
              'div',
              { class: 'set-tools' },
              h(
                'button',
                {
                  class: 'btn ghost small',
                  type: 'button',
                  onclick: () => {
                    rows.push({ ...rows[rows.length - 1], done: false });
                    save();
                    draw();
                  },
                },
                icon('plus', 18),
                'Add set'
              ),
              rows.length > 1 &&
                h(
                  'button',
                  {
                    class: 'btn ghost small',
                    type: 'button',
                    onclick: () => {
                      rows.pop();
                      save();
                      draw();
                    },
                  },
                  icon('minus', 18),
                  'Remove set'
                )
            )
          );
        }
        draw();

        // Native append() would print a skipped `null` as the word "null", so drop empty items first.
        body.append(
          ...[
          h('p', { class: 'sheet-target' }, target),
          w.notes && h('p', { class: 'sheet-note' }, w.notes),
          last && h('p', { class: 'last-time' }, h('b', {}, 'Last time '), `(${fromStr(last.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}): ${formatSets(last.sets)}`),
          list,
          h(
            'div',
            { class: 'sheet-actions' },
            h('a', { class: 'btn ghost', href: w.video || searchUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('play', 16), w.video ? 'Watch video' : 'Form video'),
            restSecs && h('button', { class: 'btn ghost', type: 'button', onclick: () => startRest(restSecs, w.exercise) }, icon('timer', 18), `Rest ${w.rest}`)
          ),
          h('button', { class: 'btn primary wide', type: 'button', onclick: close }, 'Done'),
          ].filter(Boolean)
        );
      },
    });
  }

  // ---------- generic tick tile (meals, supplements) ----------
  function tickTile(id, titleNodes, sub, extra) {
    const hit = h(
      'button',
      {
        class: 'tile-hit',
        type: 'button',
        role: 'checkbox',
        'aria-checked': 'false',
        onclick: () =>
          change((r) => {
            if (r.ticks[id]) delete r.ticks[id];
            else r.ticks[id] = true;
          }),
      },
      h('span', { class: 'check static' }, icon('check', 22)),
      h('span', { class: 'tile-text' }, h('span', { class: 'tile-title' }, titleNodes), sub && h('span', { class: 'tile-sub' }, sub), extra && h('span', { class: 'tile-prog' }, extra))
    );
    const li = h('li', { class: 'tile' }, hit);
    refreshers.push(() => {
      const on = !!rec().ticks[id];
      hit.setAttribute('aria-checked', String(on));
      li.classList.toggle('done', on);
    });
    return li;
  }

  // ---------- meals ----------
  if (day.meals.length) {
    const totals = h('span', { class: 'sec-meta' });
    refreshers.push(() => {
      const t = mealTotals(day, rec());
      const bits = [];
      if (t.calories !== null) bits.push(`${t.caloriesEaten ?? 0} / ${t.calories} kcal`);
      if (t.protein !== null) bits.push(`${t.proteinEaten ?? 0} / ${t.protein} g protein`);
      totals.textContent = bits.join(' · ');
    });
    root.append(
      section(
        'Meals',
        totals,
        h(
          'ul',
          { class: 'tiles' },
          day.meals.map((m) => {
            const macros = [];
            if (typeof m.calories === 'number') macros.push(`${m.calories} kcal`);
            if (typeof m.protein === 'number') macros.push(`${m.protein} g protein`);
            return tickTile(m.id, [m.time && h('span', { class: 'time' }, m.time), m.name], m.items.join(', '), macros.join(' · '));
          })
        )
      )
    );
  }

  // ---------- supplements ----------
  if (day.extras.supplements.length) {
    root.append(section('Supplements', null, h('ul', { class: 'tiles' }, day.extras.supplements.map((s, i) => tickTile(`s${i + 1}`, s)))));
  }

  // ---------- water ----------
  if (day.extras.waterLiters) {
    const targetMl = day.extras.waterLiters * 1000;
    const val = h('span', { class: 'water-val' });
    const bar = h('div', { class: 'bar-fill' });
    root.append(
      section(
        'Water',
        null,
        h(
          'div',
          { class: 'tile water' },
          h('div', { class: 'water-icon', 'aria-hidden': 'true' }, icon('drop', 26)),
          h('div', { class: 'water-main' }, h('div', { class: 'water-line' }, val, h('span', { class: 'water-of' }, ` / ${day.extras.waterLiters} L`)), h('div', { class: 'bar' }, bar)),
          h(
            'button',
            { class: 'round', type: 'button', 'aria-label': 'Remove a glass of water', onclick: () => change((r) => (r.waterMl = Math.max(0, (r.waterMl || 0) - WATER_STEP_ML))) },
            icon('minus', 22)
          ),
          h('button', { class: 'round primary', type: 'button', 'aria-label': `Add ${WATER_STEP_ML} millilitres of water`, onclick: () => change((r) => (r.waterMl = (r.waterMl || 0) + WATER_STEP_ML)) }, icon('plus', 22))
        )
      )
    );
    refreshers.push(() => {
      const ml = rec().waterMl || 0;
      val.textContent = (ml / 1000).toFixed(2).replace(/\.?0+$/, '') || '0';
      bar.style.width = Math.min(100, (ml / targetMl) * 100) + '%';
      bar.classList.toggle('complete', ml >= targetMl);
    });
  }

  // ---------- your own notes ----------
  const notes = h('textarea', {
    class: 'notes',
    rows: 3,
    placeholder: 'How did it go? Anything to remember?',
    'aria-label': 'Your notes for this day',
    oninput: (e) =>
      updateRecord(plan.id, date, (r) => {
        r.notes = e.target.value;
      }),
  });
  notes.value = rec().notes || '';
  root.append(section('My notes', null, notes));

  refreshers.forEach((r) => r());

  // Centre the selected day in the week strip (after the screen is in the page so sizes exist).
  requestAnimationFrame(() => {
    const sel = strip.querySelector('.sel');
    if (sel) strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
  });
}
