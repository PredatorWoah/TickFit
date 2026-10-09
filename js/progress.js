// progress.js
// The Progress screen: streak, this week's completion, and a month calendar of past days.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { getState } from './store.js';
import { currentStreak, longestStreak, weekPercent, pctFor, STREAK_MIN_PCT } from './stats.js';
import { todayStr, fromStr, toStr, addDays } from './dates.js';
import { periodRange, shiftAnchor, summarize } from './summary.js';
import { bodyWeightKg, burnFactor } from './burn.js';
import { openEditDaysSheet } from './adjustui.js';
import { weightCard, openWeightSheet } from './weightui.js';
import { formatDelta } from './weight.js';
import { liftFact } from './lift.js';

const LOCALE = 'en'; // Phase 3 swaps this for the chosen language

// Which month the calendar shows ("YYYY-MM-01"). Kept here so it survives re-draws.
let monthStart = null;
// Which summary is showing: a week or a month, and a date inside it.
const sum = { kind: 'week', anchor: null, allBurn: false, allLifts: false };

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
      stat('flame', streak, 'day streak'),
      stat('calendar', week === null ? '–' : `${week}%`, 'last 7 days'),
      stat('trophy', best, 'best streak')
    ),
    h('p', { class: 'hint' }, `A day counts toward your streak when you finish at least ${STREAK_MIN_PCT}% of it.`),
    summaryCard(root, plan, records, today, goto),
    weightCard(() => renderProgress(root, plan, goto))
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
        h('button', { class: 'icon-btn small', 'aria-label': 'Previous month', onclick: () => shift(-1) }, icon('back', 20)),
        h('h2', { class: 'cal-title' }, title),
        h('button', { class: 'icon-btn small', 'aria-label': 'Next month', onclick: () => shift(1) }, icon('chevron-right', 20))
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

function stat(iconName, value, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-icon', 'aria-hidden': 'true' }, icon(iconName, 26)), h('div', { class: 'stat-value' }, String(value)), h('div', { class: 'stat-label' }, label));
}

// ----- weekly / monthly summary -----

const fmt = (n) => Math.round(n).toLocaleString();
/** Native append prints false and null as text, so drop them first. */
const add = (el, ...kids) => el.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));

/** "+12%" / "-8%" chip, or nothing when there is no earlier period to compare with. */
function delta(pct, hasPrev) {
  if (pct === null || !hasPrev) return null;
  return h('span', { class: 'delta ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : '') }, `${pct > 0 ? '+' : ''}${pct}%`);
}

/** One number tile: big value, small label, optional change chip. */
function big(value, unit, label, chip) {
  return h('div', { class: 'sum-tile' }, h('div', { class: 'sum-num' }, value, unit && h('small', {}, ' ' + unit)), h('div', { class: 'sum-label' }, label, chip));
}

function summaryCard(root, plan, records, today, goto) {
  if (!sum.anchor) sum.anchor = today;
  const range = periodRange(sum.kind, sum.anchor);
  const st = getState().settings;
  const bodyKg = bodyWeightKg(st, getState().bodyLog, today);
  const s = summarize(plan, records, range, bodyKg, today, getState().bodyLog, burnFactor(st));
  const redraw = () => {
    const y = window.scrollY;
    renderProgress(root, plan, goto);
    window.scrollTo(0, y);
  };

  const isNow = range.start <= today && today <= range.end;
  const dayText = (d) => fromStr(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  const title = sum.kind === 'month' ? fromStr(range.start).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) : isNow ? 'This week' : `${dayText(range.start)} to ${dayText(range.end)}`;
  const vsWord = sum.kind === 'month' ? 'last month' : 'last week';

  const seg = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Summary period' },
    ['week', 'month'].map((k) =>
      h('button', { type: 'button', 'aria-pressed': String(sum.kind === k), onclick: () => { sum.kind = k; sum.anchor = today; redraw(); } }, k === 'week' ? 'Weekly' : 'Monthly')
    )
  );
  const nav = h(
    'div',
    { class: 'cal-head' },
    h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Previous ' + sum.kind, onclick: () => { sum.anchor = shiftAnchor(sum.kind, sum.anchor, -1); redraw(); } }, icon('back', 20)),
    h('h2', { class: 'cal-title' }, title),
    h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Next ' + sum.kind, disabled: isNow, onclick: () => { sum.anchor = shiftAnchor(sum.kind, sum.anchor, 1); redraw(); } }, icon('chevron-right', 20))
  );

  const card = h('section', { class: 'card sum', 'aria-label': 'Summary' }, seg, nav);

  if (!s.workouts) {
    card.append(h('p', { class: 'hint sum-empty' }, 'No workouts logged in this period yet. Tick your sets on the Workout tab and your summary builds itself here.'));
  } else {
    // Bars: one per day, tallest = most minutes. Month view shows thin bars.
    const maxMin = Math.max(...s.days.map((d) => d.minutes), 1);
    const bars = h(
      'div',
      { class: 'sum-bars ' + sum.kind, role: 'img', 'aria-label': `Minutes trained each day, ${s.minutes} in total` },
      s.days.map((d) => h('div', { class: 'sum-bar-col', title: `${dayText(d.date)}: ${d.minutes} min` }, h('div', { class: 'sum-bar' + (d.minutes ? ' on' : ''), style: `height:${d.minutes ? Math.max(8, (d.minutes / maxMin) * 100) : 4}%` })))
    );
    const labels = sum.kind === 'week' ? h('div', { class: 'sum-bar-days', 'aria-hidden': 'true' }, s.days.map((d) => h('span', {}, fromStr(d.date).toLocaleDateString(LOCALE, { weekday: 'narrow' })))) : null;

    card.append(
      h('div', { class: 'sum-hero' }, h('div', { class: 'sum-hero-num' }, '~' + fmt(s.kcal)), h('div', { class: 'sum-hero-label' }, 'kcal burnt in workouts (estimate)', delta(s.vs.kcal, s.hasPrev))),
      bars,
      labels || '',
      h(
        'div',
        { class: 'sum-grid' },
        big(String(s.workouts), '', s.workouts === 1 ? 'workout' : 'workouts', delta(s.vs.workouts, s.hasPrev)),
        big(s.minutes >= 90 ? (s.minutes / 60).toFixed(1) : String(s.minutes), s.minutes >= 90 ? 'h' : 'min', 'training time', delta(s.vs.minutes, s.hasPrev)),
        big(String(s.sets), '', 'sets done'),
        big(fmt(s.volumeKg), 'kg', 'total lifted', delta(s.vs.volumeKg, s.hasPrev))
      )
    );
  }

  // What all that lifting adds up to, in things you can picture.
  const fact = liftFact(s.volumeKg);
  const allFact = s.allTimeKg > s.volumeKg ? liftFact(s.allTimeKg) : null;
  if (fact || allFact) {
    const f = fact || allFact;
    card.append(
      h(
        'div',
        { class: 'fact' },
        h('span', { class: 'fact-icon', 'aria-hidden': 'true' }, icon('trophy', 22)),
        h(
          'div',
          { class: 'fact-text' },
          h('b', {}, fact ? `${fmt(s.volumeKg)} kg lifted. ${fact.text}` : `${fmt(s.allTimeKg)} kg lifted so far. ${allFact.text}`),
          f.next && h('span', {}, `Next up: ${f.next.name}, ${fmt(f.next.toGo)} kg to go`),
          f.next && h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${Math.max(3, f.next.pct)}%` })),
          fact && allFact && h('span', {}, `All time on this plan: ${fmt(s.allTimeKg)} kg. ${allFact.text}`)
        )
      )
    );
  }

  // Where the calories came from: share of the total, sessions and how hard each one was.
  if (s.topBurn.length) {
    const shown = sum.allBurn ? s.topBurn : s.topBurn.slice(0, 5);
    add(
      card,
      h('h3', { class: 'sum-sub' }, 'Calories by exercise', s.cardioMinutes ? h('span', { class: 'delta' }, `cardio ${s.cardioMinutes} min · ~${fmt(s.cardioKcal)} kcal`) : null),
      h(
        'ul',
        { class: 'lift-list' },
        shown.map((e) =>
          h(
            'li',
            { class: 'lift rich' },
            h('span', { class: 'lift-name' }, e.name),
            h('span', { class: 'lift-now' }, `~${fmt(e.kcal)}`, h('small', {}, ' kcal')),
            h('span', { class: 'share', title: `${e.share}% of the calories` }, h('span', { style: `width:${Math.max(2, e.share)}%` }), h('em', {}, `${e.share}%`)),
            h('small', { class: 'lift-sub' }, [`${e.minutes} min`, e.sessions > 1 ? `${e.sessions} sessions` : null, e.perMin ? `${e.perMin} kcal/min` : null].filter(Boolean).join(' · '))
          )
        )
      ),
      s.topBurn.length > 5 && h('button', { class: 'link-btn', type: 'button', onclick: () => { sum.allBurn = !sum.allBurn; redraw(); } }, sum.allBurn ? 'Show fewer' : `Show all ${s.topBurn.length}`)
    );
  }

  // Strength: best set against everything before this period, with the numbers that show progress.
  if (s.lifts.length) {
    const shown = sum.allLifts ? s.lifts : s.lifts.slice(0, sum.kind === 'month' ? 8 : 5);
    const chip = (l) => {
      if (l.gain === null) return h('span', { class: 'delta' }, 'first time');
      if (l.gain > 0) return h('span', { class: 'delta up' }, `+${l.gain} kg`);
      if (l.gain === 0 && l.repGain > 0) return h('span', { class: 'delta up' }, `+${l.repGain} rep${l.repGain === 1 ? '' : 's'}`);
      if (l.gain === 0) return h('span', { class: 'delta' }, 'held');
      return h('span', { class: 'delta down' }, `${l.gain} kg`);
    };
    const subLine = (l) =>
      [
        l.before !== null ? `was ${l.before} kg${l.beforeReps ? ` × ${l.beforeReps}` : ''}` : null,
        l.e1rm ? `1 rep max ~${l.e1rm} kg` : null,
        `${l.sets} set${l.sets === 1 ? '' : 's'}${l.sessions > 1 ? ` in ${l.sessions} sessions` : ''}`,
        l.volume ? `${fmt(l.volume)} kg moved${l.volumeChange !== null ? ` (${l.volumeChange > 0 ? '+' : ''}${l.volumeChange}%)` : ''}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    add(
      card,
      h('h3', { class: 'sum-sub' }, 'Strength', s.prs ? h('span', { class: 'delta up' }, `${s.prs} new best${s.prs === 1 ? '' : 's'}`) : null),
      h(
        'ul',
        { class: 'lift-list' },
        shown.map((l) =>
          h(
            'li',
            { class: 'lift rich' },
            h('span', { class: 'lift-name' }, l.name),
            h('span', { class: 'lift-now' }, `${l.now} kg`, l.reps ? h('small', {}, ` × ${l.reps}`) : null),
            chip(l),
            h('small', { class: 'lift-sub' }, subLine(l))
          )
        )
      ),
      s.lifts.length > shown.length || sum.allLifts ? h('button', { class: 'link-btn', type: 'button', onclick: () => { sum.allLifts = !sum.allLifts; redraw(); } }, sum.allLifts ? 'Show fewer' : `Show all ${s.lifts.length}`) : null,
      h('p', { class: 'hint' }, `Your heaviest set of each exercise against your best before this ${sum.kind}. More reps at the same weight counts as a new best too. "1 rep max" is an estimate of what you could lift once.`)
    );
  }

  // Balance: sets per muscle group, and the big ones you skipped.
  if (s.muscles.length) {
    const top = Math.max(...s.muscles.map((m) => m.sets));
    const missing = ['Chest', 'Back', 'Legs', 'Shoulders'].filter((g) => !s.muscles.some((m) => m.group === g));
    add(
      card,
      h('h3', { class: 'sum-sub' }, 'Sets per muscle group'),
      h(
        'ul',
        { class: 'muscles' },
        s.muscles.map((m) => h('li', {}, h('span', { class: 'm-name' }, m.group), h('span', { class: 'm-bar' }, h('span', { style: `width:${Math.max(4, (m.sets / top) * 100)}%` })), h('b', {}, String(m.sets))))
      ),
      missing.length > 0 && h('p', { class: 'hint' }, `No ${missing.join(', ').replace(/, ([^,]*)$/, ' or $1').toLowerCase()} sets this ${sum.kind}.${sum.kind === 'week' ? ' Fine if that is planned for another day.' : ''}`)
    );
  }

  if (s.weight && s.weight.count) {
    card.append(
      h('h3', { class: 'sum-sub' }, 'Body weight'),
      h('div', { class: 'sum-grid' }, big(`${s.weight.to}`, 'kg', s.weight.delta === 0 && s.weight.count < 2 ? 'latest weigh-in' : `from ${s.weight.from} kg`, s.weight.count >= 2 || s.weight.from !== s.weight.to ? h('span', { class: 'delta' }, formatDelta(s.weight.delta)) : null))
    );
  }

  // Eating and habits.
  if (s.avgEaten !== null || s.avgPct !== null || s.avgWaterL !== null) {
    const avg = [
      s.avgEaten !== null ? big(fmt(s.avgEaten), 'kcal', 'eaten') : null,
      s.avgProtein ? big(String(s.avgProtein), 'g', 'protein') : null,
      s.avgWaterL !== null ? big(String(s.avgWaterL), 'L', 'water') : null,
      s.avgPct !== null ? big(`${s.avgPct}%`, '', 'of plan done') : null,
    ].filter(Boolean);
    card.append(h('h3', { class: 'sum-sub' }, 'Daily average'), h('div', { class: 'sum-grid' }, avg));
  }

  card.append(
    h('button', { class: 'btn wide', type: 'button', onclick: () => openEditDaysSheet({ plan, start: range.start, end: range.end, onDone: redraw }) }, icon('edit', 18), 'Edit time and calories for a day'),
    h(
      'p',
      { class: 'hint' },
      `Calories burnt are a rough guess: each exercise has an effort level (lifting about 5 to 6 METs, a run about 9), used with your ${bodyKg} kg and the time you trained. Real numbers can be 30% off either way, so correct any day above with your watch's numbers, or change all estimates at once in More. `,
      h('button', { class: 'link-btn', type: 'button', onclick: () => openWeightSheet(today, redraw) }, "Log today's weight")
    )
  );
  return card;
}
