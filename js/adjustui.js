// adjustui.js
// Let people correct the workout time and calories for a day, so the numbers can be as accurate as their own
// watch, gym machine or memory. Typed numbers win over TickFit's estimate (see burn.js, record.manual).

import { h } from './dom.js';
import { toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, getRecord, updateRecord } from './store.js';
import { dayFor } from './schedule.js';
import { exerciseBurn, manualOf, hasManual, validManual, bodyWeightKg, burnFactor, MANUAL_MINUTES, MANUAL_KCAL } from './burn.js';
import { todayStr, fromStr, addDays } from './dates.js';

const LOCALE = 'en';
const dayText = (date) => fromStr(date).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

/** Body weight and calibration for the estimate, read fresh each time. */
function burnInputs() {
  const st = getState();
  return { kg: bodyWeightKg(st.settings, st.bodyLog, todayStr()), factor: burnFactor(st.settings) };
}

/**
 * Sheet to set (or clear) the time and calories for one day.
 * @param plan    the plan
 * @param date    "YYYY-MM-DD"
 * @param onDone  called after saving so the screen can redraw
 */
export function openAdjustSheet({ plan, date, onDone = () => {} }) {
  openSheet({
    title: date === todayStr() ? "Today's workout" : `Workout on ${dayText(date)}`,
    build(body, close) {
      const { kg, factor } = burnInputs();
      const rec = getRecord(plan.id, date);
      const est = exerciseBurn(dayFor(plan, date), { ...rec, manual: null }, kg, factor); // the estimate without anything typed in
      const manual = manualOf(rec);

      const field = (label, unit, value, placeholder, min, max, aria) => {
        const input = h('input', { type: 'number', inputmode: 'decimal', min: String(min), max: String(max), step: '1', placeholder, value: value === null ? '' : String(value), 'aria-label': aria });
        return { input, el: h('label', { class: 'adjust-field' }, h('span', { class: 'adjust-label' }, label), h('span', { class: 'adjust-box' }, input, h('span', { class: 'adjust-unit' }, unit))) };
      };
      const minutes = field('Workout time', 'min', manual.minutes, est.minutes ? String(est.minutes) : '45', MANUAL_MINUTES[0], MANUAL_MINUTES[1], 'Workout time in minutes');
      const kcal = field('Calories burnt', 'kcal', manual.kcal, est.kcal ? String(est.kcal) : '300', MANUAL_KCAL[0], MANUAL_KCAL[1], 'Calories burnt');
      const error = h('p', { class: 'msg warn', hidden: true });

      const write = (m, k) => {
        updateRecord(plan.id, date, (r) => {
          if (m === null && k === null) delete r.manual;
          else r.manual = { minutes: m, kcal: k };
        });
        close();
        toast(m === null && k === null ? 'Back to the estimate' : 'Saved');
        onDone();
      };
      const save = () => {
        const m = minutes.input.value.trim() === '' ? null : validManual(minutes.input.value, ...MANUAL_MINUTES);
        const k = kcal.input.value.trim() === '' ? null : validManual(kcal.input.value, ...MANUAL_KCAL);
        if ((minutes.input.value.trim() !== '' && m === null) || (kcal.input.value.trim() !== '' && k === null)) {
          error.textContent = `Time can be ${MANUAL_MINUTES[0]} to ${MANUAL_MINUTES[1]} minutes and calories ${MANUAL_KCAL[0]} to ${MANUAL_KCAL[1].toLocaleString()}.`;
          error.hidden = false;
          return;
        }
        write(m, k);
      };

      body.append(
        ...[
          est.items.length > 0 && !(est.items.length === 1 && est.items[0].id === 'manual')
            ? h('p', { class: 'hint' }, `TickFit's estimate from your logged sets: about ${est.minutes} min and ${est.kcal} kcal. Type your own numbers if you know better, for example from a watch or a gym machine. Leave a box empty to keep the estimate for it.`)
            : h('p', { class: 'hint' }, 'No sets are logged for this day. If you trained anyway, type the time and calories yourself and they count in your weekly and monthly totals.'),
          h('div', { class: 'adjust-fields' }, minutes.el, kcal.el),
          error,
          h('button', { class: 'btn primary wide big', type: 'button', onclick: save }, 'Save'),
          hasManual(rec) && h('button', { class: 'btn wide', type: 'button', onclick: () => write(null, null) }, icon('swap', 18), "Use TickFit's estimate again"),
        ].filter(Boolean)
      );
    },
  });
}

/**
 * Sheet listing the days of a week or month, each tappable to adjust its time and calories.
 * @param start, end  the first and last day to list (days after today are left out)
 */
export function openEditDaysSheet({ plan, start, end, onDone = () => {} }) {
  openSheet({
    title: 'Edit days',
    build(body, close) {
      const { kg, factor } = burnInputs();
      const today = todayStr();
      const last = end < today ? end : today;
      const rows = [];
      for (let d = last; d >= start && d >= plan.startDate; d = addDays(d, -1)) {
        const rec = getRecord(plan.id, d);
        const burn = exerciseBurn(dayFor(plan, d), rec, kg, factor);
        const text = burn.kcal || burn.minutes ? `${burn.minutes} min · ${burn.kcal} kcal` : 'nothing logged';
        rows.push(
          h(
            'li',
            {},
            h(
              'button',
              {
                class: 'edit-day',
                type: 'button',
                onclick: () => {
                  close();
                  setTimeout(() => openAdjustSheet({ plan, date: d, onDone }), 380); // wait for this sheet to finish closing
                },
              },
              h('span', { class: 'edit-day-main' }, h('b', {}, dayText(d)), h('small', {}, dayFor(plan, d).label)),
              h('span', { class: 'edit-day-val' }, text, hasManual(rec) ? h('em', { class: 'edited-tag' }, 'edited') : null),
              icon('chevron-right', 18)
            )
          )
        );
      }
      body.append(h('p', { class: 'hint' }, 'Tap a day to correct its workout time and calories, or to add a workout you did without logging sets.'), rows.length ? h('ul', { class: 'edit-days' }, rows) : h('p', { class: 'hint' }, 'No days to show yet.'));
    },
  });
}
