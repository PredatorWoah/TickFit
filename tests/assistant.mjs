// Tests for the optional AI: providers and models (llm.js) and the assistant's actions (assistant.js).
// Run: node tests/assistant.mjs
import { isFreeModel, modelFamily, filterModels, normalizeModels, pickModel, retryAtFrom, aiEnabled, QuotaError } from '../js/llm.js';
import { cleanAction, parseReply, describeAction, applyAction, assistantPrompt, assistantContext } from '../js/assistant.js';
import { dayFor } from '../js/schedule.js';
import { getState } from '../js/store.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

// ----- models -----
eq('free models: ":free" ids or both prices 0', [isFreeModel('meta-llama/llama-3.3-70b-instruct:free'), isFreeModel('x/y', { prompt: '0', completion: '0' }), isFreeModel('x/y', { prompt: '0.000001', completion: '0' }), isFreeModel('openrouter/auto', { prompt: '-1', completion: '-1' }), isFreeModel('anthropic/claude-sonnet-4.5')], [true, true, false, false, false]);
eq('families: the maker before the slash, else the first word', ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3:free', 'claude-sonnet-4-5', 'models/gemini-2.5-flash', 'GPT-5'].map(modelFamily), ['meta-llama', 'deepseek', 'claude', 'gemini', 'gpt']);
const OR = { data: [
  { id: 'anthropic/claude-sonnet-4.5', name: 'Anthropic: Claude Sonnet 4.5', pricing: { prompt: '0.000003', completion: '0.000015' } },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta: Llama 3.3 70B Instruct (free)', pricing: { prompt: '0', completion: '0' } },
  { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', pricing: { prompt: '0', completion: '0' } },
  { id: 'moonshotai/kimi-k2', name: 'Kimi K2', pricing: { prompt: '0.0000005', completion: '0.000002' } },
  { id: 'openrouter/auto', name: 'Auto Router', pricing: { prompt: '-1', completion: '-1' } },
] };
const oc = normalizeModels('openrouter', OR);
eq('openrouter list marks free', oc.filter((m) => m.free).map((m) => m.id), ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free']);
eq('no prices are kept in the list', oc.every((m) => !('pricing' in m)), true);
eq('filter: free only, free first then by name', filterModels(oc, { free: true }).map((m) => m.id), ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free']);
eq('filter: maker and text', [filterModels(oc, { family: 'anthropic' }).map((m) => m.id), filterModels(oc, { text: 'KIMI' }).map((m) => m.id)], [['anthropic/claude-sonnet-4.5'], ['moonshotai/kimi-k2']]);
eq('a free model is picked to start, the best one first', pickModel(oc), 'deepseek/deepseek-chat-v3-0324:free');
eq('any free model if none of the favourites is there', pickModel(normalizeModels('openrouter', { data: [{ id: 'acme/tiny:free' }, { id: 'acme/big' }] })), 'acme/tiny:free');
eq('no free models: nothing picked', [pickModel(normalizeModels('openrouter', { data: [{ id: 'acme/big', pricing: { prompt: '1', completion: '1' } }] })), pickModel(null)], [null, null]);
eq('openai list keeps chat models only', normalizeModels('openai', { data: [{ id: 'gpt-5-mini' }, { id: 'whisper-1' }, { id: 'gpt-4o-realtime-preview' }, { id: 'text-embedding-3-small' }, { id: 'o4-mini' }] }).map((m) => m.id), ['gpt-5-mini', 'o4-mini']);
eq('gemini list keeps generateContent models, drops the models/ prefix', normalizeModels('gemini', { models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }] }).map((m) => [m.id, m.name]), [['gemini-2.5-flash', 'Gemini 2.5 Flash']]);
eq('garbage model lists are empty', [normalizeModels('openrouter', null), normalizeModels('gemini', {})], [[], []]);

// ----- usage ran out: when to try again -----
const now = 1_000_000;
eq('Retry-After in seconds', retryAtFrom({ 'retry-after': '20' }, 0, now), now + 20000);
eq('Retry-After as a date', retryAtFrom({ 'retry-after': new Date(now + 90000).toUTCString() }, 0, now) >= now + 89000, true);
eq('no header: 30 s, then 1 min, then 2 min', [0, 1, 2].map((a) => retryAtFrom(null, a, now) - now), [30000, 60000, 120000]);
eq('backoff tops out at an hour', retryAtFrom(null, 20, now) - now, 3600000);
const big = 1_800_000_000_000;
eq("OpenRouter's reset time (ms since 1970) is used", retryAtFrom({ 'x-ratelimit-reset': String(big + 120000) }, 0, big) - big, 120000);
eq('a reset time over a day away is capped at a day', retryAtFrom({ 'x-ratelimit-reset': String(big + 9e9) }, 0, big) - big, 86400000);
eq('QuotaError carries the time', new QuotaError('x', 5).retryAt, 5);
eq('AI is off without keys, and when switched off', [aiEnabled({ aiOn: true }), aiEnabled({ aiOn: false }), aiEnabled({})], [false, false, false]);

// ----- actions -----
const D = '2026-10-20';
eq('a missing date becomes the day you look at', cleanAction({ type: 'remove_exercise', name: 'Cable Fly' }, D), { type: 'remove_exercise', date: D, name: 'Cable Fly' });
eq('unknown types and empty actions are dropped', [cleanAction({ type: 'delete_everything' }, D), cleanAction({ type: 'add_exercise', exercise: {} }, D), cleanAction(null, D)], [null, null, null]);
eq('numbers are kept in range', cleanAction({ type: 'add_exercise', exercise: { exercise: 'Squat', sets: 99, reps: 5 } }, D).exercise.sets, 3);
eq('workout numbers are checked', [cleanAction({ type: 'set_workout_numbers', minutes: 55, kcal: 99999 }, D), cleanAction({ type: 'set_workout_numbers', minutes: -3 }, D)], [{ type: 'set_workout_numbers', date: D, minutes: 55, kcal: null }, null]);
eq('meal numbers are rounded and capped', cleanAction({ type: 'edit_meal', name: 'Lunch', changes: { calories: '512.6', protein: 900 } }, D).changes, { calories: 513 });
eq('plain text reply has no actions', parseReply('You are doing great!', D), { reply: 'You are doing great!', actions: [] });
const r = parseReply('```json\n{"reply":"Swapped it.","actions":[{"type":"replace_exercise","name":"Bench Press","with":{"exercise":"Push-up","sets":3,"reps":"15"}},{"type":"nonsense"}]}\n```', D);
eq('JSON reply in a code fence: one good action kept', [r.reply, r.actions.length, r.actions[0].with.exercise], ['Swapped it.', 1, 'Push-up']);
eq('sentences say what will happen', describeAction(r.actions[0]), 'On Tue, Oct 20, swap Bench Press for Push-up 3 × 15');
eq('plan-wide edits say so', /every day it appears/.test(describeAction({ type: 'edit_meal', name: 'Lunch', changes: { calories: 450 } })), true);

const ex = (id, n) => ({ id, exercise: n, sets: 3, reps: '10', weight: '', rest: '', notes: '', video: '' });
const plan = { id: 'pa', name: 'Test', startDate: D, days: [{ label: 'Push', workout: [ex('a', 'Bench Press'), ex('b', 'Cable Fly')], meals: [{ id: 'm1', name: 'Lunch', time: '', items: ['Dal'], calories: 600, protein: 20 }], extras: { waterLiters: 3, supplements: [], notes: '' } }] };
eq('replace one day only', [applyAction(plan, r.actions[0]).ok, dayFor(plan, D).workout.map((w) => w.exercise), dayFor(plan, '2026-10-21').workout.map((w) => w.exercise)], [true, ['Push-up', 'Cable Fly'], ['Bench Press', 'Cable Fly']]);
eq('remove from a day', [applyAction(plan, { type: 'remove_exercise', date: D, name: 'cable fly' }).ok, dayFor(plan, D).workout.map((w) => w.exercise)], [true, ['Push-up']]);
eq('a name that is not there fails kindly', applyAction(plan, { type: 'remove_exercise', date: D, name: 'Deadlift' }), { ok: false, message: 'Deadlift is not on that day.' });
eq('add a meal to a day', [applyAction(plan, { type: 'add_meal', date: D, meal: { name: 'Curd bowl', time: '', items: ['200 g curd'], calories: 150, protein: 10 } }).ok, dayFor(plan, D).meals.map((m) => m.name)], [true, ['Lunch', 'Curd bowl']]);
eq('edit a meal everywhere', [applyAction(plan, { type: 'edit_meal', name: 'Lunch', changes: { calories: 450 } }).ok, plan.days[0].meals[0].calories], [true, 450]);
eq('water target for every day', [applyAction(plan, { type: 'set_water', liters: 3.5 }).ok, plan.days[0].extras.waterLiters], [true, 3.5]);
eq('set the workout time and calories', [applyAction(plan, { type: 'set_workout_numbers', date: D, minutes: 50, kcal: null }).ok, getState().progress.pa[D].manual], [true, { minutes: 50, kcal: null }]);

// ----- the prompt -----
const ctx = assistantContext({ settings: {}, progress: { pa: { '2026-10-19': { ticks: { a: true }, sets: { a: [{ w: 40, r: 10, done: true }] } } } }, bodyLog: { '2026-10-19': 72.4 } }, plan, D, { history: true, today: D });
eq('context has the plan and the history', [/Push-up 3x15/.test(ctx), /2026-10-19/.test(ctx), /72\.4/.test(ctx)], [true, true, true]);
const noHist = assistantContext({ settings: {}, progress: { pa: { '2026-10-19': { ticks: { a: true } } } }, bodyLog: { '2026-10-19': 72.4 } }, plan, D, { history: false, today: D });
eq('without permission: no history, no weight', [/72\.4/.test(noHist), /chose not to share/.test(noHist)], [false, true]);
const prompt = assistantPrompt(ctx, [{ role: 'you', text: 'hi' }, { role: 'ai', text: 'hello' }], 'swap bench');
eq('the prompt asks for JSON and keeps the chat', [/ONLY one JSON object/.test(prompt), /Person: hi/.test(prompt), /Assistant: hello/.test(prompt), prompt.endsWith('Person: swap bench')], [true, true, true, true]);

console.log(fail ? `\n${fail} failed` : '\nAll assistant tests passed');
process.exit(fail ? 1 : 0);
