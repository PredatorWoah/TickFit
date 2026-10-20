// csv.js
// Your history as spreadsheet files (CSV opens in Google Sheets, Excel and LibreOffice). Pure, no DOM.
//   dailyCsv  one row per day: % done, sets, volume, calories, protein, water, weight, steps, measurements, notes
//   setsCsv   one row per logged set: date, exercise, set number, kg, reps
// Only days that have something in them are included.

import { dayFor } from './schedule.js';
import { dayStats, mealTotals } from './stats.js';
import { PARTS } from './measure.js';

/** One CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @) gets a ' in front. */
export function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells) => cells.map(cell).join(',');
const kg1 = (n) => Math.round(n * 10) / 10;

const doneSets = (rec) => Object.entries(rec.sets || {}).flatMap(([id, list]) => (Array.isArray(list) ? list.filter((x) => x && x.done).map((x) => ({ id, ...x })) : []));
const hasAnything = (rec) => !!rec && ((rec.ticks && Object.keys(rec.ticks).length) || doneSets(rec).length || rec.waterMl || (rec.notes && String(rec.notes).trim()));

/** Every date with something in it, oldest first. */
function datesOf(records, state) {
  const set = new Set(Object.keys(records || {}).filter((d) => hasAnything(records[d])));
  for (const log of [state.bodyLog, state.stepLog, state.measureLog]) for (const d of Object.keys(log || {})) set.add(d);
  return [...set].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}

/** The daily summary for one plan as CSV text (with a header row). */
export function dailyCsv(state, plan) {
  const records = (state.progress || {})[plan.id] || {};
  const parts = PARTS.map(([k, label]) => [k, label]);
  const head = ['Date', 'Plan day', 'Done %', 'Items done', 'Items', 'Sets done', 'Volume kg', 'Calories eaten', 'Protein eaten g', 'Water ml', 'Body weight kg', 'Steps', ...parts.map(([, label]) => `${label} cm`), 'Notes'];
  const rows = [line(head)];
  for (const date of datesOf(records, state)) {
    const day = dayFor(plan, date);
    const rec = records[date] || {};
    const st = dayStats(day, rec);
    const sets = doneSets(rec);
    const volume = sets.reduce((t, x) => t + (Number(x.w) || 0) * (Number(x.r) || 0), 0);
    const meals = mealTotals(day, rec);
    const m = (state.measureLog || {})[date] || {};
    rows.push(
      line([
        date,
        day.label || '',
        st.total ? st.pct : null,
        st.done,
        st.total,
        sets.length || null,
        volume ? kg1(volume) : null,
        meals.caloriesEaten || null,
        meals.proteinEaten || null,
        rec.waterMl || null,
        (state.bodyLog || {})[date] ?? null,
        (state.stepLog || {})[date] ?? null,
        ...parts.map(([k]) => m[k] ?? null),
        rec.notes ? String(rec.notes).trim() : '',
      ])
    );
  }
  return rows.join('\r\n') + '\r\n';
}

/** Every logged set for one plan as CSV text. */
export function setsCsv(state, plan) {
  const records = (state.progress || {})[plan.id] || {};
  const rows = [line(['Date', 'Exercise', 'Set', 'Weight kg', 'Reps'])];
  for (const date of Object.keys(records).sort()) {
    const rec = records[date];
    if (!rec || !rec.sets) continue;
    const day = dayFor(plan, date);
    for (const [id, list] of Object.entries(rec.sets)) {
      if (!Array.isArray(list)) continue;
      const ex = day.workout.find((w) => w.id === id);
      list.forEach((x, i) => {
        if (x && x.done) rows.push(line([date, ex ? ex.exercise : id, i + 1, Number(x.w) || 0, Number(x.r) || 0]));
      });
    }
  }
  return rows.join('\r\n') + '\r\n';
}
