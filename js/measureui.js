// measureui.js
// The "Body measurements" card on Progress and its log sheet. Numbers and rules live in measure.js.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, setMeasurements } from './store.js';
import { todayStr } from './dates.js';
import { PARTS, measureSummary, validCm } from './measure.js';

const short = (date) => {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
};

/** The card. `redraw` draws the Progress screen again after a change. */
export function measureCard(redraw) {
  const log = getState().measureLog || {};
  const rows = measureSummary(log);
  const today = todayStr();
  const card = h(
    'section',
    { class: 'card measure-card' },
    h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, 'Body measurements'), h('button', { class: 'btn small', type: 'button', onclick: () => openMeasureSheet(today, redraw) }, icon('edit', 18), log[today] ? 'Edit today' : 'Measure'))
  );
  if (!rows.length) {
    card.append(h('p', { class: 'hint' }, 'Waist, chest, hips, arms and thighs, in cm. When the scale stops moving, the tape often still shows progress. Once every week or two is plenty, same time of day.'));
    return card;
  }
  card.append(
    h(
      'ul',
      { class: 'measure-list' },
      rows.map((r) =>
        h(
          'li',
          {},
          h('span', { class: 'measure-name' }, r.label),
          h('span', { class: 'measure-now' }, `${r.latest}`, h('small', {}, ' cm')),
          r.firstDate !== r.latestDate ? h('span', { class: 'delta' + (r.change < 0 ? ' up' : r.change > 0 ? ' down' : '') }, `${r.change > 0 ? '+' : ''}${r.change} cm`) : h('span', { class: 'delta' }, 'first'),
          h('small', { class: 'measure-sub' }, r.firstDate !== r.latestDate ? `since ${short(r.firstDate)} (${r.first} cm)` : `measured ${short(r.latestDate)}`)
        )
      )
    ),
    h('p', { class: 'hint tight' }, 'Green means smaller. If you are building muscle, a bigger chest or arm is the good kind of red.')
  );
  return card;
}

export function openMeasureSheet(date, onDone) {
  openSheet({
    title: 'Body measurements',
    build(body, close) {
      const now = (getState().measureLog || {})[date] || {};
      const inputs = PARTS.map(([key, label]) => {
        const input = h('input', { class: 'text-input', type: 'number', inputMode: 'decimal', min: 10, max: 250, step: '0.1', placeholder: 'cm', value: now[key] ?? '', 'aria-label': `${label} in centimetres` });
        return { key, input, row: h('label', { class: 'measure-in' }, h('span', {}, label), input, h('span', { class: 'ext' }, 'cm')) };
      });
      body.append(
        h('p', { class: 'hint' }, 'Measure on bare skin, tape snug but not tight. Waist at the belly button, arm and thigh at the widest point. Leave any blank.'),
        ...inputs.map((x) => x.row),
        h(
          'button',
          {
            class: 'btn primary wide',
            type: 'button',
            onclick: () => {
              const values = {};
              let bad = false;
              for (const { key, input } of inputs) {
                if (input.value === '') continue;
                const v = validCm(input.value);
                if (v === null) bad = true;
                else values[key] = v;
              }
              if (bad) return toast('Use centimetres between 10 and 250');
              setMeasurements(date, values);
              close();
              toast(Object.keys(values).length ? 'Measurements saved' : 'Measurements cleared');
              onDone();
            },
          },
          'Save'
        )
      );
    },
  });
}
