// prui.js
// Personal records on the Progress screen, and a chart of one exercise's estimated 1 rep max over time.
// The numbers come from gym.js (recordHistory, e1rmSeries); this only draws them.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { recordHistory, e1rmSeries } from './gym.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const short = (date) => {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
};

/** The "Personal records" card: the latest new bests, each opening that exercise's chart. Null with none yet. */
export function recordsCard(plan, records, today) {
  const all = recordHistory(plan, records, today);
  if (!all.length) return null;
  const shown = all.slice(0, 8);
  return h(
    'section',
    { class: 'card pr-card' },
    h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, 'Personal records'), h('span', { class: 'pill' }, `${all.length} so far`)),
    h(
      'ul',
      { class: 'lift-list' },
      shown.map((r) =>
        h(
          'li',
          {},
          h(
            'button',
            { class: 'lift rich pr-row', type: 'button', onclick: () => openLiftChart(plan, records, today, r.exercise), 'aria-label': `${r.exercise}, ${r.w} kilograms for ${r.r} reps on ${short(r.date)}. Show the chart` },
            h('span', { class: 'lift-name' }, icon('trophy', 16), ' ', r.exercise),
            h('span', { class: 'lift-now' }, `${r.w} kg`, h('small', {}, ` × ${r.r}`)),
            h('span', { class: 'delta up' }, `+${Math.round((r.e1rm - r.before) * 10) / 10}`),
            h('small', { class: 'lift-sub' }, `${short(r.date)} · 1 rep max about ${Math.round(r.e1rm)} kg`)
          )
        )
      )
    ),
    h('p', { class: 'hint tight' }, 'A record is a set that beats your best before it, counting weight and reps together. Tap one for its chart.')
  );
}

/** A sheet with a line chart of an exercise's best estimated 1 rep max per session. */
export function openLiftChart(plan, records, today, name) {
  const pts = e1rmSeries(plan, records, today, name);
  openSheet({
    title: name,
    build(body) {
      if (pts.length < 2) {
        body.append(h('p', { class: 'hint' }, pts.length ? 'Only one session logged so far. The chart appears after the next one.' : 'No weights logged for this exercise yet.'));
        return;
      }
      const W = 320;
      const H = 170;
      const pad = { l: 34, r: 10, t: 12, b: 24 };
      const vals = pts.map((p) => p.e1rm);
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      if (hi - lo < 4) (lo -= 2), (hi += 2);
      const x = (i) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
      const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
      const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wchart lift-chart', role: 'img', 'aria-label': `Estimated 1 rep max for ${name}, from ${Math.round(vals[0])} to ${Math.round(vals[vals.length - 1])} kilograms` });
      for (const v of [lo, (lo + hi) / 2, hi]) {
        el.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'w-grid' }));
        const t = svg('text', { x: pad.l - 6, y: y(v) + 3, class: 'w-label', 'text-anchor': 'end' });
        t.textContent = String(Math.round(v));
        el.append(t);
      }
      el.append(svg('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.e1rm)}`).join(' '), class: 'w-avg' }));
      const best = Math.max(...vals);
      pts.forEach((p, i) => el.append(svg('circle', { cx: x(i), cy: y(p.e1rm), r: p.e1rm === best ? 4.5 : 3, class: p.e1rm === best ? 'lift-dot best' : 'lift-dot' })));
      for (const [i, anchor] of [[0, 'start'], [pts.length - 1, 'end']]) {
        const t = svg('text', { x: x(i), y: H - 6, class: 'w-label', 'text-anchor': anchor });
        t.textContent = short(pts[i].date);
        el.append(t);
      }
      const first = pts[0];
      const last = pts[pts.length - 1];
      const top = pts.find((p) => p.e1rm === best);
      body.append(
        el,
        h(
          'div',
          { class: 'sum-grid' },
          h('div', { class: 'sum-tile' }, h('div', { class: 'sum-num' }, `${Math.round(last.e1rm)}`, h('small', {}, ' kg')), h('div', { class: 'sum-label' }, 'latest 1 rep max (estimate)')),
          h('div', { class: 'sum-tile' }, h('div', { class: 'sum-num' }, `${last.e1rm >= first.e1rm ? '+' : ''}${Math.round((last.e1rm - first.e1rm) * 10) / 10}`, h('small', {}, ' kg')), h('div', { class: 'sum-label' }, `since ${short(first.date)}`))
        ),
        h('p', { class: 'hint' }, `Best: ${top.w} kg × ${top.r} on ${short(top.date)}. ${pts.length} sessions. The estimate (Epley formula) turns any weight and reps into one number, so heavier and longer sets compare fairly.`)
      );
    },
  });
}
