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
  const wds = plan.days.map((d) => weekdayOfLabel(d.label));
  if (wds.length === 0 || wds.some((w) => w === -1)) return null;
  if (new Set(wds).size !== wds.length) return null;
  return wds;
}


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
  if (!pick) return base;
  const lib = plan.library || {};
  const resolve = (ids, own, more) => ids.map((id) => own.find((x) => x.id === id) || (more || []).find((x) => x.id === id)).filter(Boolean);
  return {
    ...base,
    workout: Array.isArray(pick.workout) ? resolve(pick.workout, base.workout, lib.exercises) : base.workout,
    meals: Array.isArray(pick.meals) ? resolve(pick.meals, base.meals, lib.meals) : base.meals,
    picked: true,
  };
}

/** The day exactly as the plan has it, before any picks. */
export function plannedDay(plan, date) {
  const i = dayIndexFor(plan, date);
  if (i >= 0) return plan.days[i];
  return {
    label: `${weekdayName(weekdayOfDate(date))} (rest)`,
    workout: [],
    meals: [],
    extras: { waterLiters: null, supplements: [], notes: '' },
  };
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
