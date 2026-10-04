// gemini.js
// OPTIONAL: let Google's Gemini turn a raw plan document into TickFit JSON, straight from the
// browser using the user's OWN free API key. TickFit never sees the key on any server, because
// there is no server. The key lives in this browser only.
//
// Privacy facts the UI also tells the user:
//   * The document text IS sent to Google when you use this. That is the whole point of the feature.
//   * On Google's free tier, what you send may be used to improve Google's products.
//   * The key is stored unencrypted in this browser (localStorage). Anyone using this device
//     profile, or a malicious browser extension, could read it.
//   * The key is kept OUT of backup files on purpose, so sharing a backup never leaks it.

import { buildPrompt } from './ai.js';

const KEY_STORE = 'tickfit:gemini'; // separate from the main data on purpose (see above)
export const DEFAULT_MODEL = 'gemini-flash-latest'; // an alias, so it keeps working as models change
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MAX_DOC_CHARS = 150000; // keeps requests well inside free-tier limits
const TIMEOUT_MS = 90000;

export function getGeminiConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
    return { key: typeof c.key === 'string' ? c.key : '', model: typeof c.model === 'string' && c.model ? c.model : DEFAULT_MODEL };
  } catch {
    return { key: '', model: DEFAULT_MODEL };
  }
}

export function saveGeminiConfig({ key, model }) {
  localStorage.setItem(KEY_STORE, JSON.stringify({ key: String(key || '').trim(), model: String(model || '').trim() || DEFAULT_MODEL }));
}

export function clearGeminiKey() {
  try {
    localStorage.removeItem(KEY_STORE);
  } catch {
    /* ignore */
  }
}

export const hasGeminiKey = () => !!getGeminiConfig().key;

/**
 * Send the document to Gemini and return the reply text (which should be plan JSON).
 * Throws an Error with a friendly message on any problem.
 */
export async function convertWithGemini(docText) {
  const { key, model } = getGeminiConfig();
  if (!key) throw new Error('Add your Gemini API key in More first.');
  if (!docText.trim()) throw new Error('Paste or upload your plan text first.');
  if (docText.length > MAX_DOC_CHARS) throw new Error(`That document is very long (${docText.length.toLocaleString()} characters). Trim it to under ${MAX_DOC_CHARS.toLocaleString()}.`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${ENDPOINT}${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, // header, not URL, so it never lands in logs
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(docText) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 32768 },
      }),
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Gemini took too long to answer. Try again, or use a shorter document.');
    throw new Error('Could not reach Gemini. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non JSON error body */
  }

  if (!res.ok) throw new Error(friendlyHttpError(res.status, data, model));

  const cand = data && data.candidates && data.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
  if (!text) {
    const block = data && data.promptFeedback && data.promptFeedback.blockReason;
    throw new Error(block ? `Gemini declined to answer (${block}).` : 'Gemini sent back an empty answer. Try again.');
  }
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini ran out of space before finishing. Try a shorter document (for example one or two weeks).');
  }
  return text;
}

function friendlyHttpError(status, data, model) {
  const detail = data && data.error && data.error.message ? ` (${data.error.message})` : '';
  if (status === 400 && /api key/i.test(detail)) return 'Gemini says that API key is not valid. Check it in More.';
  if (status === 401 || status === 403) return `Gemini refused the key${detail}. Check it in More.`;
  if (status === 404) return `Gemini does not know the model "${model}". Change the model name in More.`;
  if (status === 429) return 'You hit the free Gemini limit for now. Wait a minute and try again.';
  if (status >= 500) return 'Gemini is having trouble right now. Try again in a bit.';
  return `Gemini returned an error (${status})${detail}.`;
}
