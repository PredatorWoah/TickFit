// progress.js
// The Progress screen: streak, this week's completion, and a month calendar of past days.

import { h, clear } from './dom.js';
import { getState } from './store.js';
import { currentStreak, longestStreak, weekPercent, pctFor, STREAK_MIN_PCT } from './stats.js';
import { todayStr, fromStr, toStr, addDays } from './dates.js';

const LOCALE = 'en'; // Phase 3 swaps this for the chosen language

// Which month the calendar shows ("YYYY-MM-01"). Kept here so it survives re-draws.
let monthStart = null;

/** 0 = nothing, 1 = a little, 2 = some, 3 = most, 4 = everything. Drives the cell colour. */
function level(pct) {
  if (pct <= 0) return 0;
  if (pct < 40) return 1;
  if (pct < 80) return 2;
  if (pct < 100) return 3;
  return 4;
}

/**
 * @param root  element to fill
 * @param plan  the active plan
 * @param goto  function(date) that opens that date on the Today screen
 */
export function renderProgress(root, plan, goto) {
  clear(root);
  const records = getState().progress[plan.id] || {};
  const today = todayStr();
  if (!monthStart) monthStart = today.slice(0, 7) + '-01';

  const streak = currentStreak(plan, records, today);
  const best = longestStreak(plan, records, today);
  const week = weekPercent(plan, records, today);

  root.append(
    h('h1', { class: 'page-title' }, 'Progress'),
    h(
      'section',
      { class: 'stats' },
      stat('🔥', streak, 'day streak'),
      stat('📅', week === null ? '–' : `${week}%`, 'last 7 days'),
      stat('🏆', best, 'best streak')
    ),
    h('p', { class: 'hint' }, `A day counts toward your streak when you finish at least ${STREAK_MIN_PCT}% of it.`)
  );

  // ----- calendar -----
  const first = fromStr(monthStart);
  const title = first.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': title });

  // Week starts on Monday. getDay(): Sun=0..Sat=6  ->  Mon=0..Sun=6
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < 7; i++) {
    const name = fromStr(addDays('2024-01-01', i)).toLocaleDateString(LOCALE, { weekday: 'narrow' }); // 2024-01-01 is a Monday
    grid.append(h('div', { class: 'cal-dow', 'aria-hidden': 'true' }, name));
  }
  for (let i = 0; i < lead; i++) grid.append(h('div', { class: 'cal-blank' }));

  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= daysInMonth; n++) {
    const date = toStr(new Date(first.getFullYear(), first.getMonth(), n, 12));
    const beforeStart = date < plan.startDate;
    const future = date > today;
    const raw = beforeStart || future ? 0 : pctFor(plan, records, date);
    const pct = raw === null ? 0 : raw; // null = nothing to tick that day (a rest day)
    grid.append(
      h(
        'button',
        {
          class: `cal-day lv${level(pct)}` + (date === today ? ' is-today' : '') + (future ? ' future' : ''),
          disabled: beforeStart,
          'aria-label': `${date}, ${beforeStart ? 'before plan start' : future ? 'upcoming' : raw === null ? 'rest day' : pct + '% done'}`,
          onclick: () => goto(date),
        },
        n
      )
    );
  }

  const shift = (delta) => {
    const d = new Date(first.getFullYear(), first.getMonth() + delta, 1, 12);
    monthStart = toStr(d);
    renderProgress(root, plan, goto);
  };

  root.append(
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'cal-head' },
        h('button', { class: 'icon-btn small', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
        h('h2', { class: 'cal-title' }, title),
        h('button', { class: 'icon-btn small', 'aria-label': 'Next month', onclick: () => shift(1) }, '›')
      ),
      grid,
      h(
        'div',
        { class: 'legend', 'aria-hidden': 'true' },
        'Less',
        [0, 1, 2, 3, 4].map((l) => h('span', { class: `swatch lv${l}` })),
        'More'
      ),
      h('p', { class: 'hint' }, 'Tap a day to open it. You can tick things off for a day you missed.')
    )
  );
}

function stat(icon, value, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-icon', 'aria-hidden': 'true' }, icon), h('div', { class: 'stat-value' }, String(value)), h('div', { class: 'stat-label' }, label));
}
