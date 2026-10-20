// measure.js
// Body measurements (in cm): when the scale stalls, the tape often still moves. Pure functions; the log is
// state.measureLog = { "2026-10-20": { waist: 84, chest: 98 } }. Tested in tests/measure.mjs.

export const PARTS = [
  ['waist', 'Waist'],
  ['chest', 'Chest'],
  ['hips', 'Hips'],
  ['arm', 'Arm'],
  ['thigh', 'Thigh'],
];
const KEYS = new Set(PARTS.map(([k]) => k));
export const MIN_CM = 10;
export const MAX_CM = 250;

/** A sane measurement in cm (one decimal), or null. */
export function validCm(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) && n >= MIN_CM && n <= MAX_CM ? Math.round(n * 10) / 10 : null;
}

/** Keep only real dates, known body parts and sane numbers (for backups and hand edited data). */
export function cleanMeasureLog(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [date, entry] of Object.entries(obj)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry || typeof entry !== 'object') continue;
    const day = {};
    for (const [k, v] of Object.entries(entry)) if (KEYS.has(k) && validCm(v) !== null) day[k] = validCm(v);
    if (Object.keys(day).length) out[date] = day;
  }
  return out;
}

/**
 * For each body part: first and latest value and the change. Only parts measured at least once appear.
 * Returns [{ key, label, first, firstDate, latest, latestDate, change }]
 */
export function measureSummary(log) {
  const dates = Object.keys(log || {}).sort();
  const out = [];
  for (const [key, label] of PARTS) {
    const seen = dates.filter((d) => typeof log[d][key] === 'number');
    if (!seen.length) continue;
    const firstDate = seen[0];
    const latestDate = seen[seen.length - 1];
    const first = log[firstDate][key];
    const latest = log[latestDate][key];
    out.push({ key, label, first, firstDate, latest, latestDate, change: Math.round((latest - first) * 10) / 10 });
  }
  return out;
}
