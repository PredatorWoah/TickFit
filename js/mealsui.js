// mealsui.js
// Sheets for the Meals screen, loaded on demand:
//   openGroceries  the shopping list for the next few days, with ticks, to copy or share
//   openSwap       swap one meal for another with about the same calories and protein
//   scanPacket     scan a packet's barcode and get its name, calories and protein (opt-in, online)

import { h, toast, copyText } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, setSetting, savePlans } from './store.js';
import { addDays, fromStr } from './dates.js';
import { groceryList, groceryText, swapOptions } from './groceries.js';
import { candidates, chosenFor, savePick } from './library.js';
import { lookupEnabled, lookupBarcode } from './lookup.js';
import { isNative, nativePlugin } from './platform.js';

const shortDate = (d) => fromStr(d).toLocaleDateString('en', { day: 'numeric', month: 'short' });

async function shareText(title, text) {
  try {
    if (isNative() && nativePlugin('Share')) return await nativePlugin('Share').share({ title, text, dialogTitle: title });
    if (navigator.share) return await navigator.share({ title, text });
  } catch {
    return; // closed the share sheet
  }
  toast((await copyText(text)) ? 'List copied' : 'Could not copy the list');
}

/** The grocery list from `date` on. Ticks are kept (in settings) until the list's start date changes. */
export function openGroceries(plan, date) {
  let days = Number(getState().settings.groceryDays) || 7;
  const ticked = () => {
    const t = getState().settings.groceryTicks;
    return new Set(t && t.from === date && t.plan === plan.id ? t.keys : []);
  };
  const setTicked = (set) => setSetting('groceryTicks', { plan: plan.id, from: date, keys: [...set] });

  openSheet({
    title: 'Grocery list',
    build(body) {
      const chips = h('div', { class: 'pick-chips', role: 'group', 'aria-label': 'How many days' });
      const list = h('ul', { class: 'grocery-list' });
      const note = h('p', { class: 'hint' });
      let items = [];

      const asText = () => {
        const done = ticked();
        const lines = items.map((g) => `${done.has(g.key) ? '✓' : '•'} ${groceryText(g)}`);
        return `TickFit grocery list, ${shortDate(date)} to ${shortDate(addDays(date, days - 1))}\n${lines.join('\n')}`;
      };

      function draw() {
        chips.replaceChildren(
          ...[3, 7, 14].map((n) =>
            h('button', { class: 'pick-chip', type: 'button', 'aria-pressed': String(n === days), onclick: () => { days = n; setSetting('groceryDays', n); draw(); } }, `${n} days`)
          )
        );
        items = groceryList(plan, date, days);
        const done = ticked();
        note.textContent = items.length
          ? `Everything your meals need from ${shortDate(date)} to ${shortDate(addDays(date, days - 1))}, added up. Amounts are only as exact as the plan. Tick what you already have.`
          : 'No meals with foods planned for these days.';
        list.replaceChildren(
          ...items.map((g) => {
            const box = h('input', {
              type: 'checkbox',
              checked: done.has(g.key),
              onchange: (e) => {
                const set = ticked();
                if (e.target.checked) set.add(g.key);
                else set.delete(g.key);
                setTicked(set);
                li.classList.toggle('done', e.target.checked);
              },
            });
            const li = h('li', { class: done.has(g.key) ? 'done' : '' }, h('label', {}, box, h('span', {}, groceryText(g)), g.uses > 1 ? h('span', { class: 'g-uses' }, `in ${g.uses} meals`) : null));
            return li;
          })
        );
      }

      body.append(
        chips,
        note,
        list,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => items.length && shareText('Grocery list', asText()) }, icon('upload', 18), 'Share'),
          h('button', { class: 'btn', type: 'button', onclick: async () => items.length && toast((await copyText(asText())) ? 'List copied' : 'Could not copy the list') }, icon('paste', 18), 'Copy'),
          h('button', { class: 'btn', type: 'button', onclick: () => { setTicked(new Set()); draw(); } }, 'Untick all')
        )
      );
      draw();
    },
  });
}

const signed = (n, unit) => (n === null ? '' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${unit}`);

/** Swap `meal` on `date` for another meal from the plan. `onDone()` redraws. */
export function openSwap(plan, date, meal, onDone) {
  const all = candidates(plan, date, 'meals');
  const options = swapOptions(meal, all);
  openSheet({
    title: `Swap ${meal.name}`,
    build(body, close) {
      if (!options.length) {
        body.append(h('p', { class: 'hint' }, 'There are no other meals in this plan to swap with yet. Add some with Choose meals.'));
        return;
      }
      const swap = (cand) => {
        const chosen = chosenFor(plan, date, 'meals', all);
        const before = JSON.stringify(plan.picks || null);
        const libBefore = JSON.stringify(plan.library || null);
        const next = chosen.map((c) => (c.id === meal.id ? cand : c));
        if (!chosen.some((c) => c.id === meal.id)) next.push(cand);
        savePick(plan, date, 'meals', next);
        savePlans();
        close();
        onDone();
        toast(`Swapped for ${cand.item.name}`, {
          undo: () => {
            plan.picks = JSON.parse(before) || undefined;
            if (!plan.picks) delete plan.picks;
            const lib = JSON.parse(libBefore);
            if (lib) plan.library = lib;
            else delete plan.library;
            savePlans();
            onDone();
          },
        });
      };
      body.append(
        h('p', { class: 'hint' }, 'For this day only, closest in calories and protein first. The plan itself stays the same.'),
        h(
          'ul',
          { class: 'swap-list' },
          options.map((o) => {
            const nums = [typeof o.kcal === 'number' ? `${o.kcal} kcal ${signed(o.dk, '')}` : null, typeof o.protein === 'number' ? `${o.protein} g protein ${signed(o.dp, ' g')}` : null].filter(Boolean).join(' · ');
            return h(
              'li',
              {},
              h(
                'button',
                { class: 'swap-row', type: 'button', onclick: () => swap(o.cand) },
                h('span', { class: 'swap-name' }, o.cand.item.name, o.cand.category && o.cand.category !== o.cand.item.name ? h('span', { class: 'swap-cat' }, o.cand.category) : null),
                h('span', { class: 'swap-sub' }, (o.cand.item.items || []).join(', ')),
                nums ? h('span', { class: 'swap-nums' }, nums) : null
              )
            );
          })
        )
      );
    },
  });
}

/**
 * Scan (or type) a packet's barcode and look it up. Calls onFound({ name, grams, calories, protein }) for one
 * serving (or 100 g). Asks first if the online lookup is off, since this needs the internet.
 */
export function scanPacket(onFound) {
  const go = async () => {
    const { openScanner } = await import('./scanner.js');
    openScanner({
      onCode: async (code) => {
        toast('Looking it up...');
        const p = await lookupBarcode(code);
        if (!p) return toast('Not found in Open Food Facts. Type the meal in yourself.');
        const grams = p.serving || 100;
        onFound({ name: p.name || `Barcode ${code}`, grams, calories: Math.round((p.kcal100 * grams) / 100), protein: Math.round(((p.protein100 * grams) / 100) * 10) / 10 });
      },
    });
  };
  if (lookupEnabled()) return go();
  openSheet({
    title: 'Look up packets online?',
    build(body, close) {
      body.append(
        h('p', {}, 'Scanning a barcode looks the packet up in Open Food Facts, a free food database. Only the barcode number is sent: nothing about you or your plan.'),
        h('p', { class: 'hint' }, 'This turns on the online food lookup. You can turn it off again in More.'),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => { setSetting('foodLookup', true); close(); setTimeout(go, 240); } }, icon('barcode', 18), 'Turn on and scan'),
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Not now')
        )
      );
    },
  });
}
