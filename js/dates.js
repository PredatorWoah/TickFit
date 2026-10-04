// dates.js
// Date helpers. Dates are plain "YYYY-MM-DD" strings in the user's LOCAL time.
// We never store timestamps for progress, so time zones and daylight saving can't shift a day.

const pad = (n) => String(n).padStart(2, '0');

/** Date object -> "YYYY-MM-DD" (local time). */
export function toStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toStr(new Date());
}

/** "YYYY-MM-DD" -> Date at local midday (midday avoids daylight saving edge cases). */
export function fromStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s, n) {
  const d = fromStr(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a, b) {
  const ua = Date.UTC(...ymd(a));
  const ub = Date.UTC(...ymd(b));
  return Math.round((ub - ua) / 86400000);
}

function ymd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
}

export function isValidStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toStr(fromStr(s)) === s;
}

/** Which day of the plan (0 based) falls on this date. The plan repeats after its last day. */
export function planDayIndex(startDate, dateStr, dayCount) {
  const diff = diffDays(startDate, dateStr);
  return ((diff % dayCount) + dayCount) % dayCount;
}

/** Nice label like "Sat, 4 Oct". `locale` is e.g. "en" or "hi". */
export function formatShort(s, locale = 'en') {
  return fromStr(s).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}
