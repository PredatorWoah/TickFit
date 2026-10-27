// schedule.js
// Which plan day belongs to which calendar date.
//
// Two kinds of plan:
//   * CYCLIC (the default): Day 1 is the start date, Day 2 the next day, and so on, repeating.
//     The built in 4 week sample works like this.
//   * WEEKLY: every day label starts with a weekday ("Monday Chest", "Tue: Back"). Then the plan
//     follows the real calendar: a Monday date shows the Monday entry. Weekdays the plan does not
//     list (say Sunday in a Monday to Saturday plan) are rest days. No start date needed.

import { planDayIndex, fromStr } from './dates.js';
import { withVersions } from './versions.js';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Full names or the usual short forms (Mon, Tues, Thurs). "Sunrise" or "Monster" don't count.
const WEEKDAY_RE = /^\s*(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;

/** 0 = Monday ... 6 = Sunday for a label that starts with a weekday name, otherwise -1. */
export function weekdayOfLabel(label) {
  const m = String(label || '').match(WEEKDAY_RE);
  return m ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
}

/**
 * For a weekly plan: the weekday (0 = Monday) of each day, in order. Otherwise null.
 * It only counts as weekly when EVERY label starts with a weekday and no weekday repeats.
 */
export function weeklyWeekdays(plan) {
  // asked for every day shown or looked back on, so remembered per plan until a label changes
  const labels = plan.days.map((d) => d.label).join('\n');
  const seen = weeklyMemo.get(plan.days);
  if (seen && seen.labels === labels) return seen.wds && seen.wds.slice();
  const wds = plan.days.map((d) => weekdayOfLabel(d.label));
  const ok = wds.length > 0 && !wds.some((w) => w === -1) && new Set(wds).size === wds.length;
  weeklyMemo.set(plan.days, { labels, wds: ok ? wds : null });
  return ok ? wds.slice() : null;
}
const weeklyMemo = new WeakMap();


/** 0 = Monday ... 6 = Sunday for a "YYYY-MM-DD" date. */
export function weekdayOfDate(date) {
  return (fromStr(date).getDay() + 6) % 7;
}

export const weekdayName = (wd) => WEEKDAY_NAMES[wd];

/**
 * Index into plan.days for this date. Returns -1 for a weekly plan on a weekday it doesn't list.
 */
export function dayIndexFor(plan, date) {
  const wds = weeklyWeekdays(plan);
  if (wds) return wds.indexOf(weekdayOfDate(date));
  return planDayIndex(plan.startDate, date, plan.days.length);
}

/**
 * The day to show for a date. Unlisted weekdays of a weekly plan become an empty rest day.
 * If you picked your own exercises or meals for that date (plan.picks), those replace the list.
 */
export function dayFor(plan, date) {
  const base = plannedDay(plan, date);
  const pick = plan.picks && plan.picks[date];
  if (!pick) return withVersions(plan, date, base);
  const lib = plan.library || {};
  const resolve = (ids, own, more) => ids.map((id) => own.find((x) => x.id === id) || (more || []).find((x) => x.id === id)).filter(Boolean);
  return withVersions(plan, date, {
    ...base,
    workout: Array.isArray(pick.workout) ? resolve(pick.workout, base.workout, lib.exercises) : base.workout,
    meals: Array.isArray(pick.meals) ? resolve(pick.meals, base.meals, lib.meals) : base.meals,
    picked: true,
  });
}

/**
 * The day as the plan has it, before any picks for that date.
 *
 * A plan made from a document full of options (an AI puts them in "library") may leave a day's own list empty
 * and only say what the day is about: "Wednesday Shoulders + Abs", or a "focus". Such a day is not a rest day,
 * so it gets a sensible starting list from the library (marked suggested: true); "Choose exercises" changes it.
 * A day whose label names no library category, like "Sunday Rest", stays empty.
 */
export function plannedDay(plan, date) {
  const i = dayIndexFor(plan, date);
  if (i < 0) {
    return {
      label: `${weekdayName(weekdayOfDate(date))} (rest)`,
      workout: [],
      meals: [],
      extras: { waterLiters: null, supplements: [], notes: '' },
    };
  }
  const day = plan.days[i];
  const lib = plan.library;
  if (!lib || (day.workout.length && day.meals.length)) return day;
  const workout = day.workout.length ? day.workout : fromLibrary(day, lib.exercises || [], 'workout');
  const meals = day.meals.length ? day.meals : fromLibrary(day, lib.meals || [], 'meals');
  return workout === day.workout && meals === day.meals ? day : { ...day, workout, meals, suggested: true };
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The categories a day is about: its "focus", else categories named in its label ("Friday Back Biceps"). */
export function focusFor(day, categories) {
  if (day.focus && day.focus.length) return categories.filter((c) => day.focus.some((f) => norm(f) === norm(c)));
  const label = ' ' + norm(day.label).replace(/[^a-z0-9]+/g, ' ') + ' ';
  return categories.filter((c) => {
    const n = norm(c).replace(/[^a-z0-9]+/g, ' ').trim();
    return n && (label.includes(` ${n} `) || label.includes(` ${n.replace(/s$/, '')} `));
  });
}

/**
 * A starting list from the library for an empty day.
 *   exercises: the day's categories, up to 6 from one category or 4 each from several, 8 at most
 *   meals:     the day's meal categories if it names any, else one of each (breakfast, lunch...), 6 at most
 * The items keep their library ids, so ticks and logged sets stay attached when the list is shown again.
 */
function fromLibrary(day, items, kind) {
  if (!items.length) return kind === 'workout' ? day.workout : day.meals;
  const cats = [...new Set(items.map((x) => x.category).filter(Boolean))];
  let focus = focusFor(day, cats);
  if (!focus.length) {
    if (kind === 'workout') return day.workout; // nothing named: a real rest day
    focus = cats;
  }
  const each = kind === 'meals' ? 1 : focus.length === 1 ? 6 : 4;
  const out = [];
  for (const c of focus) out.push(...items.filter((x) => norm(x.category) === norm(c)).slice(0, each));
  return out.slice(0, kind === 'meals' ? 6 : 8);
}

/**
 * How many days to move from `today` to reach the plan day `target` (an index), using the
 * nearest such date. Used by the "jump to a day" picker.
 */
export function jumpDelta(plan, today, target) {
  const n = plan.days.length;
  const wds = weeklyWeekdays(plan);
  if (wds) {
    let d = (((wds[target] - weekdayOfDate(today)) % 7) + 7) % 7; // 0..6 days forward
    if (d > 3) d -= 7; // nearer going back
    return d;
  }
  let d = target - planDayIndex(plan.startDate, today, n);
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}
