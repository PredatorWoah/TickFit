// backnav.js
// What the phone's Back button (or the swipe-back gesture) does inside the Android app.
// Pure function, so it is easy to test. The rule: go up one step, and only leave the app from Today.
//
//   a sub-screen (Plans, New plan, Import, Build, Edit)  -> the screen it came from
//   another tab (Workout, Meals, Progress, More)        -> Today
//   Today on a day that is not today                    -> Today, today's date
//   Today on today, or the welcome screen               -> leave the app

const PARENT = {
  plans: 'more',
  new: 'plans',
  import: 'new',
  build: 'new',
  edit: 'plans',
  more: 'today',
  workout: 'today',
  meals: 'today',
  progress: 'today',
};

/**
 * @param screen  the screen showing now
 * @param date    the day it is showing ("YYYY-MM-DD")
 * @param today   today's date
 * @returns { screen, date? } where to go, or null to leave the app
 */
export function backTarget(screen, date, today) {
  if (PARENT[screen]) return { screen: PARENT[screen] };
  if (screen === 'today' && date && date !== today) return { screen: 'today', date: today };
  return null;
}
