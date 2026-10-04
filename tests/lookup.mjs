// Tests for the opt-in online food lookup (no real network: fetch is faked). Run: node tests/lookup.mjs
import { queryFromLine, pickProduct, lookupFood, lookupEnabled } from '../js/lookup.js';
import { setSetting } from '../js/store.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

eq('query strips amounts', queryFromLine('100 g paneer tikka'), 'paneer tikka');
eq('query strips filler and brackets', queryFromLine('A big bowl of dragon fruit (fresh)'), 'dragon fruit');
eq('query too short is null', queryFromLine('2 g'), null);
eq('query of nothing', [queryFromLine(''), queryFromLine(null)], [null, null]);
eq('query is cut to 4 words', queryFromLine('one two three four five six seven').split(' ').length <= 4, true);
eq('query never contains digits or symbols', /^[a-z ]+$/.test(queryFromLine('Muesli!! 45g @ home #1')), true);

const good = { products: [{ product_name: 'No numbers' , nutriments: {} }, { product_name: 'Paneer', nutriments: { 'energy-kcal_100g': 265, proteins_100g: 18 }, serving_quantity: '50' }] };
eq('pick skips products without numbers', pickProduct(good), { name: 'Paneer', kcal100: 265, protein100: 18, serving: 50 });
eq('pick converts kJ', Math.round(pickProduct({ products: [{ nutriments: { energy_100g: 1000, proteins_100g: 5 } }] }).kcal100), 239);
eq('pick rejects nonsense', pickProduct({ products: [{ nutriments: { 'energy-kcal_100g': 99999, proteins_100g: 18 } }] }), null);
eq('pick of garbage', [pickProduct(null), pickProduct({}), pickProduct({ products: 'x' }), pickProduct({ products: [null] })], [null, null, null, null]);

// --- opt-in behaviour with a fake fetch ---
const calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); return { ok: true, json: async () => good }; };

setSetting('foodLookup', false);
eq('off by default', lookupEnabled(), false);
eq('disabled: returns null', await lookupFood('100 g paneer'), null);
eq('disabled: NO network call is made', calls.length, 0);

setSetting('foodLookup', true);
const r = await lookupFood('100 g paneer');
eq('enabled: result scaled to grams', r, { name: 'Paneer', grams: 100, assumed: false, kcal: 265, protein: 18 });
eq('enabled: one call', calls.length, 1);
eq('only the food name is in the URL', /search_terms=paneer&/.test(calls[0]) && !/100/.test(calls[0].split('?')[1].split('&')[0]), true);
eq('URL goes to Open Food Facts only', calls[0].startsWith('https://world.openfoodfacts.org/'), true);
const r2 = await lookupFood('paneer');
eq('no weight: uses the serving size and says so', [r2.grams, r2.assumed, r2.kcal], [50, true, 133]);
eq('second ask is cached (no new call)', calls.length, 1);

globalThis.fetch = async () => { throw new Error('offline'); };
eq('offline: null, no throw', await lookupFood('quinoa salad'), null);
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
eq('server error: null', await lookupFood('couscous bowl'), null);
globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
eq('bad json: null', await lookupFood('tahini sauce'), null);

console.log(fail ? `\n${fail} failed` : '\nAll lookup tests passed');
process.exit(fail ? 1 : 0);
