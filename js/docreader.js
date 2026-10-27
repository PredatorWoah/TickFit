// docreader.js
// Reads a plan document by itself, on the phone, with no chatbot: when the text is laid out the way chatbots
// (and coaches) usually write a split. Chatbots lose days and flatten "Machine / No machine" pairs into separate
// exercises; this reads the layout exactly the same way every time.
//
//   MONDAY: Chest + Triceps                      a day heading (weekday, colon, what it is)
//   UPPER CHEST                                  a group name (optional)
//   1. Upper Chest Press ★                       a numbered exercise slot (★ = a big lift)
//   Machine: Incline Chest Press Machine. Cue.   each version of the slot: "Label: Name. Notes."
//   ▶ Watch machine version <the link address>  a link for that version (extract.js adds the address)
//   No machine: Decline Push Ups. Cue.
//   Finish: 15 min incline walk.                 a note for the day
//
// Sets, reps and rest come from lines like "Big lifts (marked ★): 3 sets x 8 to 12 reps, rest 90 to 120 seconds."
// Meals are read from a "Swap Options ... pick one" list and a "Time / Meal / kcal / Protein" table when there are
// some. Anything that does not look like this returns null, and the chatbot way is used instead.
//
// Pure functions, no browser code, so tests run in Node: node tests/docreader.mjs

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[:：\-–—]\s*(.*)$/i;
const GLYPHS = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍▶►•·●○▪■□✓✔→\s]+/u;
const NOT_A_VERSION = new Set(['finish', 'note', 'notes', 'tip', 'tips', 'cardio', 'warm up', 'warm-up', 'warmup', 'cool down', 'cooldown', 'rest', 'goal', 'stats', 'focus', 'time', 'gym time', 'progress rule', 'week 7', 'week 8 onward']);

const bare = (line) => line.replace(GLYPHS, '').trim();
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** "LEG DAY" -> "Leg Day"; text that already has lower case letters is left alone. */
const title = (t) => (/[a-z]/.test(t) ? t : t.toLowerCase().replace(/(^|[\s/+&-])([a-z])/g, (m, a, b) => a + b.toUpperCase()));
const oneSpace = (t) => t.replace(/\s+/g, ' ').trim();
const range = (t) => oneSpace(t).replace(/\s*(?:-|–)\s*/, ' to ');

// ---------- the sets, reps and rest rules ----------

const RULE_RE = /(\d+)\s*sets?\s*[x×]\s*(\d+(?:\s*(?:to|-|–)\s*\d+)?)\s*reps?\s*[,;.]?\s*(?:with\s+)?(?:rest\s*)?(?:of\s+)?(\d+(?:\s*(?:to|-|–)\s*\d+)?)\s*(seconds?|secs?|s\b|minutes?|mins?)/i;

function readRules(lines) {
  const found = { big: null, small: null };
  for (const raw of lines) {
    const l = bare(raw);
    const m = RULE_RE.exec(l);
    if (!m) continue;
    const unit = /^m/i.test(m[4]) ? ' min' : 's';
    const rule = { sets: Number(m[1]), reps: range(m[2]), rest: range(m[3]) + unit };
    const before = l.slice(0, m.index).toLowerCase();
    if (/big|main|heavy|compound|starred|marked|★/.test(before)) found.big ||= rule;
    else if (/small|light|accessor|isolation|other/.test(before)) found.small ||= rule;
    else found.big ||= rule;
  }
  return { big: found.big || found.small, small: found.small || found.big };
}

// ---------- one version of a slot: "Incline Press Machine. Cue one. Cue two." ----------

/** Name, notes and "(same as Tuesday)" reference of one version's text. */
function splitVersion(text) {
  const t = oneSpace(text);
  const open = t.indexOf('(');
  const dot = t.search(/\.(\s|$)/);
  let name;
  let notes;
  let ref = null;
  if (open > 0 && (dot < 0 || open < dot)) {
    const close = t.indexOf(')', open);
    const inside = close > open ? t.slice(open + 1, close) : t.slice(open + 1);
    name = t.slice(0, open).trim();
    let after = close > open ? t.slice(close + 1).replace(/^\s*\.?\s*/, '') : '';
    // "Reverse Grip (Underhand) Lat Pulldown. Cue." : words after the bracket still belong to the name
    const tail = close > open ? /^\s*([^.(]{2,40}?)\s*(?:\.(?:\s|$)|$)/.exec(t.slice(close + 1)) : null;
    if (tail && !/^same as/i.test(inside) && !/^\./.test(t.slice(close + 1).trim())) {
      name = `${name} ${tail[1]}`.trim();
      after = t.slice(close + 1 + tail[0].length).trim();
    }
    const same = /^same as\s+(\w+)/i.exec(inside);
    if (same) {
      ref = same[1].toLowerCase();
      notes = after;
    } else notes = [cap(inside.trim()) + (/[.!?]$/.test(inside.trim()) ? '' : '.'), after].filter(Boolean).join(' ');
  } else if (dot > 0) {
    name = t.slice(0, dot).trim();
    notes = t.slice(dot + 1).trim();
  } else {
    name = t.replace(/\.$/, '').trim();
    notes = '';
  }
  // a rep hint at the end of the notes ("15 reps.", "12 to 15 reps.") for this version
  let reps = null;
  const hint = /(?:^|\s)(\d+(?:\s*(?:to|-|–)\s*\d+)?)\s*reps?\.?\s*$/i.exec(notes);
  if (hint) reps = range(hint[1]);
  return { name: name.slice(0, 80), notes: notes.slice(0, 600), ref, reps };
}

// ---------- the days ----------

function stopIndex(lines, from) {
  for (let i = from; i < lines.length; i++) if (/^[A-Z][A-Z0-9 &'’]{3,}:/.test(bare(lines[i])) && !DAY_RE.test(bare(lines[i]))) return i;
  return lines.length;
}

function readDay(section, rules, warnings, label) {
  const slots = [];
  const notes = [];
  let intro = '';
  let category = '';
  let slot = null;
  let version = null;
  const closeSlot = () => {
    if (slot && slot.versions.length) slots.push(slot);
    slot = null;
    version = null;
  };
  for (const raw of section) {
    const l = bare(raw);
    if (!l) continue;
    const head = /^(\d+)[.)]\s+(.{2,80}?)\s*(★|\*)?\s*$/.exec(l);
    const fin = /^finish\s*:\s*(.+)$/i.exec(l);
    const ver = /^([A-Za-z][A-Za-z' +/-]{1,24}?):\s+(.+)$/.exec(l);
    const link = /^watch\b/i.test(l) ? /<(https?:\/\/[^>\s]+)>/.exec(l) : null;
    if (head && !/<https?:/.test(l)) {
      closeSlot();
      slot = { title: head[2].trim(), big: !!head[3] || /★/.test(raw), category, versions: [] };
    } else if (fin) {
      closeSlot();
      notes.push(`Finish: ${oneSpace(fin[1])}`);
      version = { finish: true };
    } else if (slot && ver && !NOT_A_VERSION.has(ver[1].trim().toLowerCase())) {
      version = { label: oneSpace(ver[1]), text: ver[2], url: '' };
      slot.versions.push(version);
    } else if (/^watch\b/i.test(l)) {
      if (link && version && !version.finish && !version.url) version.url = link[1];
    } else if (/^[A-Z][A-Z &+'’/-]{2,30}$/.test(l) && !/\d/.test(l)) {
      closeSlot();
      category = title(l);
    } else if (version && version.finish) {
      notes[notes.length - 1] += ` ${oneSpace(l)}`;
    } else if (version && !version.finish) {
      version.text += ` ${l}`; // a wrapped line of the same version
    } else if (!slot && slots.length === 0 && l.length < 160) {
      intro += (intro ? ' ' : '') + l;
    }
  }
  closeSlot();

  const workout = slots.map((s, k) => {
    const rule = (s.big ? rules.big : rules.small) || rules.small || rules.big;
    const parts = s.versions.map((v) => ({ ...splitVersion(v.text), label: v.label, url: v.url }));
    const first = parts[0];
    const ex = { exercise: first.name, sets: rule ? rule.sets : 3, reps: first.reps && !rule ? first.reps : rule ? rule.reps : '10 to 12', rest: rule ? rule.rest : '90s', notes: first.notes };
    if (first.reps && rule && first.reps !== rule.reps) ex.reps = first.reps;
    if (first.url) ex.video = first.url;
    if (parts.length > 1) {
      ex.version = first.label;
      ex.alternatives = parts.slice(1).map((p) => {
        const alt = { version: p.label, exercise: p.name };
        if (p.notes) alt.notes = p.notes;
        if (p.url) alt.video = p.url;
        if (p.reps && (!rule || p.reps !== rule.reps) && p.reps !== ex.reps) alt.reps = p.reps;
        return alt;
      });
    }
    return { ex, parts, slot: s, k };
  });
  if (!rules.big && !rules.small && workout.length) warnings.add('I could not find the sets and reps in the document, so every exercise is 3 sets of 10 to 12. Change them with "Edit this plan".');
  return { workout, notes: [intro && intro.length < 140 ? intro : '', ...notes].filter(Boolean), label };
}

// ---------- the meals (best effort) ----------

const TIME = '\\d{1,2}(?::\\d{2})?(?:\\s*(?:to|-|–)\\s*\\d{1,2}(?::\\d{2})?)?\\s*(?:AM|PM)';
const timeKey = (t) => oneSpace(String(t || '')).toLowerCase().replace(/\s*(?:-|–)\s*/, ' to ');
const kcalProtein = (s) => {
  const m = /\(\s*(\d[\d,]*)\s*kcal\s*,\s*(\d+(?:\.\d+)?)\s*g\s*\)\s*$/i.exec(s);
  return m ? { text: s.slice(0, m.index).trim(), calories: Number(m[1].replace(',', '')), protein: Number(m[2]) } : null;
};
const itemsOf = (t) => oneSpace(t).split(/\s+\+\s+/).map((x) => cap(x.replace(/\.$/, '').trim())).filter(Boolean);

function readSwapSlots(lines) {
  const start = lines.findIndex((l) => /^swap options/i.test(bare(l)));
  if (start < 0) return [];
  const slots = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    const l = bare(raw);
    if (!l) continue;
    const head = /^(.+?)\s*\(([^)]+)\)\s*,?\s*pick one\s*:?\s*$/i.exec(l);
    if (head) {
      cur = { name: cap(head[1].trim()), time: head[2].trim(), options: [] };
      slots.push(cur);
    } else if (cur && /^[•·\-*]\s*/.test(raw)) {
      const n = kcalProtein(raw.replace(/^[•·\-*]\s*/, ''));
      if (n) cur.options.push(n);
    } else if (cur && !/^[•·\-*]/.test(raw)) break; // the next heading
  }
  return slots.filter((s) => s.options.length);
}

function readTableRows(lines) {
  const rows = [];
  const startRe = new RegExp(`^(${TIME})\\b\\s*(\\(optional\\))?\\s*(.*)$`, 'i');
  const numbers = /^(\d[\d,]*)\s+(\d+(?:\.\d+)?)\s*g$/i;
  let cur = null;
  for (const raw of lines) {
    const l = bare(raw);
    if (!l || /^time\s+meal\s+kcal/i.test(l)) continue;
    if (/^total\b/i.test(l)) {
      cur = null;
      continue;
    }
    const s = startRe.exec(l);
    if (s) {
      cur = { time: oneSpace(s[1]), optional: !!s[2], text: s[3] || '', calories: null, protein: null };
      rows.push(cur);
      continue;
    }
    if (!cur) continue;
    const n = numbers.exec(l);
    if (n) {
      cur.calories = Number(n[1].replace(',', ''));
      cur.protein = Number(n[2]);
      cur = null;
    } else if (cur.text.length < 400) cur.text += ` ${l}`;
  }
  return rows.filter((r) => r.calories !== null || r.optional);
}

/** "Soya chunks (40 g dry, boiled) Hung curd dressing" -> base and add-on. */
function splitRotation(text) {
  const t = oneSpace(text);
  const open = t.indexOf('(');
  const close = open >= 0 ? t.indexOf(')', open) : -1;
  if (open >= 0 && close > open && close < t.length - 1 && t.slice(close + 1).trim()) return [t.slice(0, close + 1).trim(), t.slice(close + 1).trim()];
  const g = /\s(\d+(?:\.\d+)?\s*g\b)/.exec(t);
  if (g && !(open >= 0 && g.index > open && (close < 0 || g.index < close))) return [t.slice(0, g.index).trim(), t.slice(g.index).trim()];
  return [t, ''];
}

function readRotation(lines) {
  const start = lines.findIndex((l) => /^dinner bowl rotation/i.test(bare(l)));
  const out = {};
  if (start < 0) return out;
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = bare(lines[i]);
    if (!l || /^day\s+base\b/i.test(l)) continue;
    const m = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(.*)$/i.exec(l);
    if (m) {
      cur = m[1].toLowerCase();
      out[cur] = m[2];
    } else if (cur && !/^(season|calorie|values|the belly)/i.test(l) && out[cur].length < 200) out[cur] += ` ${l}`;
    else break;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, splitRotation(v)]));
}

function readMeals(lines) {
  const slots = readSwapSlots(lines);
  const rows = readTableRows(lines);
  const rotation = readRotation(lines);
  const library = {};
  for (const s of slots) {
    library[s.name] = s.options.map((o) => ({ name: s.name, time: s.time, items: itemsOf(o.text), calories: o.calories, protein: o.protein }));
  }
  const slotByTime = (time) => slots.find((s) => timeKey(s.time) === timeKey(time));
  const base = [];
  for (const r of rows) {
    if (r.optional) {
      (library.Optional ||= []).push({ name: 'Bedtime milk', time: r.time, items: itemsOf(r.text), calories: r.calories, protein: r.protein });
      continue;
    }
    const slot = slotByTime(r.time);
    const first = slot && slot.options[0] && slot.options[0].calories === r.calories ? slot.options[0] : null;
    const dinner = !slot && /salad|bowl|dinner/i.test(r.text);
    const name = slot ? slot.name : dinner ? 'Dinner bowl' : 'Meal';
    const body = r.text.replace(/^[^:]{3,40}:\s*/, ''); // "Your chillas, upgraded: 2 besan ..." -> "2 besan ..."
    base.push({ name, time: r.time, items: first ? itemsOf(first.text) : itemsOf(body), calories: r.calories, protein: r.protein, dinner });
  }
  return { base, library, rotation };
}

/** The dinner for a weekday: the table's bowl with that day's base and protein from the rotation. */
function dinnerFor(meal, weekday, rotation) {
  const r = rotation[weekday];
  if (!r || !r[0]) return meal;
  const salad = (meal.items.join(' + ').match(/^(?:.*?:\s*)?([^+]*?)(?:\s*\+|$)/) || [])[1];
  const veg = /cucumber|tomato|onion|lemon|salad/i.test(salad || '') ? cap((salad || '').replace(/^[^:]*:\s*/, '')) : '';
  return { ...meal, items: [veg, `1 bowl ${r[0].replace(/^(\d+\s*bowl\s*)/i, '')}`, r[1]].filter(Boolean) };
}

// ---------- the whole document ----------

/**
 * Read a plan document. Returns { plan, report } where `plan` is plan JSON (still to be checked by validatePlan)
 * and `report` says what was found; or null when the text is not laid out like this.
 */
export function readStructuredPlan(text) {
  const lines = String(text || '').replace(/[​-‍﻿]/g, '').replace(/ /g, ' ').split(/\r?\n/).map((l) => l.trim());
  const heads = [];
  lines.forEach((l, i) => {
    const m = DAY_RE.exec(bare(l));
    if (m && m[2].length < 80) heads.push({ i, weekday: m[1].toLowerCase(), focus: m[2].trim() });
  });
  if (heads.length < 2) return null;

  const warnings = new Set();
  const rules = readRules(lines.slice(0, heads[0].i));
  const days = heads.map((hd, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].i : stopIndex(lines, hd.i + 1);
    const label = `${cap(hd.weekday)} ${title(hd.focus)}`.trim();
    return { ...readDay(lines.slice(hd.i + 1, end), rules, warnings, label), weekday: hd.weekday };
  });
  const trained = days.filter((d) => d.workout.length);
  if (trained.length < 2) return null; // not this layout: leave it to the chatbot

  // "(same as Tuesday)": take the notes from that day's exercise with the same name
  for (const d of days) {
    for (const item of d.workout) {
      item.parts.forEach((p, n) => {
        if (!p.ref) return;
        const from = days.filter((x) => x.weekday === p.ref || WEEKDAYS.indexOf(p.ref) < 0).flatMap((x) => x.workout);
        const hit = from.flatMap((x) => x.parts).find((q) => q !== p && q.name.toLowerCase() === p.name.toLowerCase() && q.notes);
        if (hit) {
          const target = n === 0 ? item.ex : item.ex.alternatives[n - 1];
          if (!target.notes) target.notes = hit.notes;
          if (!target.video && hit.url && !p.url) target.video = hit.url;
        }
      });
    }
  }

  const meals = readMeals(lines);
  const mealNote = meals.base.length ? '' : 'I could not read any meals from this document. You can add them with "Edit this plan".';
  const first = lines.find((l) => l);
  const name = first && first.length <= 80 && !DAY_RE.test(bare(first)) ? first.replace(/\s+/g, ' ') : 'Imported plan';

  const plan = {
    name,
    days: days.map((d) => ({
      label: d.label,
      workout: d.workout.map((w) => w.ex),
      meals: meals.base.map((m) => {
        const x = m.dinner ? dinnerFor(m, d.weekday, meals.rotation) : m;
        return { time: x.time, name: x.name, items: x.items, calories: x.calories, protein: x.protein };
      }),
      extras: { notes: d.notes.join('\n') },
    })),
  };
  if (Object.keys(meals.library).length) plan.library = { meals: meals.library };

  const exercises = days.reduce((t, d) => t + d.workout.length, 0);
  const versioned = days.reduce((t, d) => t + d.workout.filter((w) => w.ex.alternatives).length, 0);
  const missing = days.reduce((t, d) => t + d.workout.filter((w) => w.parts.length === 1).length, 0);
  const report = {
    days: days.length,
    trainingDays: trained.length,
    exercises,
    versioned,
    videos: days.reduce((t, d) => t + d.workout.reduce((n, w) => n + w.parts.filter((p) => p.url).length, 0), 0),
    mealsPerDay: meals.base.length,
    swapMeals: Object.values(meals.library).reduce((t, l) => t + l.length, 0),
    notes: [...warnings, mealNote].filter(Boolean),
    single: missing,
  };
  return { plan, report };
}

/** One line for the status text: what was read. */
export function describeReport(r) {
  const parts = [`${r.days} days (${r.trainingDays} with exercises)`, `${r.exercises} exercises`];
  if (r.versioned) parts.push(`${r.versioned} with a second version`);
  if (r.videos) parts.push(`${r.videos} video links`);
  if (r.mealsPerDay) parts.push(`${r.mealsPerDay} meals a day${r.swapMeals ? ` and ${r.swapMeals} swap options` : ''}`);
  return parts.join(', ');
}
