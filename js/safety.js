// safety.js
// Pure helpers about protecting the user's data (no DOM, no storage), so they are easy to test.

import { diffDays, addDays } from './dates.js';

/** How many different days have any logged progress, across all plans. */
export function loggedDayCount(progress) {
  const days = new Set();
  for (const planDays of Object.values(progress || {})) {
    for (const [date, rec] of Object.entries(planDays || {})) {
      const any =
        (rec.ticks && Object.keys(rec.ticks).length) ||
        (rec.sets && Object.values(rec.sets).some((rows) => rows.some((s) => s.done))) ||
        rec.waterMl > 0 ||
        (rec.notes && rec.notes.trim());
      if (any) days.add(date);
    }
  }
  return days.size;
}

/** Whole days since the last backup date ("YYYY-MM-DD"), or null if there never was one. */
export function daysSinceBackup(lastBackup, today) {
  return lastBackup ? Math.max(0, diffDays(lastBackup, today)) : null;
}

export const NUDGE_AFTER_DAYS = 14; // remind when the last backup is older than this
export const NUDGE_MIN_LOGGED_DAYS = 3; // don't nag brand new users who have nothing to lose yet
export const SNOOZE_DAYS = 7;

/**
 * Should we show the "back up your progress" reminder today?
 * state: { loggedDays, lastBackup, snoozeUntil }
 */
export function nudgeDue({ loggedDays, lastBackup, snoozeUntil }, today) {
  if (loggedDays < NUDGE_MIN_LOGGED_DAYS) return false;
  if (snoozeUntil && today <= snoozeUntil) return false;
  const since = daysSinceBackup(lastBackup, today);
  return since === null || since > NUDGE_AFTER_DAYS;
}

export const snoozeDate = (today) => addDays(today, SNOOZE_DAYS);

/** "never", "today", "yesterday", "5 days ago" */
export function describeBackupAge(lastBackup, today) {
  const d = daysSinceBackup(lastBackup, today);
  if (d === null) return 'never';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}
