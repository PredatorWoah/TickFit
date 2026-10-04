// today.js
// The Today screen: header with day picker, progress ring, workout, meals, extras.
//
// Design note: ticking an item does NOT rebuild the screen. Each piece registers a small
// "refresher" function, and after every change we just run them all. That keeps scroll
// position, focus and the ring animation smooth on a phone.

import { h, clear } from './dom.js';
import { getRecord, updateRecord } from './store.js';
import { dayStats, mealTotals, WATER_STEP_ML } from './stats.js';
import { planDayIndex, todayStr, addDays, formatShort } from './dates.js';
import { parseRestSeconds, startRest } from './timer.js';

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Draw the Today screen into `root`.
 * @param root   the element to fill
 * @param plan   the active plan
 * @param date   "YYYY-MM-DD" being viewed
 * @param goto   function(date) to change the viewed date
 */
export function renderToday(root, plan, date, goto) {
  clear(root);

  const dayCount = plan.days.length;
  const idx = planDayIndex(plan.startDate, date, dayCount);
  const day = plan.days[idx];
  const today = todayStr();

  const refreshers = [];
  const rec = () => getRecord(plan.id, date);
  /** Change the saved record, then update everything on screen. */
  const change = (fn) => {
    updateRecord(plan.id, date, fn);
    refreshers.forEach((r) => r());
  };

  // ----- header: date navigation + day picker -----
  const picker = h(
    'select',
    {
      class: 'day-select',
      'aria-label': 'Jump to a day of the plan',
      onchange: (e) => {
        // Jump to the date closest to today that falls on the chosen plan day.
        const target = Number(e.target.value);
        const todayIdx = planDayIndex(plan.startDate, today, dayCount);
        let delta = target - todayIdx;
        if (delta > dayCount / 2) delta -= dayCount;
        if (delta < -dayCount / 2) delta += dayCount;
        goto(addDays(today, delta));
      },
    },
    plan.days.map((d, i) => h('option', { value: i, selected: i === idx }, d.label))
  );

  root.append(
    h(
      'header',
      { class: 'top' },
      h(
        'div',
        { class: 'date-nav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => goto(addDays(date, -1)) }, '‹'),
        h(
          'div',
          { class: 'date-title' },
          h('div', { class: 'date-main' }, date === today ? 'Today' : formatShort(date)),
          h('div', { class: 'date-sub' }, date === today ? formatShort(date) : plan.name)
        ),
        h('button', { class: 'icon-btn', 'aria-label': 'Next day', onclick: () => goto(addDays(date, 1)) }, '›')
      ),
      picker,
      date !== today && h('button', { class: 'link-btn', onclick: () => goto(today) }, 'Back to today')
    )
  );

  // ----- progress ring -----
  const ringFill = h('circle', { class: 'ring-fill', cx: 60, cy: 60, r: RING_RADIUS });
  ringFill.style.strokeDasharray = String(RING_LENGTH);
  const ringPct = h('div', { class: 'ring-pct' }, '0%');
  const ringSub = h('div', { class: 'ring-sub' }, '');
  const ringMsg = h('div', { class: 'ring-msg' }, '');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'ring-svg');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('class', 'ring-track');
  track.setAttribute('cx', '60');
  track.setAttribute('cy', '60');
  track.setAttribute('r', String(RING_RADIUS));
  svg.append(track, ringFill);

  const isRest = day.workout.length === 0;
  root.append(
    h(
      'section',
      { class: 'card hero' },
      h('div', { class: 'ring' }, svg, h('div', { class: 'ring-center' }, ringPct, ringSub)),
      h('div', { class: 'hero-text' }, h('div', { class: 'day-label' }, day.label), ringMsg, isRest && h('span', { class: 'pill' }, 'Rest day'))
    )
  );
  refreshers.push(() => {
    const s = dayStats(day, rec());
    ringFill.style.strokeDashoffset = String(RING_LENGTH * (1 - s.pct / 100));
    ringPct.textContent = `${s.pct}%`;
    ringSub.textContent = `${s.done}/${s.total}`;
    ringMsg.textContent = s.total === 0 ? 'Nothing planned for this day.' : s.done === s.total ? 'All done. Great work!' : `${s.total - s.done} left to tick`;
    ringFill.classList.toggle('complete', s.total > 0 && s.done === s.total);
  });

  // ----- a plan note for the day -----
  if (day.extras.notes) root.append(h('p', { class: 'callout' }, day.extras.notes));

  // ----- tickable row builder -----
  /** A big tappable row. `content` goes next to the tick box; `after` is extra UI (not part of the tap area). */
  function tickRow(id, content, after) {
    const main = h(
      'button',
      {
        class: 'row-main',
        type: 'button',
        role: 'checkbox',
        'aria-checked': 'false',
        onclick: () =>
          change((r) => {
            if (r.ticks[id]) delete r.ticks[id];
            else r.ticks[id] = true;
          }),
      },
      h('span', { class: 'box', 'aria-hidden': 'true' }, '✓'),
      content
    );
    const li = h('li', { class: 'row' }, main, after);
    refreshers.push(() => {
      const on = !!rec().ticks[id];
      main.setAttribute('aria-checked', String(on));
      li.classList.toggle('done', on);
    });
    return li;
  }

  // ----- workout -----
  if (day.workout.length) {
    root.append(
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Workout'),
        h(
          'ul',
          { class: 'rows' },
          day.workout.map((w) => {
            const bits = [];
            if (w.sets && w.reps) bits.push(`${w.sets} × ${w.reps}`);
            else if (w.sets) bits.push(`${w.sets} sets`);
            else if (w.reps) bits.push(w.reps);
            if (w.rest) bits.push(`rest ${w.rest}`);

            const text = h(
              'span',
              { class: 'row-text' },
              h('span', { class: 'row-title' }, w.exercise),
              bits.length > 0 && h('span', { class: 'row-meta' }, bits.join(' · ')),
              w.notes && h('span', { class: 'row-note' }, w.notes)
            );

            // Optional: log the weight you used (kept per exercise per day).
            const weight = h('input', {
              class: 'weight',
              type: 'number',
              inputMode: 'decimal',
              min: 0,
              step: 'any',
              placeholder: 'kg',
              'aria-label': `Weight used for ${w.exercise}`,
              onchange: (e) =>
                change((r) => {
                  const v = parseFloat(e.target.value);
                  if (isFinite(v) && v >= 0) r.weights[w.id] = v;
                  else delete r.weights[w.id];
                }),
            });
            weight.value = rec().weights[w.id] ?? '';

            // Rest timer button, only when the plan's "rest" text is something we can read as a time.
            const restSecs = parseRestSeconds(w.rest);
            const restBtn =
              restSecs &&
              h('button', { class: 'rest-btn', type: 'button', 'aria-label': `Start ${w.rest} rest timer`, onclick: () => startRest(restSecs, w.exercise) }, `⏱ ${w.rest}`);

            return tickRow(w.id, text, h('div', { class: 'row-after' }, h('label', { class: 'weight-wrap' }, weight), restBtn));
          })
        )
      )
    );
  }

  // ----- meals -----
  if (day.meals.length) {
    const totals = h('div', { class: 'totals' });
    root.append(
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Meals'),
        h(
          'ul',
          { class: 'rows' },
          day.meals.map((m) => {
            const macros = [];
            if (typeof m.calories === 'number') macros.push(`${m.calories} kcal`);
            if (typeof m.protein === 'number') macros.push(`${m.protein} g protein`);
            const text = h(
              'span',
              { class: 'row-text' },
              h('span', { class: 'row-title' }, m.time && h('span', { class: 'time' }, m.time), m.name),
              h('span', { class: 'row-meta' }, m.items.join(', ')),
              macros.length > 0 && h('span', { class: 'row-note' }, macros.join(' · '))
            );
            return tickRow(m.id, text);
          })
        ),
        totals
      )
    );
    refreshers.push(() => {
      const t = mealTotals(day, rec());
      clear(totals);
      if (t.calories !== null) totals.append(h('div', {}, h('b', {}, `${t.caloriesEaten ?? 0}`), ` / ${t.calories} kcal`));
      if (t.protein !== null) totals.append(h('div', {}, h('b', {}, `${t.proteinEaten ?? 0}`), ` / ${t.protein} g protein`));
      totals.hidden = t.calories === null && t.protein === null;
    });
  }

  // ----- extras: supplements and water -----
  if (day.extras.supplements.length) {
    root.append(
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Supplements'),
        h(
          'ul',
          { class: 'rows' },
          day.extras.supplements.map((s, i) => tickRow(`s${i + 1}`, h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, s))))
        )
      )
    );
  }

  if (day.extras.waterLiters) {
    const targetMl = day.extras.waterLiters * 1000;
    const waterText = h('div', { class: 'water-text' });
    const bar = h('div', { class: 'bar-fill' });
    const minus = h(
      'button',
      { class: 'btn ghost', type: 'button', 'aria-label': 'Remove a glass of water', onclick: () => change((r) => (r.waterMl = Math.max(0, (r.waterMl || 0) - WATER_STEP_ML))) },
      '−'
    );
    const plus = h(
      'button',
      { class: 'btn', type: 'button', onclick: () => change((r) => (r.waterMl = (r.waterMl || 0) + WATER_STEP_ML)) },
      `+ ${WATER_STEP_ML} ml`
    );
    root.append(
      h('section', { class: 'card' }, h('h2', {}, 'Water'), waterText, h('div', { class: 'bar' }, bar), h('div', { class: 'water-btns' }, minus, plus))
    );
    refreshers.push(() => {
      const ml = rec().waterMl || 0;
      waterText.replaceChildren(h('b', {}, (ml / 1000).toFixed(2).replace(/\.?0+$/, '') || '0'), ` / ${day.extras.waterLiters} L`);
      bar.style.width = Math.min(100, (ml / targetMl) * 100) + '%';
      bar.classList.toggle('complete', ml >= targetMl);
    });
  }

  // ----- your own notes for the day -----
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
  root.append(h('section', { class: 'card' }, h('h2', {}, 'My notes'), notes));

  refreshers.forEach((r) => r());
}
