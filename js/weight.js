// weight.js
// Body weight log maths. Pure functions (no DOM, no storage), easy to test.
// The log is { "YYYY-MM-DD": kg }, one number per day.
//
// Body weight jumps around by a kilo or two a day (water, food, salt), so the app leans on
// the 7 day AVERAGE and compares weeks, not single days.

import { addDays } from './dates.js';

export const MIN_KG = 20;
export const MAX_KG = 400;

/** A sane weight in kg to one decimal, or null. Accepts "72,4" and "72.4 kg". */
export function validWeight(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  if (!isFinite(n) || n < MIN_KG || n > MAX_KG) return null;
  return Math.round(n * 10) / 10;
}

/** Keep only entries with a real date and a sane weight (used when restoring a backup). */
export function cleanLog(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [date, v] of Object.entries(obj)) {
    const kg = validWeight(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && kg !== null) out[date] = kg;
  }
  return out;
}

/** [{date, kg}] oldest first, optionally only between two dates (inclusive). */
export function entries(log, from = '0000-00-00', to = '9999-99-99') {
  return Object.keys(log || {})
    .filter((d) => d >= from && d <= to)
    .sort()
    .map((date) => ({ date, kg: log[date] }));
}

/** The newest entry on or before `date`, or null. */
export function latest(log, date) {
  const all = entries(log, '0000-00-00', date);
  return all.length ? all[all.length - 1] : null;
}

const avg = (list) => (list.length ? Math.round((list.reduce((t, e) => t + e.kg, 0) / list.length) * 10) / 10 : null);

/** Average of the entries in the 7 days ending on `date`, or null when there are none. */
export function average7(log, date) {
  return avg(entries(log, addDays(date, -6), date));
}

/**
 * How much weight changed over the last week: this week's average against the week before.
 * With no earlier week to compare, falls back to first versus last entry this week.
 * Returns { now, before, delta, basis } or null when there is not enough data.
 */
export function weekChange(log, date) {
  const now = average7(log, date);
  if (now === null) return null;
  const before = avg(entries(log, addDays(date, -13), addDays(date, -7)));
  if (before !== null) return { now, before, delta: round1(now - before), basis: 'average' };
  const week = entries(log, addDays(date, -6), date);
  if (week.length >= 2) return { now: week[week.length - 1].kg, before: week[0].kg, delta: round1(week[week.length - 1].kg - week[0].kg), basis: 'entries' };
  return null;
}

/**
 * Change across a stretch (a week or month): from the last weigh-in before it (or its first one) to its last.
 * Returns { from, to, delta, count } or null.
 */
export function periodChange(log, start, end) {
  const inside = entries(log, start, end);
  if (!inside.length) return null;
  const before = latest(log, addDays(start, -1));
  const from = before ? before.kg : inside[0].kg;
  const to = inside[inside.length - 1].kg;
  if (!before && inside.length < 2) return { from, to, delta: 0, count: inside.length };
  return { from, to, delta: round1(to - from), count: inside.length };
}

const round1 = (n) => Math.round(n * 10) / 10;

/** "+0.4 kg" / "-1.2 kg" / "no change" */
export function formatDelta(delta) {
  if (delta === null || delta === undefined) return '';
  if (Math.abs(delta) < 0.05) return 'no change';
  return `${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)} kg`;
}

/** Points for the chart: [{date, kg, avg}] for the last `days` days that have entries. */
export function chartPoints(log, today, days) {
  return entries(log, addDays(today, -(days - 1)), today).map((e) => ({ ...e, avg: average7(log, e.date) }));
}
