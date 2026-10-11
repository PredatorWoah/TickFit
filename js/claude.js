// claude.js
// OPTIONAL: use Anthropic's Claude with the person's OWN API key, straight from the browser. Same rules as
// gemini.js: there is no TickFit server, the key stays in this browser only, and it is never in backups.
//
// Privacy facts the UI also tells the person:
//   * What you ask about (a plan document, or a day's exercise names) IS sent to Anthropic. That is the point.
//   * The key is stored unencrypted in this browser (localStorage), separate from your data.
//   * Using the API costs money on your Anthropic account (there is no free tier like Gemini's).
//
// A plain fetch, not Anthropic's SDK: TickFit has no build step and only loads its own files (see index.html's
// Content-Security-Policy), so pulling in a library is not an option. The request shape follows the Messages API.

const KEY_STORE = 'tickfit:claude'; // separate from the main data on purpose
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 180000;

export function getClaudeConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
    return { key: typeof c.key === 'string' ? c.key : '', model: typeof c.model === 'string' && c.model ? c.model : DEFAULT_CLAUDE_MODEL };
  } catch {
    return { key: '', model: DEFAULT_CLAUDE_MODEL };
  }
}

export function saveClaudeConfig({ key, model }) {
  localStorage.setItem(KEY_STORE, JSON.stringify({ key: String(key || '').trim(), model: String(model || '').trim() || DEFAULT_CLAUDE_MODEL }));
}

export function clearClaudeKey() {
  try {
    localStorage.removeItem(KEY_STORE);
  } catch {
    /* ignore */
  }
}

export const hasClaudeKey = () => !!getClaudeConfig().key;

// Newer models take an effort level, and the current flagship models can fall back to another model when a
// safety check declines a request. Older model names the person may type get a plain request.
const supportsEffort = (m) => /^claude-(opus-5|sonnet-5|fable-5|haiku-5)/.test(m);
const supportsFallback = (m) => /^claude-(opus-5|sonnet-5-5|fable-5-1)/.test(m);

/**
 * Ask Claude and return the answer text. Long answers are streamed, so a big plan never hits a timeout.
 * Throws an Error with a friendly message on any problem.
 * @param prompt     the full prompt text
 * @param maxTokens  room for the answer
 * @param effort     'low' for quick suggestions, 'medium' for converting a plan
 */
export async function askClaude(prompt, { maxTokens = 16000, effort = 'low' } = {}) {
  const { key, model } = getClaudeConfig();
  if (!key) throw new Error('Add your Claude API key in More first.');

  const body = { model, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] };
  if (supportsEffort(model)) body.output_config = { effort };
  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true', // the key is the person's own, used from their own browser
  };
  if (supportsFallback(model)) {
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', signal: controller.signal, headers, body: JSON.stringify(body) });
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non JSON error body */
      }
      throw new Error(friendlyHttpError(res.status, data, model));
    }
    return await readStream(res);
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Claude took too long to answer. Try again, or use a shorter document.');
    if (e instanceof TypeError) throw new Error('Could not reach Claude. Check your internet connection.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Read the server-sent events and put the answer's text back together. */
async function readStream(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stop = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const line = event.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let data;
      try {
        data = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') text += data.delta.text;
      else if (data.type === 'message_delta' && data.delta && data.delta.stop_reason) stop = data.delta.stop_reason;
      else if (data.type === 'error') throw new Error(`Claude had a problem: ${(data.error && data.error.message) || 'unknown error'}. Try again.`);
    }
  }
  if (stop === 'refusal') throw new Error('Claude declined to answer this one. Try rewording it.');
  if (stop === 'max_tokens') throw new Error('Claude ran out of space before finishing. Try a shorter document (for example one or two weeks).');
  if (!text.trim()) throw new Error('Claude sent back an empty answer. Try again.');
  return text;
}

function friendlyHttpError(status, data, model) {
  const detail = data && data.error && data.error.message ? ` (${data.error.message})` : '';
  if (status === 401) return 'Claude says that API key is not valid. Check it in More.';
  if (status === 403) return `Claude refused the key${detail}. Check it in More.`;
  if (status === 404) return `Claude does not know the model "${model}". Change the model name in More.`;
  if (status === 400 && /credit|billing/i.test(detail)) return 'Your Anthropic account has no credit left. Add some in the Anthropic Console.';
  if (status === 429) return 'Too many requests to Claude for now. Wait a minute and try again.';
  if (status === 529 || status >= 500) return 'Claude is busy or having trouble right now. Try again in a bit.';
  return `Claude returned an error (${status})${detail}.`;
}
