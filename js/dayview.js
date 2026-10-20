// dayview.js
// Shared building blocks for the three day screens: Today, Workout and Meals.
//
// Every day screen builds a "context" with createCtx(). The context holds the plan, the date, the
// day being shown and a change() function. Pieces register a small "refresher" function, and after
// every change we run them all. That keeps scroll position, focus and animations smooth on a phone
// because ticking something never rebuilds the whole screen.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, getRecord, updateRecord } from './store.js';
import { WATER_STEP_ML, pctFor } from './stats.js';
import { todayStr, addDays, fromStr } from './dates.js';
import { dayIndexFor, dayFor, jumpDelta } from './schedule.js';
import { haptic } from './platform.js';

export const LOCALE = 'en';
const STRIP_DAYS = 21; // days shown before and after the selected date in the week strip

/** Everything a day screen needs, in one place. */
export function createCtx(plan, date, goto) {
  const ctx = {
    plan,
    date,
    goto,
    today: todayStr(),
    idx: dayIndexFor(plan, date), // -1 = a weekday this weekly plan doesn't list, so a rest day
    day: dayFor(plan, date),
    refreshers: [],
    records: () => getState().progress[plan.id] || {},
    rec: () => getRecord(plan.id, date),
    refresh: () => ctx.refreshers.forEach((r) => r()),
    /** Change the saved record, then update everything on screen. */
    change(fn) {
      updateRecord(plan.id, date, fn);
      ctx.refresh();
    },
  };
  return ctx;
}

/** "Monday" or "Today" */
export const dayName = (ctx) => (ctx.date === ctx.today ? 'Today' : fromStr(ctx.date).toLocaleDateString(LOCALE, { weekday: 'long' }));
export const dateText = (ctx) => fromStr(ctx.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });

/** Sheet to jump to any day of the plan. */
export function openJump(ctx) {
  openSheet({
    title: 'Jump to a day',
    build(body, close) {
      body.append(
        h(
          'ul',
          { class: 'jump-list' },
          ctx.plan.days.map((pd, i) => {
            const target = addDays(ctx.today, jumpDelta(ctx.plan, ctx.today, i));
            return h(
              'li',
              {},
              h(
                'button',
                {
                  class: 'jump-item' + (i === ctx.idx ? ' current' : ''),
                  type: 'button',
                  onclick: () => {
                    close();
                    ctx.goto(target);
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

/**
 * "Choose exercises" / "Choose meals": opens the mix-and-match sheet for this date. The sheet's code
 * only loads when tapped. Shows "changed" when this date no longer follows the plan's list.
 */
export function pickButton(ctx, kind) {
  const changed = !!(ctx.plan.picks && ctx.plan.picks[ctx.date] && ctx.plan.picks[ctx.date][kind]);
  return h(
    'button',
    {
      class: 'pick-btn',
      type: 'button',
      'aria-haspopup': 'dialog',
      onclick: async () => {
        const { openPicker } = await import('./pickui.js');
        openPicker({ plan: ctx.plan, date: ctx.date, kind, onDone: () => ctx.goto(ctx.date) });
      },
    },
    icon('edit', 16),
    kind === 'workout' ? 'Choose exercises' : 'Choose meals',
    changed && h('span', { class: 'pill' }, 'changed for this day')
  );
}

/** A small bar for the Workout and Meals screens: previous day, the date (tap to jump), next day. */
export function dateBar(ctx) {
  return h(
    'div',
    { class: 'date-bar' },
    h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Previous day', onclick: () => ctx.goto(addDays(ctx.date, -1)) }, icon('back', 20)),
    h(
      'button',
      { class: 'date-bar-title', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openJump(ctx) },
      h('b', {}, dayName(ctx)),
      h('span', {}, `${dateText(ctx)} · ${ctx.day.label}`),
      icon('chevron-down', 16)
    ),
    h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Next day', onclick: () => ctx.goto(addDays(ctx.date, 1)) }, icon('chevron-right', 20))
  );
}

/** The week strip: days you can scroll sideways. Tap one to open it. Dots show how each day went. */
export function weekStrip(ctx) {
  const strip = h('div', { class: 'strip', role: 'group', 'aria-label': 'Pick a day' });
  const dots = {};
  const setDot = (cd, dot) => {
    const pct = cd > ctx.today ? 0 : pctFor(ctx.plan, ctx.records(), cd);
    dot.className = 'dot ' + (pct === null ? 'rest' : pct >= 100 ? 'full' : pct > 0 ? 'part' : '');
  };
  for (let off = -STRIP_DAYS; off <= STRIP_DAYS; off++) {
    const cd = addDays(ctx.date, off);
    const dt = fromStr(cd);
    const dot = h('span', { class: 'dot' });
    strip.append(
      h(
        'button',
        {
          class: 'chip' + (cd === ctx.date ? ' sel' : '') + (cd === ctx.today ? ' is-today' : ''),
          type: 'button',
          'aria-label': dt.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
          'aria-pressed': String(cd === ctx.date),
          onclick: () => cd !== ctx.date && ctx.goto(cd),
        },
        h('span', { class: 'dow' }, dt.toLocaleDateString(LOCALE, { weekday: 'narrow' })),
        h('span', { class: 'dnum' }, String(dt.getDate())),
        dot
      )
    );
    dots[cd] = dot;
    setDot(cd, dot);
  }
  ctx.refreshers.push(() => setDot(ctx.date, dots[ctx.date]));
  // Centre the selected day once the screen is in the page and sizes exist.
  requestAnimationFrame(() => {
    const sel = strip.querySelector('.sel');
    if (sel) strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
  });
  return strip;
}

/** SVG shapes must be made with createElementNS (h() makes HTML elements, which an <svg> ignores). */
function svgCircle(cls, c, r) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el.setAttribute('class', cls);
  el.setAttribute('cx', String(c));
  el.setAttribute('cy', String(c));
  el.setAttribute('r', String(r));
  return el;
}

/** A progress ring. Returns { el, set(pct, label) }. */
export function ring(size = 72) {
  const c = 32;
  const r = 26;
  const len = 2 * Math.PI * r;
  const fill = svgCircle('ring-fill', c, r);
  fill.style.strokeDasharray = String(len);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'ring-svg');
  svg.append(svgCircle('ring-track', c, r), fill);
  const pct = h('div', { class: 'ring-pct' }, '0%');
  const sub = h('div', { class: 'ring-sub' });
  const el = h('div', { class: 'ring', role: 'img', 'aria-label': 'Day progress', style: `width:${size}px;height:${size}px` }, svg, h('div', { class: 'ring-center' }, pct, sub));
  return {
    el,
    set(value, label) {
      fill.style.strokeDashoffset = String(len * (1 - value / 100));
      fill.classList.toggle('complete', value >= 100);
      el.classList.toggle('complete', value >= 100); // the ring's glow is styled from this
      pct.textContent = `${value}%`;
      sub.textContent = label || '';
    },
  };
}

/** A big, tappable tile that ticks one item (a meal or a supplement). */
export function tickTile(ctx, id, titleNodes, sub, extra) {
  const hit = h(
    'button',
    {
      class: 'tile-hit',
      type: 'button',
      role: 'checkbox',
      'aria-checked': 'false',
      onclick: () => {
        haptic();
        ctx.change((r) => {
          if (r.ticks[id]) delete r.ticks[id];
          else r.ticks[id] = true;
        });
      },
    },
    h('span', { class: 'check static' }, icon('check', 22)),
    h('span', { class: 'tile-text' }, h('span', { class: 'tile-title' }, titleNodes), sub && h('span', { class: 'tile-sub' }, sub), extra && h('span', { class: 'tile-prog' }, extra))
  );
  const li = h('li', { class: 'tile' }, hit);
  ctx.refreshers.push(() => {
    const on = !!ctx.rec().ticks[id];
    hit.setAttribute('aria-checked', String(on));
    li.classList.toggle('done', on);
  });
  return li;
}

/** The water tile: how much you've had, and + / - buttons. Used on Today and on Meals. */
export function waterTile(ctx) {
  const target = ctx.day.extras.waterLiters;
  if (!target) return null;
  const targetMl = target * 1000;
  const val = h('span', { class: 'water-val' });
  const bar = h('div', { class: 'bar-fill' });
  const el = h(
    'div',
    { class: 'tile water' },
    h('div', { class: 'water-icon', 'aria-hidden': 'true' }, icon('drop', 26)),
    h('div', { class: 'water-main' }, h('div', { class: 'water-line' }, val, h('span', { class: 'water-of' }, ` / ${target} L`)), h('div', { class: 'bar' }, bar)),
    h('button', { class: 'round', type: 'button', 'aria-label': 'Remove a glass of water', onclick: () => ctx.change((r) => (r.waterMl = Math.max(0, (r.waterMl || 0) - WATER_STEP_ML))) }, icon('minus', 22)),
    h('button', { class: 'round primary', type: 'button', 'aria-label': `Add ${WATER_STEP_ML} millilitres of water`, onclick: () => ctx.change((r) => (r.waterMl = (r.waterMl || 0) + WATER_STEP_ML)) }, icon('plus', 22))
  );
  ctx.refreshers.push(() => {
    const ml = ctx.rec().waterMl || 0;
    val.textContent = (ml / 1000).toFixed(2).replace(/\.?0+$/, '') || '0';
    bar.style.width = Math.min(100, (ml / targetMl) * 100) + '%';
    bar.classList.toggle('complete', ml >= targetMl);
  });
  return el;
}

/** A section with a heading and an optional note on the right. */
export const section = (title, meta, ...children) => h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, title), meta), ...children);

/** A big progress bar with numbers, used for calories and protein. */
export function meter(label, unit) {
  const val = h('span', { class: 'meter-val' });
  const of = h('span', { class: 'meter-of' });
  const fill = h('div', { class: 'meter-fill' });
  const el = h('div', { class: 'meter' }, h('div', { class: 'meter-top' }, h('span', { class: 'meter-label' }, label), h('span', {}, val, of)), h('div', { class: 'bar' }, fill));
  return {
    el,
    set(done, total) {
      val.textContent = Math.round(done).toLocaleString();
      of.textContent = total ? ` / ${Math.round(total).toLocaleString()} ${unit}` : ` ${unit}`;
      fill.style.width = total ? Math.min(100, (done / total) * 100) + '%' : '0%';
    },
  };
}
