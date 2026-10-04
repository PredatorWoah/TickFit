// meals.js
// The Meals screen: how many calories and how much protein you've eaten, each meal as a big tick
// tile, supplements, and water.

import { h, clear } from './dom.js';
import { mealTotals } from './stats.js';
import { createCtx, dateBar, tickTile, waterTile, section, meter } from './dayview.js';

export function renderMeals(root, plan, date, goto) {
  clear(root);
  const ctx = createCtx(plan, date, goto);
  const { day } = ctx;

  root.append(dateBar(ctx), h('h1', { class: 'wk-title' }, 'Meals'));

  if (!day.meals.length && !day.extras.supplements.length && !day.extras.waterLiters) {
    root.append(h('div', { class: 'empty-card' }, h('p', {}, 'Nothing planned to eat on this day.')));
    return;
  }

  // ----- calories and protein -----
  const first = mealTotals(day, ctx.rec());
  if (first.calories !== null || first.protein !== null) {
    const kcal = first.calories !== null ? meter('Calories', 'kcal') : null;
    const protein = first.protein !== null ? meter('Protein', 'g') : null;
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
            if (typeof m.calories === 'number') macros.push(`${m.calories} kcal`);
            if (typeof m.protein === 'number') macros.push(`${m.protein} g protein`);
            return tickTile(ctx, m.id, [m.time && h('span', { class: 'time' }, m.time), m.name], m.items.join(', '), macros.join(' · '));
          })
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
