// pickui.js
// The "Choose exercises" / "Choose meals" sheet: mix and match what you do on one date.
//   * Filter chips by category (Back, Biceps, Breakfast...). It starts on the day's focus, so on
//     "Friday Back Biceps" you see back and biceps exercises first.
//   * Tick what you want, then move them up or down into the order you'll do them.
//   * With a Claude or Gemini key set in More, ask it for suggestions that fit the day.
//   * Add your own, or go back to the plan's list.
// Loaded on demand (only when someone opens it), so it costs nothing at startup.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { savePlans } from './store.js';
import { plannedDay } from './schedule.js';
import { mealNumbers } from './stats.js';
import { candidates, focusFor, savePick, resetPick, isPicked, customCandidate } from './library.js';
import { builtinExercises } from './builtin.js';
import { activeAI, suggest } from './aiassist.js';

const SOURCE_NOTE = { day: 'on the plan today', library: '', plan: 'from another day', builtin: 'TickFit list', new: 'new', ai: 'suggested' };

/**
 * @param plan    the active plan (changed in place and saved)
 * @param date    "YYYY-MM-DD"
 * @param kind    'workout' or 'meals'
 * @param onDone  called after saving, to redraw the screen
 */
export function openPicker({ plan, date, kind, onDone, packet = null, keep = null }) {
  const isWorkout = kind === 'workout';
  const all = candidates(plan, date, kind, isWorkout ? builtinExercises() : []);
  const current = (plan.picks && plan.picks[date] && plan.picks[date][kind]) || plannedDay(plan, date)[kind].map((x) => x.id);
  // What is ticked, in order. Library ids in a pick match candidates directly.
  let chosen = current.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  if (keep) {
    // opened again after scanning a packet: keep what was ticked before
    for (const c of keep) if (!all.some((x) => x.id === c.id)) all.unshift(c);
    chosen = keep;
  }

  const cats = [...new Set(all.map((c) => c.category))];
  let filter = new Set(focusFor(plannedDay(plan, date), cats));
  let query = '';

  openSheet({
    title: isWorkout ? 'Choose exercises' : 'Choose meals',
    build(body, close) {
      const count = h('p', { class: 'pick-count' });
      const chips = h('div', { class: 'pick-chips', role: 'group', 'aria-label': 'Filter by category' });
      const list = h('ul', { class: 'pick-list' });
      const search = h('input', {
        type: 'search',
        class: 'pick-search',
        placeholder: isWorkout ? 'Search exercises' : 'Search meals',
        'aria-label': isWorkout ? 'Search exercises' : 'Search meals',
        oninput: (e) => {
          query = e.target.value.trim().toLowerCase();
          drawList();
        },
      });

      const nameOf = (c) => (isWorkout ? c.item.exercise : c.item.name);
      const detail = (c) => {
        if (isWorkout) return [c.item.sets ? `${c.item.sets} × ${c.item.reps || '?'}` : c.item.reps, c.item.weight].filter(Boolean).join(' · ');
        const n = mealNumbers(c.item);
        const tilde = n.estimated ? '~' : '';
        return [c.item.items.join(', '), typeof n.calories === 'number' ? `${tilde}${n.calories} kcal` : null, typeof n.protein === 'number' ? `${tilde}${n.protein} g protein` : null].filter(Boolean).join(' · ');
      };

      function drawChips() {
        const chip = (label, on, click) => h('button', { type: 'button', class: 'pick-chip', 'aria-pressed': String(on), onclick: click }, label);
        chips.replaceChildren(
          chip('All', filter.size === 0, () => {
            filter = new Set();
            drawChips();
            drawList();
          }),
          ...cats.map((c) =>
            chip(c, filter.has(c), () => {
              if (filter.has(c)) filter.delete(c);
              else filter.add(c);
              drawChips();
              drawList();
            })
          )
        );
      }

      function drawList() {
        count.textContent = chosen.length ? `${chosen.length} chosen. Use the arrows to put them in order.` : `Nothing chosen yet. ${isWorkout ? 'An empty list makes it a rest day.' : ''}`;
        // Chosen ones always stay on top, so you can see and untick them whatever the filter.
        const rest = all.filter((c) => !chosen.includes(c) && (filter.size === 0 || filter.has(c.category)) && (!query || nameOf(c).toLowerCase().includes(query) || c.category.toLowerCase().includes(query)));
        // Move a chosen one up (-1) or down (+1), keeping focus on the same button so it can be tapped again.
        const move = (c, dir, which) => {
          const i = chosen.indexOf(c);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= chosen.length) return;
          const next = [...chosen];
          [next[i], next[j]] = [next[j], next[i]];
          chosen = next;
          drawList();
          const again = list.querySelector(`[data-move="${which}"][data-at="${j}"]`) || list.querySelector(`[data-move][data-at="${j}"]`);
          if (again) again.focus({ preventScroll: false });
        };
        const row = (c) => {
          const at = chosen.indexOf(c);
          const toggle = h(
            'button',
            {
              type: 'button',
              class: 'pick-row' + (at >= 0 ? ' on' : ''),
              role: 'checkbox',
              'aria-checked': String(at >= 0),
              onclick: () => {
                chosen = at >= 0 ? chosen.filter((x) => x !== c) : [...chosen, c];
                drawList();
              },
            },
            h('span', { class: 'pick-num', 'aria-hidden': 'true' }, at >= 0 ? String(at + 1) : icon('plus', 18)),
            h('span', { class: 'pick-text' }, h('b', {}, nameOf(c)), h('small', {}, [detail(c), SOURCE_NOTE[c.source]].filter(Boolean).join(' · '))),
            h('span', { class: 'pick-cat' }, c.category)
          );
          if (at < 0) return h('li', { class: c.source === 'ai' ? 'pick-ai' : null }, toggle);
          const arrow = (dir, which, label, glyph, disabled) =>
            h('button', { type: 'button', class: 'pick-move', 'data-move': which, 'data-at': String(at), 'aria-label': `${label}: ${nameOf(c)}`, disabled, onclick: () => move(c, dir, which) }, icon(glyph, 20));
          return h(
            'li',
            { class: 'pick-chosen' },
            toggle,
            h('span', { class: 'pick-moves' }, arrow(-1, 'up', 'Move up', 'chevron-up', at === 0), arrow(1, 'down', 'Move down', 'chevron-down', at === chosen.length - 1))
          );
        };
        list.replaceChildren(...chosen.map(row), ...rest.map(row));
        if (!chosen.length && !rest.length) list.append(h('li', { class: 'hint' }, 'Nothing matches. Try All, or add your own below.'));
      }

      // ----- add your own -----
      const newName = h('input', { type: 'text', placeholder: isWorkout ? 'Exercise name' : 'Meal name, like Oats bowl', 'aria-label': isWorkout ? 'New exercise name' : 'New meal name', maxlength: 80 });
      const newCat = h('input', { type: 'text', placeholder: isWorkout ? 'Category, like Back' : 'Category, like Breakfast', 'aria-label': isWorkout ? 'New exercise category' : 'New meal category', maxlength: 40, list: 'pick-cats' });
      const newFoods = isWorkout ? null : h('input', { type: 'text', placeholder: 'Foods, comma separated (optional)', 'aria-label': 'Foods in the new meal', maxlength: 300 });
      let scanned = packet; // { name, grams, calories, protein } from a scanned packet, while the name is unchanged
      if (packet) {
        newName.value = packet.name.slice(0, 80);
        newCat.value = 'Snacks';
        newFoods.value = `${packet.grams} g ${packet.name}`.slice(0, 300);
      }
      const addOwn = () => {
        const nums = scanned && newName.value.trim() === scanned.name ? { calories: scanned.calories, protein: scanned.protein } : {};
        const c = customCandidate(kind, newName.value, newCat.value, { items: newFoods ? newFoods.value.split(',').map((s) => s.trim()).filter(Boolean) : [], ...nums });
        if (!c) return newName.focus();
        all.unshift(c);
        if (!cats.includes(c.category)) cats.push(c.category);
        chosen = [...chosen, c];
        newName.value = '';
        newCat.value = '';
        if (newFoods) newFoods.value = '';
        scanned = null;
        drawChips();
        drawList();
      };

      // ----- suggestions from Claude or Gemini (only with a key set in More) -----
      const ai = activeAI();
      const aiStatus = h('p', { class: 'hint', role: 'status' });
      const aiBtn = ai
        ? h(
            'button',
            {
              class: 'btn small pick-suggest',
              type: 'button',
              onclick: async () => {
                aiBtn.disabled = true;
                aiStatus.textContent = `Asking ${ai.name}...`;
                try {
                  const day = plannedDay(plan, date);
                  const items = await suggest(kind, { dayLabel: day.label, focus: [...filter], have: chosen.map(nameOf) });
                  const fresh = items
                    .map(({ category, ...it }) => {
                      const cand = customCandidate(kind, isWorkout ? it.exercise : it.name, category);
                      return { ...cand, item: { ...cand.item, ...it }, source: 'ai' };
                    })
                    .filter((cand) => !all.some((x) => nameOf(x).toLowerCase() === nameOf(cand).toLowerCase()));
                  all.unshift(...fresh);
                  for (const cand of fresh) if (!cats.includes(cand.category)) cats.push(cand.category);
                  aiStatus.textContent = fresh.length ? `${fresh.length} suggestion${fresh.length === 1 ? '' : 's'} from ${ai.name}, marked "suggested". Tick the ones you want.` : `${ai.name} only suggested things already in your list.`;
                  query = '';
                  search.value = '';
                  filter = new Set();
                  drawChips();
                  drawList();
                } catch (e) {
                  aiStatus.textContent = e.message;
                } finally {
                  aiBtn.disabled = false;
                }
              },
            },
            icon('sparkle', 18),
            `Suggest ${isWorkout ? 'exercises' : 'meals'} with ${ai.name}`
          )
        : null;

      const save = () => {
        savePick(plan, date, kind, chosen);
        savePlans();
        close();
        toast(isWorkout ? 'Workout updated for this day' : 'Meals updated for this day');
        onDone();
      };

      body.append(
        h('p', { class: 'hint' }, isWorkout ? 'Pick the exercises for this day only. The plan itself stays the same, and your logged sets are kept.' : 'Pick the meals for this day only. The plan itself stays the same.'),
        chips,
        search,
        aiBtn,
        aiBtn && aiStatus,
        count,
        list,
        h(
          'details',
          { class: 'pick-add', open: !!packet },
          h('summary', {}, isWorkout ? 'Add your own exercise' : 'Add your own meal'),
          h('datalist', { id: 'pick-cats' }, cats.map((c) => h('option', { value: c }))),
          newName,
          newCat,
          newFoods,
          packet && h('p', { class: 'hint tight' }, `From the packet: ${packet.calories} kcal and ${packet.protein} g protein per ${packet.grams} g.`),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { class: 'btn small', type: 'button', onclick: addOwn }, icon('plus', 18), 'Add and choose it'),
            !isWorkout &&
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: async () => {
                    const { scanPacket } = await import('./mealsui.js');
                    // the scanner opens its own sheet, so this one closes and opens again with the packet filled in
                    scanPacket((p) => openPicker({ plan, date, kind, onDone, packet: p, keep: chosen }));
                  },
                },
                icon('barcode', 18),
                'Scan a packet'
              )
          )
        ),
        h(
          'div',
          { class: 'pick-actions' },
          isPicked(plan, date, kind) &&
            h('button', { class: 'btn', type: 'button', onclick: () => {
                const before = JSON.stringify(plan.picks || null);
                resetPick(plan, date, kind);
                savePlans();
                close();
                onDone();
                toast('Back to the plan for this day', {
                  undo: () => {
                    plan.picks = JSON.parse(before) || undefined;
                    if (!plan.picks) delete plan.picks;
                    savePlans();
                    onDone();
                  },
                });
              } }, 'Use the plan\'s list'),
          h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save for this day')
        )
      );
      drawChips();
      drawList();
    },
  });
}
