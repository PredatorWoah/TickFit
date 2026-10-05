// notes.js
// Turns a day's notes (often one long paragraph) into tidy points. Pure functions, easy to test.
//
//   parseNotes("Weeks 1 and 2: 2 sets. Protein target: 130 g. Chest pain means stop.")
//   -> { points: [{ label: "Weeks 1 and 2", text: "2 sets." }, { label: "Protein target", text: "130 g." }],
//        warnings: [{ label: null, text: "Chest pain means stop." }] }

/** Words that make a sentence a safety warning. These are grouped at the bottom in their own box. */
const WARNING = /\b(chest pain|dizz\w*|breathless\w*|sharp pain|pain means stop|not medical advice|see a doctor|check with a doctor|injur\w*)\b/i;

/** Split a paragraph into sentences without regex lookbehind (older iPhones do not support it). */
export function splitSentences(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const out = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const end = /[.!?]/.test(t[i]) && (i + 1 === t.length || t[i + 1] === ' ') && !/[.!?]/.test(t[i + 1] || ''); // "3.5" and "e.g.x" stay whole
    if (end) {
      out.push(t.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  if (start < t.length) out.push(t.slice(start).trim());
  return out.filter(Boolean);
}

/** "Warm up for 8 min: 5 min walk" -> { label: "Warm up for 8 min", text: "5 min walk" }. Only short leading labels count. */
function splitLabel(sentence) {
  const i = sentence.indexOf(':');
  if (i > 0 && i <= 48 && sentence.slice(0, i).trim().split(/\s+/).length <= 7 && sentence.slice(i + 1).trim()) {
    return { label: sentence.slice(0, i).trim(), text: sentence.slice(i + 1).trim() };
  }
  return { label: null, text: sentence };
}

/**
 * Notes -> { points, warnings }. If you wrote one point per line, each line is a point (bullet marks
 * like "-" or "*" are removed). Otherwise the paragraph is split into sentences.
 */
export function parseNotes(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return { points: [], warnings: [] };
  const lines = raw.split('\n').map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const sentences = lines.length > 1 ? lines : splitSentences(raw);
  const points = [];
  const warnings = [];
  for (const s of sentences) (WARNING.test(s) ? warnings : points).push(splitLabel(s));
  return { points, warnings };
}

/** Rewrite notes as one point per line (what the "Tidy up" button does). */
export function tidyNotes(text) {
  const { points, warnings } = parseNotes(text);
  return [...points, ...warnings].map((p) => (p.label ? `${p.label}: ${p.text}` : p.text)).join('\n');
}

/** How many other days carry exactly this note (so we can offer "save for all days"). */
export function daysWithNote(plan, text, exceptIndex = -1) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  return plan.days.map((d, i) => i).filter((i) => i !== exceptIndex && String((plan.days[i].extras || {}).notes ?? '').trim() === t);
}
