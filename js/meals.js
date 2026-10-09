// meals.js
// The Meals screen: how many calories and how much protein you've eaten, each meal as a big tick
// tile, supplements, and water.

import { h, clear } from './dom.js';
import { mealTotals, mealNumbers } from './stats.js';
import { savePlans } from './store.js';
import { estimateMeal } from './estimate.js';
import { toast } from './dom.js';
import { createCtx, dateBar, tickTile, waterTile, section, meter, pickButton } from './dayview.js';

export function renderMeals(root, plan, date, goto) {
  clear(root);
  const ctx = createCtx(plan, date, goto);
  const { day } = ctx;

  root.append(dateBar(ctx), h('h1', { class: 'wk-title' }, 'Meals'), pickButton(ctx, 'meals'));

  if (!day.meals.length && !day.extras.supplements.length && !day.extras.waterLiters) {
    root.append(h('div', { class: 'empty-card' }, h('p', {}, 'Nothing planned to eat on this day. Tap Choose meals to add some.')));
    return;
  }

  // ----- calories and protein -----
  const first = mealTotals(day, ctx.rec());
  if (first.calories !== null || first.protein !== null) {
    const tag = first.estimated ? ' (estimated)' : '';
    const kcal = first.calories !== null ? meter('Calories' + tag, 'kcal') : null;
    const protein = first.protein !== null ? meter('Protein' + tag, 'g') : null;
    root.append(h('div', { class: 'meters' }, ...[kcal && kcal.el, protein && protein.el].filter(Boolean)));
    ctx.refreshers.push(() => {
      const t = mealTotals(day, ctx.rec());
      if (kcal) kcal.set(t.caloriesEaten ?? 0, t.calories);
      if (protein) protein.set(t.proteinEaten ?? 0, t.protein);
    });
  }

  // ----- meals -----
  if (day.meals.length) {
    root.append(
      section(
        'Today\'s meals',
        null,
        h(
          'ul',
          { class: 'tiles' },
          day.meals.map((m) => {
            const macros = [];
            const n = mealNumbers(m);
            const approx = n.estimated ? '~' : '';
            if (typeof n.calories === 'number') macros.push(`${approx}${n.calories} kcal`);
            if (typeof n.protein === 'number') macros.push(`${approx}${n.protein} g protein`);
            return tickTile(ctx, m.id, [m.time && h('span', { class: 'time' }, m.time), m.name], m.items.join(', '), macros.join(' · '));
          })
        )
      )
    );
  }

  // A pasted plan often has no calories or protein. Offer to write the estimates into the plan so they can be edited.
  const allMeals = () => [...plan.days.flatMap((d) => d.meals), ...((plan.library && plan.library.meals) || [])];
  const missing = allMeals().some((m) => typeof m.calories !== 'number' || typeof m.protein !== 'number');
  if (missing) {
    root.append(
      h(
        'div',
        { class: 'callout est-callout' },
        h('p', {}, 'Calories and protein marked ~ are estimates worked out from the food names. They are rough, so edit any meal in the plan editor if you know better.'),
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => {
              let count = 0;
              for (const m of allMeals()) {
                const est = estimateMeal(m.items);
                if (!est.found.length) continue;
                if (typeof m.calories !== 'number') { m.calories = est.calories; count++; }
                if (typeof m.protein !== 'number') m.protein = est.protein;
              }
              savePlans();
              toast(count ? `Saved estimates for ${count} meals` : 'Nothing to estimate');
              renderMeals(root, plan, date, goto);
            },
          },
          'Save estimates into my plan'
        )
      )
    );
  }

  if (day.extras.supplements.length) {
    root.append(section('Supplements', null, h('ul', { class: 'tiles' }, day.extras.supplements.map((s, i) => tickTile(ctx, `s${i + 1}`, s)))));
  }

  const water = waterTile(ctx);
  if (water) root.append(section('Water', null, water));

  ctx.refresh();
}
