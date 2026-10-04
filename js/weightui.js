// weightui.js
// Everything on screen for body weight: the small tile on Today, the log sheet, and the chart card on Progress.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, setBodyWeight } from './store.js';
import { todayStr, fromStr } from './dates.js';
import { bodyWeightKg } from './burn.js';
import { entries, latest, average7, weekChange, formatDelta, chartPoints, validWeight } from './weight.js';

const LOCALE = 'en';
const log = () => getState().bodyLog || {};
const shortDate = (d) => fromStr(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });

/** A coloured chip: green when it matches the goal direction is a personal thing, so we stay neutral and just show the number. */
const deltaChip = (delta) => (delta === null || delta === undefined ? null : h('span', { class: 'delta' }, formatDelta(delta)));

/** Sheet to log (or fix) the weight for one day. `done` runs after saving so the screen can refresh. */
export function openWeightSheet(date, done = () => {}) {
  openSheet({
    title: date === todayStr() ? "Today's weight" : `Weight on ${shortDate(date)}`,
    build(body, close) {
      const existing = log()[date];
      const start = existing ?? (latest(log(), date) || {}).kg ?? bodyWeightKg(getState().settings, log(), date);
      const input = h('input', { type: 'number', inputmode: 'decimal', min: '20', max: '400', step: '0.1', value: String(start), 'aria-label': 'Body weight in kilograms' });
      const nudge = (d) => {
        const cur = validWeight(input.value) ?? start;
        input.value = (Math.round((cur + d) * 10) / 10).toFixed(1);
      };
      const error = h('p', { class: 'msg warn', hidden: true }, 'Enter a weight between 20 and 400 kg.');
      body.append(
        ...[
          h('p', { class: 'hint' }, 'Weigh yourself at the same time each day, ideally in the morning. Daily numbers wobble by a kilo or two, so TickFit shows your 7 day average.'),
          h(
            'div',
            { class: 'weight-input' },
            h('button', { class: 'round', type: 'button', 'aria-label': 'Lower by 0.1 kilo', onclick: () => nudge(-0.1) }, icon('minus', 22)),
            h('label', { class: 'weight-field' }, input, h('span', {}, 'kg')),
            h('button', { class: 'round primary', type: 'button', 'aria-label': 'Raise by 0.1 kilo', onclick: () => nudge(0.1) }, icon('plus', 22))
          ),
          error,
          h(
            'button',
            {
              class: 'btn primary wide big',
              type: 'button',
              onclick: () => {
                if (setBodyWeight(date, input.value) === null) {
                  error.hidden = false;
                  return;
                }
                close();
                done();
              },
            },
            'Save'
          ),
          existing !== undefined &&
            h('button', { class: 'btn danger wide', type: 'button', onclick: () => { setBodyWeight(date, null); close(); done(); } }, 'Remove this entry'),
        ].filter(Boolean)
      );
    },
  });
}

/** The small tile on Today. */
export function weightTile(onChange) {
  const today = todayStr();
  const now = log()[today];
  const avg = average7(log(), today);
  const wk = weekChange(log(), today);
  const sub = !entries(log()).length ? 'Track it to see your weekly change' : wk ? `7 day average ${avg} kg` : avg !== null ? `7 day average ${avg} kg` : `Last: ${latest(log(), today).kg} kg on ${shortDate(latest(log(), today).date)}`;
  return h(
    'button',
    { class: 'tile weight-tile', type: 'button', onclick: () => openWeightSheet(today, onChange) },
    h('div', { class: 'water-icon weight-icon', 'aria-hidden': 'true' }, icon('scale', 26)),
    h('div', { class: 'water-main' }, h('div', { class: 'water-line' }, now !== undefined ? h('span', { class: 'water-val' }, String(now), h('span', { class: 'water-of' }, ' kg')) : h('span', { class: 'weight-cta' }, 'Log weight')), h('div', { class: 'tile-sub' }, sub)),
    wk ? deltaChip(wk.delta) : null
  );
}

// ----- the chart -----

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
};

function chart(points) {
  const W = 320;
  const H = 150;
  const pad = { l: 38, r: 10, t: 10, b: 24 };
  const kgs = points.flatMap((p) => [p.kg, p.avg]);
  let lo = Math.floor(Math.min(...kgs) - 0.5);
  let hi = Math.ceil(Math.max(...kgs) + 0.5);
  if (hi - lo < 2) hi = lo + 2;
  const t0 = fromStr(points[0].date).getTime();
  const span = Math.max(1, fromStr(points[points.length - 1].date).getTime() - t0);
  const x = (p) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : ((fromStr(p.date).getTime() - t0) / span) * (W - pad.l - pad.r));
  const y = (kg) => pad.t + (1 - (kg - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wchart', role: 'img', 'aria-label': `Weight chart, latest ${points[points.length - 1].kg} kilograms` });
  for (const v of [lo, (lo + hi) / 2, hi]) {
    el.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'w-grid' }), svg('text', { x: pad.l - 6, y: y(v) + 4, class: 'w-label', 'text-anchor': 'end' }, String(Math.round(v * 10) / 10)));
  }
  if (points.length > 1) {
    el.append(svg('polyline', { points: points.map((p) => `${x(p)},${y(p.avg)}`).join(' '), class: 'w-avg' }));
  }
  for (const p of points) el.append(svg('circle', { cx: x(p), cy: y(p.kg), r: 3.5, class: 'w-dot' }));
  el.append(svg('text', { x: pad.l, y: H - 6, class: 'w-label' }, shortDate(points[0].date)), svg('text', { x: W - pad.r, y: H - 6, class: 'w-label', 'text-anchor': 'end' }, shortDate(points[points.length - 1].date)));
  return el;
}

let range = 30; // days shown on the chart; survives re-draws

/** The Weight card on the Progress screen. */
export function weightCard(redraw) {
  const today = todayStr();
  const all = entries(log());
  const wk = weekChange(log(), today);
  const card = h('section', { class: 'card weight-card', 'aria-label': 'Body weight' }, h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, 'Body weight'), h('button', { class: 'btn small primary', type: 'button', onclick: () => openWeightSheet(today, redraw) }, icon('scale', 18), log()[today] !== undefined ? 'Edit today' : 'Log today')));

  if (!all.length) {
    card.append(h('p', { class: 'hint' }, 'Log your weight each morning and TickFit charts it and shows how much you gained or lost each week. It stays on this phone and is included in your backup.'));
    return card;
  }

  const last = latest(log(), today);
  card.append(
    h(
      'div',
      { class: 'weight-hero' },
      h('div', { class: 'sum-num' }, String(last.kg), h('small', {}, ' kg')),
      h('div', { class: 'sum-label' }, last.date === today ? 'today' : `on ${shortDate(last.date)}`, wk ? deltaChip(wk.delta) : null, wk ? h('span', {}, wk.basis === 'average' ? 'vs last week (averages)' : 'this week') : null)
    ),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Chart range' }, [30, 90].map((d) => h('button', { type: 'button', 'aria-pressed': String(range === d), onclick: () => { range = d; redraw(); } }, `${d} days`)))
  );

  const pts = chartPoints(log(), today, range);
  card.append(pts.length ? chart(pts) : h('p', { class: 'hint' }, `No weigh-ins in the last ${range} days.`));
  card.append(
    h('h3', { class: 'sum-sub' }, 'Recent'),
    h(
      'ul',
      { class: 'lift-list' },
      all.slice(-7).reverse().map((e) =>
        h('li', { class: 'lift' }, h('span', { class: 'lift-name' }, shortDate(e.date)), h('span', { class: 'lift-now' }, `${e.kg} kg`), h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Edit weight on ${shortDate(e.date)}`, onclick: () => openWeightSheet(e.date, redraw) }, icon('edit', 18)))
      )
    )
  );
  return card;
}
