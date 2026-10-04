// lookup.js
// OPTIONAL online food lookup (Open Food Facts, a free open food database, no account or key).
//
// It is OFF unless the person turns it on in More. When on, the only thing sent is the food's NAME
// (like "paneer", no amounts, no plan, no progress, nothing about you), as a web search. Anything
// that goes wrong (offline, blocked, slow, nothing found) quietly returns null and the person
// types the numbers themselves.

import { getState } from './store.js';
import { parseQuantity } from './estimate.js';

export const FOOD_API = 'https://world.openfoodfacts.org/cgi/search.pl';
const TIMEOUT_MS = 6000;
const cache = new Map(); // food name -> result, so asking twice does not hit the network twice

export const lookupEnabled = () => !!(getState().settings || {}).foodLookup;

const FILLER = /\b(\d+(?:\.\d+)?|a|an|one|two|three|half|quarter|of|about|around|some|with|and|or|plain|fresh|big|large|small|little|bowl|bowls|cup|cups|glass|glasses|plate|plates|piece|pieces|slice|slices|scoop|scoops|tbsp|tsp|spoon|spoons|g|gm|gms|gram|grams|kg|ml|l|litre|litres)\b/g;

/** The food's name from a line: "100 g paneer tikka" -> "paneer tikka". Null if nothing useful is left. */
export function queryFromLine(line) {
  const q = String(line ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
  return q.length >= 3 ? q : null;
}

/** First product in an Open Food Facts reply that has both calories and protein per 100 g. Null if none. */
export function pickProduct(json) {
  const products = json && Array.isArray(json.products) ? json.products : [];
  for (const p of products) {
    const n = (p && p.nutriments) || {};
    let kcal = Number(n['energy-kcal_100g']);
    if (!isFinite(kcal) && isFinite(Number(n['energy_100g']))) kcal = Number(n['energy_100g']) / 4.184; // kJ -> kcal
    const protein = Number(n['proteins_100g']);
    if (isFinite(kcal) && isFinite(protein) && kcal >= 0 && kcal < 950 && protein >= 0 && protein <= 100) {
      return { name: String(p.product_name || '').slice(0, 60), kcal100: kcal, protein100: protein, serving: Number(p.serving_quantity) || null };
    }
  }
  return null;
}

/**
 * Look one food line up online. Returns { name, kcal, protein, grams, assumed } or null.
 * `assumed` is true when the line gave no weight, so we used the product's serving or 100 g.
 */
export async function lookupFood(line) {
  if (!lookupEnabled()) return null; // never goes online unless the person opted in
  const q = queryFromLine(line);
  if (!q) return null;
  let product = cache.get(q);
  if (product === undefined) {
    product = null;
    try {
      const url = `${FOOD_API}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,nutriments,serving_quantity`;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(timer);
      if (res.ok) product = pickProduct(await res.json());
    } catch {
      product = null; // offline, blocked or timed out
    }
    cache.set(q, product);
  }
  if (!product) return null;
  const qty = parseQuantity(line);
  const assumed = qty.grams === null;
  const grams = Math.min(assumed ? product.serving || 100 : qty.grams, 2000);
  return { name: product.name, grams, assumed, kcal: Math.round((product.kcal100 * grams) / 100), protein: Math.round(((product.protein100 * grams) / 100) * 10) / 10 };
}
