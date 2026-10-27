// versions.js
// An exercise can come in more than one version: "Machine" and "No machine", "Gym" and "Home", or two ways to
// train the same muscle. In a plan that is ONE exercise slot:
//
//   { "exercise": "Incline Chest Press Machine", "version": "Machine", "sets": 3, "reps": "8 to 12",
//     "alternatives": [ { "version": "No machine", "exercise": "Decline Push Ups", "notes": "...", "video": "..." } ] }
//
// The slot shows its first version until you switch. Which version you did is remembered per date
// (plan.versions: { "2026-10-27": { "w1": 1 } }, 1 = the first alternative), so every screen, streak and
// history follows what you really did. Each version is logged under its own id ("w1" and "w1~1"), so Decline
// Push Ups sets never get mixed into the machine press.
//
// Pure functions, no DOM, easy to test. schedule.js dayFor() calls withVersions().

/** The id a version of a slot is logged under: the slot's own id for the first version, "id~n" for the others. */
export const versionId = (id, n) => (n > 0 ? `${id}~${n}` : id);

/** The slot an id belongs to ("w1~1" -> "w1"). */
export const baseId = (id) => String(id).replace(/~\d+$/, '');

/** How many versions an exercise has (1 when it has no alternatives). */
export const versionCount = (item) => 1 + (item && Array.isArray(item.alternatives) ? item.alternatives.length : 0);

/**
 * The versions of an exercise, first one first: [{ label, exercise }]. Null when there is only one.
 * A version without a label is called "Version 1", "Version 2"...
 */
export function versionsOf(item) {
  if (!item || !Array.isArray(item.alternatives) || !item.alternatives.length) return null;
  return [{ label: item.vlabel || 'Version 1', exercise: item.exercise }, ...item.alternatives.map((a, i) => ({ label: a.label || `Version ${i + 2}`, exercise: a.exercise }))];
}

/**
 * One version of an exercise as a plain exercise the screens can log. The first version IS the plan's own
 * object (so a change made to it, like a superset, still reaches the plan). Another version is a copy with its
 * own id ("w1~1") and its own name, notes and video; sets, reps and rest come from the first version unless the
 * alternative says otherwise. The copy also carries `versions` (all the labels and names) and `vi` (which one it is).
 */
export function resolveVersion(item, n) {
  if (!item || !Array.isArray(item.alternatives) || !item.alternatives.length) return item;
  const k = n > 0 && n <= item.alternatives.length ? n : 0;
  if (k === 0) return item;
  const alt = item.alternatives[k - 1];
  const own = {};
  for (const key of ['exercise', 'sets', 'reps', 'rest']) if (alt[key] !== '' && alt[key] !== null && alt[key] !== undefined) own[key] = alt[key];
  // what is specific to an exercise never carries over from another one
  own.notes = alt.notes || '';
  own.video = alt.video || '';
  own.weight = alt.weight || '';
  return { ...item, ...own, id: versionId(item.id, k), base: item.id, vi: k, versions: versionsOf(item) };
}

/** What the screens need to draw a version switch for a (resolved) exercise: { versions, vi, base }, or null. */
export function versionInfo(w) {
  if (!w) return null;
  if (w.versions && w.versions.length > 1) return { versions: w.versions, vi: w.vi || 0, base: w.base || baseId(w.id) };
  const versions = versionsOf(w);
  return versions ? { versions, vi: 0, base: w.id } : null;
}

/** Which version to use for a slot on a date: what was chosen for that date, else the first. */
export function chosenVersion(plan, date, item) {
  const own = plan.versions && plan.versions[date] && plan.versions[date][item.id];
  return Number.isInteger(own) && own > 0 && own <= (item.alternatives ? item.alternatives.length : 0) ? own : 0;
}

/** A day with its exercises shown in the versions chosen for that date. Returns `day` itself when nothing has versions. */
export function withVersions(plan, date, day) {
  if (!day.workout.some((w) => w.alternatives && w.alternatives.length)) return day;
  return { ...day, workout: day.workout.map((w) => resolveVersion(w, chosenVersion(plan, date, w))) };
}

/** Choose version `n` (0 = the first) of one slot on a date. Changes `plan` in place. */
export function setVersion(plan, date, id, n) {
  const slot = baseId(id);
  const day = { ...((plan.versions && plan.versions[date]) || {}) };
  if (n > 0) day[slot] = n;
  else delete day[slot];
  plan.versions ||= {};
  if (Object.keys(day).length) plan.versions[date] = day;
  else delete plan.versions[date];
  if (!Object.keys(plan.versions).length) delete plan.versions;
}

/**
 * Choose version `n` for every slot on a date that has it and has not been started (no set ticked yet).
 * `started(w)` says whether an exercise has logged sets. Returns the names that were left as they are.
 */
export function setVersionForDay(plan, date, workout, n, started = () => false) {
  const left = [];
  for (const w of workout) {
    const info = versionInfo(w);
    if (!info || info.versions.length <= n) continue;
    if (info.vi === n) continue;
    if (started(w)) left.push(w.exercise);
    else setVersion(plan, date, info.base, n);
  }
  return left;
}

/** The label most slots use for version `n`, for each version number ("Machine", "No machine"). Null with fewer than two such slots. */
export function sharedLabels(workout) {
  const slots = workout.map(versionInfo).filter(Boolean);
  if (slots.length < 2) return null;
  const longest = Math.max(...slots.map((s) => s.versions.length));
  const labels = [];
  for (let n = 0; n < longest; n++) {
    const counts = new Map();
    for (const s of slots) if (s.versions[n]) counts.set(s.versions[n].label, (counts.get(s.versions[n].label) || 0) + 1);
    labels.push([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return labels;
}
