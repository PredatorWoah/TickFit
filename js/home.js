// home.js
// The Today screen: a calm summary. How the day is going, what to do next, and one tap to start.
//   * Ring and status for the whole day, plus your streak
//   * A Workout card (Start / Continue / Done) and a Meals card (what's next)
//   * Water, and your own notes
// The detail lives on the Workout and Meals screens.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { updateRecord } from './store.js';
import { dayStats, mealTotals, currentStreak } from './stats.js';
import { sessionState, sessionMs, workoutMs, startSession, workoutSummary, estimateMinutes, formatDuration } from './logging.js';
import { weightTile } from './weightui.js';
import { createCtx, dayName, dateText, weekStrip, ring, waterTile, section, openJump, pickButton } from './dayview.js';

/**
 * @param root     element to fill
 * @param plan     the active plan
 * @param date     "YYYY-MM-DD" being viewed
 * @param goto     function(date) to change the viewed date
 * @param actions  { show(screen) } to move to another screen
 */
export function renderHome(root, plan, date, goto, actions) {
  clear(root);
  const ctx = createCtx(plan, date, goto);
  const { day } = ctx;

  const streak = currentStreak(plan, ctx.records(), ctx.today);
  const hero = ring(118);
  const status = h('p', { class: 'hero-status' });

  root.append(
    h(
      'header',
      { class: 'home-head' },
      h(
        'div',
        { class: 'head-row' },
        h('div', { class: 'head-text' }, h('h1', { class: 'date-main' }, dayName(ctx)), h('p', { class: 'date-sub' }, dateText(ctx)), date !== ctx.today && h('button', { class: 'link-btn', type: 'button', onclick: () => goto(ctx.today) }, 'Back to today')),
        streak > 0 && h('div', { class: 'streak', 'aria-label': `${streak} day streak` }, icon('flame', 20), h('b', {}, String(streak)), h('span', {}, streak === 1 ? 'day' : 'days'))
      ),
      h('button', { class: 'plan-chip', type: 'button', onclick: () => actions.show('plans') }, h('span', {}, plan.name), icon('chevron-right', 16)),
      weekStrip(ctx)
    ),
    h('section', { class: 'hero-card' }, hero.el, h('div', { class: 'hero-text' }, h('button', { class: 'day-title', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openJump(ctx) }, h('span', {}, day.label), icon('chevron-down', 18)), status))
  );
  ctx.refreshers.push(() => {
    const s = dayStats(day, ctx.rec());
    hero.set(s.pct, s.total ? `${s.done}/${s.total}` : '');
    status.textContent = s.total === 0 ? 'Rest day. Nothing to tick.' : s.done === s.total ? 'All done. Great work!' : `${s.total - s.done} left to tick`;
    status.classList.toggle('good', s.total > 0 && s.done === s.total);
  });

  // ----- workout card -----
  const wkCard = h('div', { class: 'home-card' });
  const drawWorkoutCard = () => {
    clear(wkCard);
    if (!day.workout.length) {
      wkCard.append(h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon' }, icon('flame', 22)), h('div', { class: 'hc-text' }, h('b', {}, 'Rest day'), h('span', {}, 'Recovery is part of the plan.'))), pickButton(ctx, 'workout'));
      return;
    }
    const rec = ctx.rec();
    const state = sessionState(rec);
    const s = workoutSummary(day, rec);
    const go = () => actions.show('workout');
    let sub = `${day.workout.length} exercises · about ${estimateMinutes(day)} min`;
    let label = 'Start workout';
    let cls = 'btn primary wide big';
    if (state === 'active') {
      sub = `In progress · ${formatDuration(sessionMs(rec))} · ${s.setsDone}/${s.setsTotal} sets`;
      label = 'Continue workout';
    } else if (state === 'finished') {
      sub = `Done in ${formatDuration(workoutMs(rec))} · ${s.setsDone}/${s.setsTotal} sets`;
      label = 'View workout';
      cls = 'btn wide big';
    } else if (s.setsDone > 0) {
      sub = `${s.setsDone}/${s.setsTotal} sets done`;
      label = 'Continue workout';
    }
    wkCard.append(
      h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon' }, icon(state === 'finished' ? 'check' : 'play', 22)), h('div', { class: 'hc-text' }, h('b', {}, state === 'finished' ? 'Workout done' : 'Today\'s workout'), h('span', {}, sub))),
      h(
        'button',
        {
          class: cls,
          type: 'button',
          onclick: () => {
            if (state === 'idle') updateRecord(plan.id, date, (r) => startSession(r));
            go();
          },
        },
        label
      ),
      pickButton(ctx, 'workout')
    );
  };
  drawWorkoutCard();
  ctx.refreshers.push(drawWorkoutCard);

  // ----- meals card -----
  const mealCard = h('div', { class: 'home-card' });
  const drawMealCard = () => {
    clear(mealCard);
    if (!day.meals.length) {
      mealCard.append(h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon' }, icon('drop', 22)), h('div', { class: 'hc-text' }, h('b', {}, 'Meals'), h('span', {}, 'No meals planned for this day.'))), pickButton(ctx, 'meals'));
      return;
    }
    const rec = ctx.rec();
    const eaten = day.meals.filter((m) => rec.ticks[m.id]).length;
    const t = mealTotals(day, rec);
    const next = day.meals.find((m) => !rec.ticks[m.id]);
    const kcalLine = t.calories !== null ? `${(t.caloriesEaten ?? 0).toLocaleString()} / ${t.estimated ? '~' : ''}${t.calories.toLocaleString()} kcal` : `${eaten} of ${day.meals.length} meals`;
    const fill = h('div', { class: 'bar-fill' });
    fill.style.width = (t.calories ? Math.min(100, ((t.caloriesEaten ?? 0) / t.calories) * 100) : (eaten / day.meals.length) * 100) + '%';
    mealCard.append(
      h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon meal' }, icon('today', 22)), h('div', { class: 'hc-text' }, h('b', {}, 'Meals'), h('span', {}, kcalLine))),
      h('div', { class: 'bar' }, fill),
      next ? h('p', { class: 'hc-next' }, h('b', {}, 'Next: '), `${next.time ? next.time + ' ' : ''}${next.name}, ${next.items[0]}${next.items.length > 1 ? ' and more' : ''}`) : h('p', { class: 'hc-next' }, 'All meals eaten. Nice.'),
      h('button', { class: 'btn wide', type: 'button', onclick: () => actions.show('meals') }, 'Open meals'),
      pickButton(ctx, 'meals')
    );
  };
  drawMealCard();
  ctx.refreshers.push(drawMealCard);

  root.append(h('div', { class: 'home-cards' }, wkCard, mealCard));

  const water = waterTile(ctx);
  if (water) root.append(section('Water', null, water));

  // ----- body weight (a small tile that opens the log sheet) -----
  const weightHost = h('div', {});
  const drawWeight = () => weightHost.replaceChildren(weightTile(drawWeight));
  drawWeight();
  root.append(section('Weight', null, weightHost));

  // ----- your own notes -----
  const notes = h('textarea', {
    class: 'notes',
    rows: 3,
    placeholder: 'How did it go? Anything to remember?',
    'aria-label': 'Your notes for this day',
    oninput: (e) =>
      updateRecord(plan.id, date, (r) => {
        r.notes = e.target.value;
      }),
  });
  notes.value = ctx.rec().notes || '';
  root.append(section('My notes', null, notes));

  ctx.refresh();
}
