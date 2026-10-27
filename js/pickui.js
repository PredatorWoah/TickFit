// pickui.js
// The "Choose exercises" / "Choose meals" sheet: mix and match what you do on one date.
//   * Filter chips by category (Back, Biceps, Breakfast...). It starts on the day's focus, so on
//     "Friday Back Biceps" you see back and biceps exercises first.
//   * Tick what you want, then drag them by their handle into the order you'll do them (the handle also
//     answers the arrow keys, for keyboards and screen readers).
//   * With AI helpers on in More, ask the AI for suggestions that fit the day.
//   * Add your own, or go back to the plan's list.
// Loaded on demand (only when someone opens it), so it costs nothing at startup.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { haptic } from './platform.js';
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
        count.textContent = chosen.length ? `${chosen.length} chosen.${chosen.length > 1 ? ' Drag the handle on the right to put them in order.' : ''}` : `Nothing chosen yet. ${isWorkout ? 'An empty list makes it a rest day.' : ''}`;
        // Chosen ones always stay on top, so you can see and untick them whatever the filter.
        const rest = all.filter((c) => !chosen.includes(c) && (filter.size === 0 || filter.has(c.category)) && (!query || nameOf(c).toLowerCase().includes(query) || c.category.toLowerCase().includes(query)));
        // Put chosen item `c` at place `to` (keys and the end of a drag), keeping focus on its handle.
        const moveTo = (c, to) => {
          const i = chosen.indexOf(c);
          if (i < 0 || to < 0 || to >= chosen.length || to === i) return;
          const next = [...chosen];
          next.splice(i, 1);
          next.splice(to, 0, c);
          chosen = next;
          drawList();
          const again = list.querySelector(`[data-grip][data-at="${to}"]`);
          if (again) again.focus({ preventScroll: false });
        };
        // Drag a chosen item by its handle. The row follows the finger, the rows it passes slide out of the way,
        // and the list scrolls by itself near the top and bottom edge. Dropping puts it in its new place.
        const startDrag = (e, c, rowEl) => {
          if ((e.button !== undefined && e.button > 0) || list.classList.contains('is-dragging')) return;
          e.preventDefault();
          const handle = e.currentTarget;
          const rows = [...list.querySelectorAll('.pick-chosen')];
          const from = chosen.indexOf(c);
          if (from < 0 || rows.length < 2) return;
          try { handle.setPointerCapture(e.pointerId); } catch { /* an old browser: the drag still works while the finger stays on the handle */ }
          const scroller = list.closest('.sheet-body') || document.scrollingElement;
          const rects = rows.map((r) => r.getBoundingClientRect());
          const startY = e.clientY;
          const startScroll = scroller.scrollTop;
          const step = rects[from].height + (rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0);
          let y = e.clientY;
          let target = from;
          let raf = 0;
          rowEl.classList.add('dragging');
          list.classList.add('is-dragging');
          haptic();

          const update = () => {
            const scrolled = scroller.scrollTop - startScroll;
            rowEl.style.transform = `translateY(${y - startY + scrolled}px)`;
            const centre = rects[from].top + rects[from].height / 2 + (y - startY); // where the dragged row is, on screen
            let t = from;
            rects.forEach((r, i) => {
              const mid = r.top + r.height / 2 - scrolled; // where row i is now, on screen
              if (i < from && centre < mid) t = Math.min(t, i);
              if (i > from && centre > mid) t = Math.max(t, i);
            });
            if (t !== target) {
              target = t;
              haptic(); // a small tick each time it passes another row
            }
            rows.forEach((r, i) => {
              if (i === from) return;
              const shift = target > from && i > from && i <= target ? -step : target < from && i >= target && i < from ? step : 0;
              r.style.transform = shift ? `translateY(${shift}px)` : '';
            });
          };
          const edge = () => {
            const box = scroller.getBoundingClientRect();
            const zone = 72;
            const speed = y < box.top + zone ? -Math.ceil((box.top + zone - y) / 6) : y > box.bottom - zone ? Math.ceil((y - (box.bottom - zone)) / 6) : 0;
            if (speed) {
              const before = scroller.scrollTop;
              scroller.scrollTop = before + Math.max(-18, Math.min(18, speed));
              if (scroller.scrollTop !== before) update();
            }
            raf = requestAnimationFrame(edge);
          };
          raf = requestAnimationFrame(edge);

          const move = (ev) => {
            if (ev.pointerId !== e.pointerId) return;
            y = ev.clientY;
            update();
          };
          const finish = (ev, drop) => {
            if (ev.pointerId !== e.pointerId) return;
            cancelAnimationFrame(raf);
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', cancel);
            try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
            list.classList.remove('is-dragging');
            if (drop && target !== from) {
              const next = [...chosen];
              next.splice(from, 1);
              next.splice(target, 0, c);
              chosen = next;
            }
            drawList();
            const again = list.querySelector(`[data-grip][data-at="${chosen.indexOf(c)}"]`);
            if (again) again.focus({ preventScroll: true });
          };
          const up = (ev) => finish(ev, true);
          const cancel = (ev) => finish(ev, false);
          handle.addEventListener('pointermove', move);
          handle.addEventListener('pointerup', up);
          handle.addEventListener('pointercancel', cancel);
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
          const grip = h(
            'button',
            {
              type: 'button',
              class: 'pick-grip',
              'data-grip': '',
              'data-at': String(at),
              'aria-label': `Reorder ${nameOf(c)}. Drag it, or use the up and down arrow keys.`,
              onpointerdown: (e) => startDrag(e, c, li),
              onkeydown: (e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveTo(c, chosen.indexOf(c) + (e.key === 'ArrowUp' ? -1 : 1));
                }
              },
            },
            icon('grip', 22)
          );
          const li = h('li', { class: 'pick-chosen' }, toggle, grip);
          return li;
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

      // ----- suggestions from the AI (only with AI helpers on in More) -----
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
        ...(aiBtn ? [aiBtn, aiStatus] : []), // (append() would print a null as the word "null")
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
