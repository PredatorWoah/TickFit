// llm.js
// OPTIONAL AI, with the person's OWN key, straight from their browser or phone. Four providers:
//   openrouter  OpenRouter: one key, hundreds of models, a good number of them free (https://openrouter.ai)
//   openai    OpenAI (ChatGPT's models)
//   claude    Anthropic's Claude   (claude.js)
//   gemini    Google's Gemini      (gemini.js)
// There is no TickFit server. Keys stay on this device (each in its own storage slot, never in backups).
// Everything here is off unless the person ticks "Use AI helpers" in More (aiEnabled).
//
// When the provider says the usage or rate limit ran out (HTTP 429, or a quota message), ask() does not give up:
// it waits until the limit resets (the provider's Retry-After when it sends one) and tries again by itself,
// telling the screen what it is waiting for through onWait. Closing the sheet cancels it.

import { getState } from './store.js';
import { getClaudeConfig, saveClaudeConfig, clearClaudeKey, askClaude, DEFAULT_CLAUDE_MODEL } from './claude.js';
import { getGeminiConfig, saveGeminiConfig, clearGeminiKey, askGemini, DEFAULT_MODEL as DEFAULT_GEMINI_MODEL } from './gemini.js';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const OPENAI_BASE = 'https://api.openai.com/v1';
const TIMEOUT_MS = 180000;

/** Everything the More screen needs to explain each provider: where to get a key, what it costs. */
export const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    store: 'tickfit:openrouter',
    defaultModel: '', // none fixed: the free models change often, so one is picked from the live list (pickModel)
    keyUrl: 'https://openrouter.ai/settings/keys',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    steps: ['Open openrouter.ai and sign in (Google, GitHub or email).', 'Go to Settings > Keys, tap Create key (you can set a spending limit) and copy it.', 'Paste it here and tap Save. TickFit lists every model, with the free ones marked, and picks a free one to start.'],
    cost: 'Free models (marked Free) cost nothing but have a daily limit, which is larger once you have added some credit. The others are paid per use from your OpenRouter credit. Some free models keep what you send to improve themselves.',
  },
  openai: {
    name: 'ChatGPT (OpenAI)',
    store: 'tickfit:openai',
    defaultModel: 'gpt-5-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/overview',
    steps: ['Open platform.openai.com/api-keys and sign in.', 'Tap "Create new secret key" and copy it.', 'Add a little credit under Billing (the API is not part of a ChatGPT Plus subscription).'],
    cost: 'Paid per use from your OpenAI credit.',
  },
  claude: {
    name: 'Claude (Anthropic)',
    defaultModel: DEFAULT_CLAUDE_MODEL,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    steps: ['Open console.anthropic.com, sign in and add credit under Billing.', 'Go to API Keys and create a key.', 'Paste it here and tap Save.'],
    cost: 'Paid per use from your Anthropic credit.',
  },
  gemini: {
    name: 'Gemini (Google)',
    defaultModel: DEFAULT_GEMINI_MODEL,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    steps: ['Open aistudio.google.com/app/apikey and sign in with Google.', 'Tap "Create API key" and copy it.', 'Paste it here and tap Save.'],
    cost: 'Has a free tier with daily limits. On the free tier Google may use what you send to improve its products.',
  },
};
export const PROVIDER_IDS = ['openrouter', 'openai', 'claude', 'gemini'];

// OpenCode Zen was offered in 2.1 to 2.3 and is replaced by OpenRouter: forget its key, it is no use any more
try {
  localStorage.removeItem('tickfit:opencode');
} catch {
  /* no storage here */
}

// ----- keys and models, one storage slot per provider -----

function readStore(store, defaultModel) {
  try {
    const c = JSON.parse(localStorage.getItem(store) || '{}');
    return { key: typeof c.key === 'string' ? c.key : '', model: typeof c.model === 'string' && c.model ? c.model : defaultModel };
  } catch {
    return { key: '', model: defaultModel };
  }
}

export function getConfig(id) {
  if (id === 'claude') return getClaudeConfig();
  if (id === 'gemini') return getGeminiConfig();
  const p = PROVIDERS[id];
  return p ? readStore(p.store, p.defaultModel) : { key: '', model: '' };
}

export function saveConfig(id, { key, model }) {
  if (id === 'claude') return saveClaudeConfig({ key, model });
  if (id === 'gemini') return saveGeminiConfig({ key, model });
  const p = PROVIDERS[id];
  localStorage.setItem(p.store, JSON.stringify({ key: String(key || '').trim(), model: String(model || '').trim() || p.defaultModel }));
}

export function clearKey(id) {
  if (id === 'claude') return clearClaudeKey();
  if (id === 'gemini') return clearGeminiKey();
  try {
    localStorage.removeItem(PROVIDERS[id].store);
  } catch {
    /* ignore */
  }
}

export const hasKey = (id) => !!getConfig(id).key;
export const anyKey = () => PROVIDER_IDS.some(hasKey);

/** Is AI switched on? The box in More. People who set a key before 2.1 keep it on until they untick it. */
export function aiEnabled(settings = getState().settings || {}) {
  if (settings.aiOn === true) return anyKey();
  if (settings.aiOn === false) return false;
  return anyKey();
}

/** The provider to use: the one picked in More if its key is set, else the first with a key. Null when off. */
export function activeProvider(settings = getState().settings || {}) {
  if (!aiEnabled(settings)) return null;
  const id = hasKey(settings.aiProvider) ? settings.aiProvider : PROVIDER_IDS.find(hasKey);
  return id ? { id, name: PROVIDERS[id].name, model: getConfig(id).model } : null;
}

// ----- the model list (for the dropdown) -----

/** Free OpenRouter models: ids ending in ":free", or both prices "0". Pure. */
export function isFreeModel(id, pricing) {
  if (/:free$/i.test(String(id))) return true;
  return !!pricing && Number(pricing.prompt) === 0 && Number(pricing.completion) === 0 && pricing.prompt !== undefined && pricing.completion !== undefined;
}

/** Who makes it: "meta-llama/llama-3.3-70b-instruct:free" -> "meta-llama", "claude-sonnet-4-5" -> "claude". Pure. */
export function modelFamily(id) {
  const s = String(id).toLowerCase().replace(/^models\//, '');
  if (s.includes('/')) return s.split('/')[0] || 'other';
  const m = s.match(/^[a-z]+/);
  return m ? m[0] : 'other';
}

// Free models worth starting with, best first (matched against the live list, so a missing one is just skipped).
// What is free changes every few weeks: as of October 2026 NVIDIA's Nemotron 3 Ultra is the strongest free
// model for planning and strict JSON, then Nemotron Super (not the vision one), then MiniMax Flash. The older
// names stay as fallbacks in case they come back.
const STARTERS = [/nemotron-[\d.]+-ultra/i, /nemotron-[\d.]+-super(?!.*-vl)/i, /nemotron-[\d.]+-super/i, /minimax.*flash/i, /deepseek.*(v3|chat|r1)/i, /llama-3\.3-70b/i, /qwen.*(72b|235b|max|plus|qwen3)/i, /gemini.*flash/i, /mistral.*(small|medium|nemo)/i, /gemma/i];

/** A sensible free model from a normalised list, for when none is chosen yet. Null if none are free. Pure. */
export function pickModel(models) {
  const free = (models || []).filter((m) => m.free && !/^openrouter\//.test(m.id));
  for (const re of STARTERS) {
    const hit = free.find((m) => re.test(m.id));
    if (hit) return hit.id;
  }
  return free.length ? free[0].id : null;
}

/**
 * Narrow a model list: { free: true } keeps the free ones, family keeps one family, text matches anywhere.
 * Free ones first, then by name. Pure.
 */
export function filterModels(models, { free = false, family = '', text = '' } = {}) {
  const q = String(text).trim().toLowerCase();
  return models
    .filter((m) => (!free || m.free) && (!family || m.family === family) && (!q || m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.free === b.free ? a.id.localeCompare(b.id) : a.free ? -1 : 1));
}

/** Make one shape out of each provider's model list: [{ id, name, free, family }]. Pure. */
export function normalizeModels(id, json) {
  let list = [];
  if (id === 'gemini') list = ((json && json.models) || []).filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), name: m.displayName || '' }));
  else list = ((json && json.data) || []).map((m) => ({ id: String(m.id || ''), name: m.display_name || m.name || '', pricing: m.pricing }));
  if (id === 'openai') list = list.filter((m) => /^(gpt|o\d|chatgpt)/i.test(m.id) && !/(audio|realtime|tts|transcribe|image|search|embedding)/i.test(m.id));
  return list.filter((m) => m.id).map(({ pricing, ...m }) => ({ ...m, free: id === 'openrouter' ? isFreeModel(m.id, pricing) : false, family: modelFamily(m.id) }));
}

/** Ask the provider which models this key can use. Throws a friendly Error. */
export async function listModels(id) {
  const { key } = getConfig(id);
  if (!key) throw new Error('Save a key first.');
  const req = {
    openrouter: [`${OPENROUTER_BASE}/models`, { headers: { Authorization: `Bearer ${key}` } }],
    openai: [`${OPENAI_BASE}/models`, { headers: { Authorization: `Bearer ${key}` } }],
    claude: ['https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }],
    gemini: ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }],
  }[id];
  const res = await send(req[0], { method: 'GET', ...req[1] });
  return normalizeModels(id, await res.json());
}

// ----- asking -----

/** Thrown when the usage or rate limit ran out. `retryAt` is when to try again (ms since 1970). */
export class QuotaError extends Error {
  constructor(message, retryAt) {
    super(message);
    this.name = 'QuotaError';
    this.retryAt = retryAt;
  }
}

/** When to try again after a 429: the provider's Retry-After (seconds or a date), else a backoff. Pure. */
export function retryAtFrom(headers, attempt = 0, now = Date.now()) {
  const get = (n) => (headers && typeof headers.get === 'function' ? headers.get(n) : headers ? headers[n] : null);
  const ra = get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (isFinite(secs)) return now + Math.max(1, secs) * 1000;
    const at = Date.parse(ra);
    if (!isNaN(at)) return Math.max(now + 1000, at);
  }
  // OpenRouter sends when the limit resets, in ms since 1970 (only readable when the browser is allowed to see it)
  const reset = Number(get('x-ratelimit-reset'));
  if (isFinite(reset) && reset > 1e12) return Math.max(now + 1000, Math.min(reset, now + 24 * 60 * 60 * 1000));
  return now + Math.min(60 * 60 * 1000, 30000 * 2 ** attempt); // 30 s, 1 min, 2 min ... up to an hour
}

const QUOTA_WORDS = /quota|rate.?limit|resource.?exhausted|insufficient.?quota|too many requests|usage limit|credit/i;

async function send(url, init, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('The AI took too long to answer. Try again.');
    throw new Error('Could not reach the AI. Check the internet connection (some networks block it).');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res;
  let msg = '';
  try {
    const data = await res.json();
    msg = (data && data.error && (data.error.message || data.error)) || (data && data.message) || '';
  } catch {
    /* not JSON */
  }
  msg = String(msg || '').slice(0, 300);
  // OpenRouter: 402 means the credit is used up; waiting won't fix that, a free model or more credit will
  if (res.status === 402 && url.startsWith(OPENROUTER_BASE)) throw Object.assign(new Error('Your OpenRouter credit has run out. Pick a free model in More, or add credit on openrouter.ai.'), { final: true });
  if (res.status === 429 || (res.status === 402 && QUOTA_WORDS.test(msg)) || (res.status === 403 && QUOTA_WORDS.test(msg))) throw new QuotaError(msg || 'Your AI usage limit ran out for now.', retryAtFrom(res.headers, attempt));
  if (res.status === 401 || res.status === 403) throw new Error('The key was not accepted. Check it in More.');
  if (res.status === 404) throw new Error(`That model was not found${msg ? `: ${msg}` : ''}. Pick another in More.`);
  throw new Error(`The AI said no (${res.status})${msg ? `: ${msg}` : ''}.`);
}

/** OpenAI-style chat (OpenAI and OpenRouter). */
async function chatCompat(base, key, model, prompt, system, maxTokens, isOpenAI, extraHeaders = {}) {
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
  const body = { model, messages };
  if (isOpenAI) body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;
  const res = await send(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders }, body: JSON.stringify(body) });
  const data = await res.json();
  // OpenRouter can answer 200 with an error from the model's host inside
  if (data && data.error && !data.choices) throw new Error(`The AI said no${data.error.message ? `: ${String(data.error.message).slice(0, 200)}` : ''}.`);
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('The AI sent an empty answer. Try again or pick another model.');
  return text;
}

/** OpenRouter: every model speaks the OpenAI chat format. With no model chosen yet, a free one is picked. */
async function askOpenRouter(key, model, prompt, system, maxTokens) {
  if (!model) {
    model = pickModel(await listModels('openrouter'));
    if (!model) throw new Error('No free model is available on OpenRouter right now. Pick one in More.');
    saveConfig('openrouter', { key, model });
  }
  // the app's name, as OpenRouter asks (it shows on their usage page)
  return chatCompat(OPENROUTER_BASE, key, model, prompt, system, maxTokens, false, { 'X-Title': 'TickFit' });
}

/** One try with the active provider. */
async function askOnce(prompt, { system = '', maxTokens = 4000, effort = 'low' } = {}, attempt = 0) {
  const p = activeProvider();
  if (!p) throw new Error('Turn on AI helpers and add a key in More first.');
  const { key, model } = getConfig(p.id);
  try {
    if (p.id === 'claude') return await askClaude(system ? `${system}\n\n${prompt}` : prompt, { maxTokens, effort });
    if (p.id === 'gemini') return await askGemini(system ? `${system}\n\n${prompt}` : prompt, { maxTokens });
    if (p.id === 'openai') return await chatCompat(OPENAI_BASE, key, model, prompt, system, maxTokens, true);
    return await askOpenRouter(key, model, prompt, system, maxTokens);
  } catch (e) {
    // claude.js and gemini.js throw plain Errors: spot their quota messages too
    if (!(e instanceof QuotaError) && !(e && e.final) && QUOTA_WORDS.test(String(e && e.message))) throw new QuotaError(e.message, retryAtFrom(null, attempt));
    throw e;
  }
}

/**
 * Ask the active AI. If the usage limit runs out it waits for the reset and tries again by itself, as often as
 * needed, calling onWait(retryAt, message) each time. `signal` (an AbortSignal) cancels the wait.
 */
export async function ask(prompt, opts = {}) {
  const { onWait, signal } = opts;
  for (let attempt = 0; ; attempt++) {
    if (signal && signal.aborted) throw new Error('Stopped.');
    try {
      return await askOnce(prompt, opts, attempt);
    } catch (e) {
      if (!(e instanceof QuotaError)) throw e;
      if (onWait) onWait(e.retryAt, e.message);
      await waitUntil(e.retryAt, signal);
    }
  }
}

/** Sleep until `at`, waking early when the phone comes back online. Rejects when `signal` aborts. */
export function waitUntil(at, signal) {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(t);
      window.removeEventListener('online', early);
      if (signal) signal.removeEventListener('abort', stop);
    };
    const t = setTimeout(() => (done(), resolve()), Math.max(0, at - Date.now()));
    const early = () => Date.now() >= at - 5000 && (done(), resolve());
    const stop = () => (done(), reject(new Error('Stopped.')));
    window.addEventListener('online', early);
    if (signal) signal.addEventListener('abort', stop);
  });
}
