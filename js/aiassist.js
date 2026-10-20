// aiassist.js
// The small AI helpers, using whichever AI the person set up in More (llm.js: OpenRouter, OpenAI, Claude or
// Gemini), each with their own key, straight from their browser. Nothing here runs unless AI is switched on.
//
//   * convertPlanWithAI(text)   turn a plan document into TickFit JSON (the Import screen)
//   * suggest(kind, context)    ideas for exercises or meals for one day (the Choose exercises / meals sheet)
//
// Only what the request needs is sent: for suggestions that is the day's name, its focus, the names already
// chosen and, if the plan builder was used, the goal, experience, equipment, injuries and diet. Never your
// history, weights or notes.

import { activeProvider, ask } from './llm.js';
import { buildPrompt } from './ai.js';
import { parseJsonLoose } from './parser.js';
import { getState } from './store.js';

const MAX_SUGGESTIONS = 8;
const MAX_DOC_CHARS = 200000;

/** The AI to use (the one picked in More), or null when AI is off or no key is set. */
export const activeAI = () => activeProvider();

/** Convert a plan document with the active AI. Returns the reply text (plan JSON). */
export async function convertPlanWithAI(docText, opts = {}) {
  if (!activeAI()) throw new Error('Turn on AI helpers and add a key in More first.');
  if (!docText.trim()) throw new Error('Paste or upload your plan text first.');
  if (docText.length > MAX_DOC_CHARS) throw new Error(`That document is very long (${docText.length.toLocaleString()} characters). Trim it to under ${MAX_DOC_CHARS.toLocaleString()}.`);
  return ask(buildPrompt(docText), { maxTokens: 32000, effort: 'medium', ...opts });
}

/** The prompt for suggestions. Pure, so it can be tested. */
export function suggestPrompt(kind, { dayLabel = '', focus = [], have = [], profile = null } = {}) {
  const p = profile || {};
  const about = [
    p.goal && `Goal: ${p.goal}.`,
    p.experience && `Experience: ${p.experience}.`,
    kind === 'workout' && p.equip && `Equipment: ${p.equip}.`,
    kind === 'workout' && p.avoid && p.avoid.length && `Avoid anything hard on: ${[].concat(p.avoid).join(', ')}.`,
    kind === 'meals' && p.diet && `Diet: ${p.diet}.`,
  ].filter(Boolean);
  const shape =
    kind === 'workout'
      ? '[{"exercise": "Lat Pulldown", "category": "Back", "sets": 3, "reps": "8 to 12", "rest": "90s", "notes": "one short tip"}]'
      : '[{"name": "Paneer bhurji wrap", "category": "Lunch", "items": ["100 g paneer bhurji", "2 rotis"], "calories": 520, "protein": 28}]';
  return [
    `You help someone plan ${kind === 'workout' ? 'a gym workout' : 'meals'} in a checklist app called TickFit.`,
    `Today is "${dayLabel || 'a training day'}"${focus.length ? `, focused on ${focus.join(', ')}` : ''}.`,
    have.length ? `They already have: ${have.join('; ')}. Suggest DIFFERENT ones that fit well with these.` : '',
    about.join(' '),
    kind === 'workout'
      ? `Suggest up to ${MAX_SUGGESTIONS} exercises with standard names. Use the category for the main muscle group (Chest, Back, Shoulders, Biceps, Triceps, Legs, Core, Cardio).`
      : `Suggest up to ${MAX_SUGGESTIONS} meals of common Indian home food unless their diet says otherwise, each with realistic calories and protein (grams).`,
    'Be safe and realistic. No medical advice.',
    `Return ONLY a JSON array, no other text, shaped like: ${shape}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Turn the AI's reply into clean items. Anything odd is dropped, never trusted. Pure. */
export function parseSuggestions(kind, text) {
  const { value } = parseJsonLoose(text);
  let list = Array.isArray(value) ? value : value && Array.isArray(value.suggestions) ? value.suggestions : [];
  list = list.filter((x) => x && typeof x === 'object').slice(0, MAX_SUGGESTIONS);
  if (kind === 'workout') {
    return list
      .map((x) => ({ exercise: str(x.exercise || x.name).slice(0, 80), category: str(x.category).slice(0, 40), sets: Math.min(10, num(x.sets) || 3), reps: str(x.reps).slice(0, 30) || '10', rest: str(x.rest).slice(0, 20), weight: '', notes: str(x.notes).slice(0, 200), video: '' }))
      .filter((x) => x.exercise);
  }
  return list
    .map((x) => {
      const items = (Array.isArray(x.items) ? x.items : [x.items]).map(str).filter(Boolean).slice(0, 12);
      const m = { name: str(x.name).slice(0, 80), category: str(x.category).slice(0, 40), time: '', items: items.length ? items : [str(x.name)] };
      const k = num(x.calories);
      const p = num(x.protein);
      if (k !== null && k < 5000) m.calories = k;
      if (p !== null && p < 400) m.protein = p;
      return m;
    })
    .filter((x) => x.name);
}

/** Ask the active AI for exercise or meal ideas. Returns clean items (see parseSuggestions). */
export async function suggest(kind, context, opts = {}) {
  const ai = activeAI();
  if (!ai) throw new Error('Turn on AI helpers and add a key in More first.');
  const prompt = suggestPrompt(kind, { ...context, profile: (getState().settings || {}).profile || null });
  const text = await ask(prompt, { maxTokens: 4000, effort: 'low', ...opts });
  const items = parseSuggestions(kind, text);
  if (!items.length) throw new Error(`${ai.name} did not send any usable suggestions. Try again.`);
  return items;
}
