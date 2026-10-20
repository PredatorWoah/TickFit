// Tests for the three looks (2.0.0): picking and migrating the look, and Deck's title sizing. Run: node tests/looks.mjs
import { resolveStyle, naturalTheme, STYLES } from '../js/theme.js';
import { deckTitleSize } from '../js/home.js';

let fail = 0;
const eq = (m, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

eq('three looks, Arena first', STYLES, ['arena', 'deck', 'bento']);
eq('the old Pulse look becomes Arena', resolveStyle('pulse'), 'arena');
eq('unknown or missing becomes Arena', [resolveStyle(undefined), resolveStyle('neon')], ['arena', 'arena']);
eq('Deck and Bento stay', [resolveStyle('deck'), resolveStyle('bento')], ['deck', 'bento']);
eq('natural themes: Arena dark, Deck and Bento light', [naturalTheme('arena'), naturalTheme('deck'), naturalTheme('bento'), naturalTheme('pulse')], ['dark', 'light', 'light', 'dark']);

eq('a short title gets the full size', deckTitleSize('Lunch'), 42);
eq('a long word shrinks the title so it never splits', deckTitleSize('Supercalifragilistic') <= Math.floor(300 / (20 * 0.8)), true);
const long = 'Upper Body Hypertrophy Day With Extra Arms Accessory Work And Core Finisher';
eq('a very long title is small but readable', [deckTitleSize(long) <= 24, deckTitleSize(long) >= 18], [true, true]);
eq('the cap is respected (set card uses 32)', deckTitleSize('Bench', 32), 32);
eq('nothing at all is safe', deckTitleSize(''), 42);

console.log(fail ? `\n${fail} failed` : '\nAll look tests passed');
process.exit(fail ? 1 : 0);
