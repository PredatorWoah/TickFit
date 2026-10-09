// parser.js
// Turns pasted text (often messy, straight from a chatbot) into a clean plan,
// or into a list of friendly, human readable problems.
//
// This file has NO browser code in it, so it also runs in Node for testing:
//   node tests/run.mjs
//
// Usage:
//   const result = parsePlanText(text);
//   if (result.ok) use(result.plan); else show(result.errors);
//   result.warnings are non fatal notes ("Day 2 had no label, called it Day 2").

const MAX_DAYS = 366;
const MAX_LIBRARY = 500; // exercises (and separately meals) in a plan's library
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- small helpers ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Trimmed text from a string or number, otherwise "". */
function str(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && isFinite(v)) return String(v);
  return '';
}

/** A number from 12, "12", or "12 g". Returns null if there is none. */
function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

/** A list of non empty strings. A single string becomes a one item list. */
function strList(v) {
  if (typeof v === 'string') v = [v];
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}

// ---------- step 1: find the JSON inside messy text ----------

/** Pull the most likely JSON block out of text (handles ```json fences and chatter). */
export function extractJsonBlock(text) {
  let t = String(text ?? '').replace(/^﻿/, '').trim();

  // If the chatbot used a code fence, prefer what is inside the first fence holding JSON.
  const fence = t.match(/```(?:json|JSON|js|javascript)?\s*([\s\S]*?)```/);
  if (fence && /[{[]/.test(fence[1])) t = fence[1];
  else if (t.startsWith('```')) t = t.replace(/^```\w*\s*/, ''); // unclosed fence (cut off reply)

  // Cut everything before the first { or [ and after the last } or ].
  const first = t.search(/[{[]/);
  if (first === -1) return '';
  const lastBrace = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  return lastBrace > first ? t.slice(first, lastBrace + 1) : t.slice(first);
}

/** Cheap repairs for the usual chatbot mistakes. Each one is only used if needed. */
const FIXES = [
  // Whole line comments: // like this
  (s) => s.replace(/^\s*\/\/.*$/gm, ''),
  // Trailing commas: [1, 2, ]  or  {"a": 1, }
  (s) => s.replace(/,(\s*[}\]])/g, '$1'),
  // Curly quotes: “ ” ‘ ’
  (s) => s.replace(/[“”„‟]/g, '"').replace(/[‘’]/g, "'"),
  // Single quoted keys and values: {'a': 'b'}
  (s) => s.replace(/'([^'\\\n]*)'(\s*[:,}\]])/g, '"$1"$2'),
  // Unquoted keys: {name: "x"}
  (s) => s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'),
];

/** Is the JSON cut off? Counts brackets outside of strings. */
function looksTruncated(s) {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return inStr || depth > 0;
}

/** Turn a JSON.parse error into something a person can act on. */
function friendlyParseError(source, err) {
  if (looksTruncated(source)) {
    return 'The JSON looks cut off (it ends before it is finished). Ask the chatbot to send the full plan again as compact JSON (or in a fresh chat), then paste all of it.';
  }
  const m = String(err && err.message).match(/position (\d+)/);
  let where = '';
  if (m) {
    const pos = Number(m[1]);
    const before = source.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    const snippet = source.slice(Math.max(0, pos - 20), pos + 20).replace(/\s+/g, ' ');
    where = ` Problem is near line ${line}, column ${col}: "...${snippet}...".`;
  }
  return `That is not valid JSON.${where} Ask the chatbot to "return only valid JSON".`;
}

/**
 * Text in, parsed JSON value out.
 * Returns { value } on success or { error } with a friendly message.
 */
export function parseJsonLoose(text) {
  const block = extractJsonBlock(text);
  if (!block) {
    return { error: 'I could not find any JSON in that text. A plan starts with { and has a "days" list. Use the "Copy AI prompt" button to get a chatbot to make one.' };
  }

  let candidate = block;
  let lastErr;
  // Try as is, then apply the repairs one by one (each builds on the last).
  for (let step = 0; step <= FIXES.length; step++) {
    try {
      return { value: JSON.parse(candidate) };
    } catch (e) {
      lastErr = e;
    }
    if (step < FIXES.length) candidate = FIXES[step](candidate);
  }
  return { error: friendlyParseError(block, lastErr) };
}

// ---------- step 2: check the plan and clean it up ----------

/**
 * Validate and normalize a plan object.
 * Collects ALL problems instead of stopping at the first one.
 */
export function validatePlan(raw) {
  const errors = [];
  const warnings = [];

  // Some chatbots return just the list of days. Accept that.
  if (Array.isArray(raw)) {
    warnings.push('The plan had no name, so I called it "Imported plan".');
    raw = { name: 'Imported plan', days: raw };
  }
  if (!isObj(raw)) {
    return { ok: false, errors: ['The plan must be a JSON object like { "name": "...", "days": [ ... ] }.'], warnings };
  }

  // Name
  let name = str(raw.name);
  if (!name) {
    name = 'Imported plan';
    warnings.push('The plan had no "name", so I called it "Imported plan".');
  }

  // A library of exercises and meals to pick from, sorted by category (optional).
  const library = validateLibrary(raw, warnings);

  // Days. With a library they are optional: one open day where you pick what to do.
  let rawDays = raw.days;
  if ((rawDays === undefined || rawDays === null || (Array.isArray(rawDays) && rawDays.length === 0)) && library) {
    rawDays = [{ label: 'Pick your day', workout: [], meals: [] }];
  }
  if (!Array.isArray(rawDays)) {
    errors.push('The plan needs a "days" list, for example "days": [ { "label": "Day 1", ... } ].');
    return { ok: false, errors, warnings };
  }
  if (rawDays.length === 0) {
    errors.push('The "days" list is empty. Add at least one day.');
    return { ok: false, errors, warnings };
  }
  if (rawDays.length > MAX_DAYS) {
    errors.push(`The plan has ${rawDays.length} days. The maximum is ${MAX_DAYS}.`);
    return { ok: false, errors, warnings };
  }

  const days = rawDays.map((d, i) => validateDay(d, i, errors, warnings, library));

  const plan = { name, days };
  if (library) plan.library = library;
  const picks = validatePicks(raw.picks);
  if (picks) plan.picks = picks;
  if (typeof raw.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate.trim())) {
    plan.startDate = raw.startDate.trim();
  }
  return { ok: errors.length === 0, plan: errors.length ? undefined : plan, errors, warnings };
}

function validateDay(d, i, errors, warnings, library = null) {
  const where = `Day ${i + 1}`;
  if (!isObj(d)) {
    errors.push(`${where} is not an object. Each day looks like { "label": "...", "workout": [], "meals": [] }.`);
    return null;
  }

  let label = str(d.label) || str(d.name) || str(d.title);
  if (!label) {
    label = where;
    warnings.push(`${where} had no "label", so I used "${where}".`);
  }

  // Workout (empty list = rest day)
  let workout = [];
  if ((d.workout === undefined || d.workout === null) && library) {
    // Fine with a library: the exercises are picked each day.
  } else if (d.workout === undefined || d.workout === null) {
    errors.push(`${where} is missing "workout". Use an empty list [] for a rest day.`);
  } else if (!Array.isArray(d.workout)) {
    errors.push(`${where}: "workout" must be a list. Use [] for a rest day.`);
  } else {
    const used = new Set();
    workout = d.workout.map((w, j) => validateExercise(w, `${where}, exercise ${j + 1}`, j, used, errors, warnings));
  }

  // Meals
  let meals = [];
  if ((d.meals === undefined || d.meals === null) && library) {
    // Fine with a library: the meals are picked each day.
  } else if (d.meals === undefined || d.meals === null) {
    errors.push(`${where} is missing meals. Add a "meals" list.`);
  } else if (!Array.isArray(d.meals)) {
    errors.push(`${where}: "meals" must be a list.`);
  } else {
    const used = new Set();
    meals = d.meals.map((m, j) => validateMeal(m, `${where}, meal ${j + 1}`, j, used, errors, warnings));
  }

  // Extras are optional
  const extras = validateExtras(d.extras, where, warnings);

  const out = { label, workout, meals, extras };
  // Which library categories this day is about, like ["Back", "Biceps"]. Used as the picker's starting filter.
  const focus = strList(d.focus ?? d.categories);
  if (focus.length) out.focus = focus.slice(0, 20);
  return out;
}

// ---------- the library: exercises and meals to pick from, by category ----------

/** "Lat Pulldown (Close Grip)" -> "lat-pulldown-close-grip" */
export function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}

/**
 * Accepts { "Back": [ ... ], "Chest": [ ... ] } or a plain list where each item has a "category".
 * Items can be full objects or just a name. Returns [[category, item], ...].
 */
function byCategory(v) {
  const out = [];
  if (isObj(v)) {
    for (const [cat, list] of Object.entries(v)) for (const item of Array.isArray(list) ? list : [list]) out.push([str(cat) || 'Other', item]);
  } else if (Array.isArray(v)) {
    for (const item of v) out.push([(isObj(item) && (str(item.category) || str(item.group) || str(item.muscle))) || 'Other', item]);
  }
  return out;
}

/**
 * The plan's library: { exercises: [...], meals: [...] }, each item with a "category" and a stable id
 * (lx-name for exercises, lm-name for meals). Bad items are skipped with a warning, never an error,
 * so one typo doesn't block a whole plan. Returns null when there is no library.
 */
function validateLibrary(raw, warnings) {
  const src = isObj(raw.library) ? raw.library : { exercises: isObj(raw.exercises) || Array.isArray(raw.exercises) ? raw.exercises : null, meals: isObj(raw.meals) || Array.isArray(raw.meals) ? raw.meals : null };
  const exercises = [];
  const meals = [];
  const used = new Set();
  const idFor = (given, prefix, name) => {
    let id = str(given) || `${prefix}-${slug(name)}`;
    for (let n = 2; used.has(id); n++) id = `${prefix}-${slug(name)}-${n}`;
    used.add(id);
    return id;
  };

  byCategory(src.exercises).slice(0, MAX_LIBRARY).forEach(([category, item], j) => {
    const obj = typeof item === 'string' ? { exercise: item } : item;
    const errs = [];
    const w = validateExercise(obj, `Library exercise ${j + 1}`, j, new Set(), errs, warnings);
    if (!w || errs.length) return warnings.push(`${errs[0] || `Library exercise ${j + 1} is not valid`}. I skipped it.`);
    exercises.push({ ...w, id: idFor(obj.id, 'lx', w.exercise), category });
  });

  byCategory(src.meals).slice(0, MAX_LIBRARY).forEach(([category, item], j) => {
    let obj = typeof item === 'string' ? { name: item, items: [item] } : item;
    if (isObj(obj) && !obj.items && !obj.foods && str(obj.name)) obj = { ...obj, items: [str(obj.name)] };
    const errs = [];
    const m = validateMeal(obj, `Library meal ${j + 1}`, j, new Set(), errs, warnings);
    if (!m || errs.length) return warnings.push(`${errs[0] || `Library meal ${j + 1} is not valid`}. I skipped it.`);
    meals.push({ ...m, id: idFor(obj.id, 'lm', m.name), category });
  });

  return exercises.length || meals.length ? { exercises, meals } : null;
}

/** What was picked on each date: { "2026-10-09": { workout: [ids], meals: [ids] } }. Null when there is nothing. */
function validatePicks(v) {
  if (!isObj(v)) return null;
  const out = {};
  for (const [date, p] of Object.entries(v)) {
    if (!DATE_RE.test(date) || !isObj(p)) continue;
    const day = {};
    for (const kind of ['workout', 'meals']) if (Array.isArray(p[kind])) day[kind] = p[kind].map(str).filter(Boolean).slice(0, 100);
    if (Object.keys(day).length) out[date] = day;
  }
  return Object.keys(out).length ? out : null;
}

/** Use the given id if it is unique in the day, otherwise make one like w1, m2. */
function pickId(given, prefix, index, used) {
  let id = str(given);
  if (!id || used.has(id)) id = `${prefix}${index + 1}`;
  while (used.has(id)) id += 'x';
  used.add(id);
  return id;
}

function validateExercise(w, where, j, used, errors, warnings) {
  if (!isObj(w)) {
    errors.push(`${where} is not an object.`);
    return null;
  }
  const exercise = str(w.exercise) || str(w.name);
  if (!exercise) {
    errors.push(`${where} has no "exercise" name.`);
  }
  const label = exercise ? `${where} (${exercise})` : where;

  let sets = num(w.sets);
  if (w.sets !== undefined && w.sets !== null && w.sets !== '' && (sets === null || sets < 1)) {
    warnings.push(`${label}: "sets" should be a number, so I ignored it.`);
    sets = null;
  }

  // Rest: 90 -> "90s", "90 sec" stays as written.
  let rest = typeof w.rest === 'number' ? `${w.rest}s` : str(w.rest);

  // Optional video link. Only web links are kept (so nothing odd like javascript: can sneak in).
  let video = str(w.video);
  if (video && !/^https?:\/\/\S+$/i.test(video)) {
    warnings.push(`${label}: "video" must be a web link starting with http:// or https://, so I ignored it.`);
    video = '';
  }

  return {
    id: pickId(w.id, 'w', j, used),
    exercise,
    sets: sets === null ? null : Math.round(sets),
    reps: str(w.reps),
    weight: str(w.weight), // optional target, like "20 kg"
    rest,
    notes: str(w.notes),
    video,
  };
}

function validateMeal(m, where, j, used, errors, warnings) {
  if (!isObj(m)) {
    errors.push(`${where} is not an object.`);
    return null;
  }
  const name = str(m.name) || str(m.meal);
  if (!name) errors.push(`${where} has no "name" (like Breakfast).`);
  const label = name ? `${where} (${name})` : where;

  const items = strList(m.items ?? m.foods);
  if (items.length === 0) errors.push(`${label} has no foods. Add an "items" list like ["Dal", "Rice"].`);

  const out = { id: pickId(m.id, 'm', j, used), time: str(m.time), name, items };

  for (const key of ['calories', 'protein']) {
    if (m[key] === undefined || m[key] === null || m[key] === '') continue;
    const n = num(m[key]);
    if (n === null || n < 0) warnings.push(`${label}: "${key}" should be a number, so I ignored it.`);
    else out[key] = n;
  }
  return out;
}

function validateExtras(e, where, warnings) {
  const out = { waterLiters: null, supplements: [], notes: '' };
  if (e === undefined || e === null) return out;
  if (!isObj(e)) {
    warnings.push(`${where}: "extras" should be an object, so I ignored it.`);
    return out;
  }
  if (e.waterLiters !== undefined && e.waterLiters !== null && e.waterLiters !== '') {
    const n = num(e.waterLiters);
    if (n === null || n <= 0) warnings.push(`${where}: "waterLiters" should be a number, so I ignored it.`);
    else out.waterLiters = n;
  }
  out.supplements = strList(e.supplements);
  out.notes = str(e.notes);
  return out;
}

// ---------- the one function most code needs ----------

/** Text in, { ok, plan, errors, warnings } out. Never throws. */
export function parsePlanText(text) {
  try {
    const { value, error } = parseJsonLoose(text);
    if (error) return { ok: false, errors: [error], warnings: [] };
    return validatePlan(value);
  } catch (e) {
    return { ok: false, errors: ['Something unexpected went wrong reading that text: ' + e.message], warnings: [] };
  }
}
