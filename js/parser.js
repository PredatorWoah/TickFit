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

  // Days
  if (!Array.isArray(raw.days)) {
    errors.push('The plan needs a "days" list, for example "days": [ { "label": "Day 1", ... } ].');
    return { ok: false, errors, warnings };
  }
  if (raw.days.length === 0) {
    errors.push('The "days" list is empty. Add at least one day.');
    return { ok: false, errors, warnings };
  }
  if (raw.days.length > MAX_DAYS) {
    errors.push(`The plan has ${raw.days.length} days. The maximum is ${MAX_DAYS}.`);
    return { ok: false, errors, warnings };
  }

  const days = raw.days.map((d, i) => validateDay(d, i, errors, warnings));

  const plan = { name, days };
  if (typeof raw.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate.trim())) {
    plan.startDate = raw.startDate.trim();
  }
  return { ok: errors.length === 0, plan: errors.length ? undefined : plan, errors, warnings };
}

function validateDay(d, i, errors, warnings) {
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
  if (d.workout === undefined || d.workout === null) {
    errors.push(`${where} is missing "workout". Use an empty list [] for a rest day.`);
  } else if (!Array.isArray(d.workout)) {
    errors.push(`${where}: "workout" must be a list. Use [] for a rest day.`);
  } else {
    const used = new Set();
    workout = d.workout.map((w, j) => validateExercise(w, `${where}, exercise ${j + 1}`, j, used, errors, warnings));
  }

  // Meals
  let meals = [];
  if (d.meals === undefined || d.meals === null) {
    errors.push(`${where} is missing meals. Add a "meals" list.`);
  } else if (!Array.isArray(d.meals)) {
    errors.push(`${where}: "meals" must be a list.`);
  } else {
    const used = new Set();
    meals = d.meals.map((m, j) => validateMeal(m, `${where}, meal ${j + 1}`, j, used, errors, warnings));
  }

  // Extras are optional
  const extras = validateExtras(d.extras, where, warnings);

  return { label, workout, meals, extras };
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

  return {
    id: pickId(w.id, 'w', j, used),
    exercise,
    sets: sets === null ? null : Math.round(sets),
    reps: str(w.reps),
    rest,
    notes: str(w.notes),
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
