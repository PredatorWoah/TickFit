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
import { createCtx, dayName, dateText, weekStrip, ring, tripleRing, waterTile, section, openJump, pickButton } from './dayview.js';

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
  // Pulse shows three rings (Move, Eat, Water); Bento shows one big ring for the whole day
  const pulse = document.documentElement.getAttribute('data-style') !== 'bento';
  const status = h('p', { class: 'hero-status' });
  const dayButton = h('button', { class: 'day-title', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openJump(ctx) }, h('span', {}, day.label), icon('chevron-down', 18));

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
    )
  );

  if (pulse) {
    const tri = tripleRing(136);
    const line = (cls, name) => {
      const num = h('b', {});
      const of = h('span', {});
      return { el: h('div', { class: `tri-row ${cls}` }, h('small', {}, name), h('div', { class: 'tri-num' }, num, of)), num, of };
    };
    const move = line('tri-move', 'MOVE');
    const eat = line('tri-eat', 'EAT');
    const drink = line('tri-water', 'WATER');
    root.append(h('section', { class: 'hero-card tri-card' }, h('div', { class: 'tri-head' }, dayButton, status), tri.el, h('div', { class: 'tri-legend' }, move.el, eat.el, drink.el)));
    const set = (row, a, b) => {
      row.num.textContent = a;
      row.of.textContent = b;
    };
    ctx.refreshers.push(() => {
      const rec = ctx.rec();
      const s = dayStats(day, rec);
      status.textContent = s.total === 0 ? 'Rest day. Nothing to tick.' : s.done === s.total ? 'All done. Great work!' : `${s.done} of ${s.total} ticked`;
      status.classList.toggle('good', s.total > 0 && s.done === s.total);
      // Move: sets done (or exercises ticked when a plan has no sets)
      let pMove = null;
      if (day.workout.length) {
        const w = workoutSummary(day, rec);
        if (w.setsTotal) {
          pMove = (w.setsDone / w.setsTotal) * 100;
          set(move, String(w.setsDone), `/${w.setsTotal} sets`);
        } else {
          const done = day.workout.filter((x) => rec.ticks[x.id]).length;
          pMove = (done / day.workout.length) * 100;
          set(move, String(done), `/${day.workout.length} done`);
        }
      } else set(move, 'Rest', ' day');
      // Eat: calories eaten against the day's total, or meals ticked
      let pEat = null;
      if (day.meals.length) {
        const t = mealTotals(day, rec);
        if (t.calories) {
          pEat = ((t.caloriesEaten ?? 0) / t.calories) * 100;
          set(eat, (t.caloriesEaten ?? 0).toLocaleString(), `/${t.estimated ? '~' : ''}${t.calories.toLocaleString()}`);
        } else {
          const eaten = day.meals.filter((m) => rec.ticks[m.id]).length;
          pEat = (eaten / day.meals.length) * 100;
          set(eat, String(eaten), `/${day.meals.length} meals`);
        }
      } else set(eat, '–', ' no meals');
      // Water: litres drunk against the day's target
      let pWater = null;
      const target = day.extras.waterLiters;
      const ml = rec.waterMl || 0;
      if (target) {
        pWater = (ml / (target * 1000)) * 100;
        set(drink, (ml / 1000).toFixed(2).replace(/\.?0+$/, '') || '0', `/${target} L`);
      } else set(drink, (ml / 1000).toFixed(2).replace(/\.?0+$/, '') || '0', ' L');
      tri.set([pMove, pEat, pWater]);
      tri.el.classList.toggle('complete', s.total > 0 && s.done === s.total);
    });
  } else {
    const hero = ring(118);
    root.append(h('section', { class: 'hero-card' }, hero.el, h('div', { class: 'hero-text' }, dayButton, status)));
    ctx.refreshers.push(() => {
      const s = dayStats(day, ctx.rec());
      hero.set(s.pct, s.total ? `${s.done}/${s.total}` : '');
      status.textContent = s.total === 0 ? 'Rest day. Nothing to tick.' : s.done === s.total ? 'All done. Great work!' : `${s.total - s.done} left to tick`;
      status.classList.toggle('good', s.total > 0 && s.done === s.total);
    });
  }

  // ----- workout card -----
  const wkCard = h('div', { class: 'home-card wk-card' });
  const drawWorkoutCard = () => {
    clear(wkCard);
    if (!day.workout.length) {
      const hasOptions = !!(plan.library && plan.library.exercises && plan.library.exercises.length) && !/\brest\b/i.test(day.label);
      wkCard.append(h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon' }, icon(hasOptions ? 'dumbbell' : 'flame', 22)), h('div', { class: 'hc-text' }, h('b', {}, hasOptions ? "Pick today's exercises" : 'Rest day'), h('span', {}, hasOptions ? 'Your plan has options to choose from.' : 'Recovery is part of the plan.'))), pickButton(ctx, 'workout'));
      return;
    }
    const rec = ctx.rec();
    const state = sessionState(rec);
    const s = workoutSummary(day, rec);
    const go = () => actions.show('workout');
    let sub = `${day.workout.length} exercises · about ${estimateMinutes(day)} min`;
    let label = 'Start workout';
    let chip = null; // the live time, shown inside the button while a workout runs
    let cls = 'btn primary wide big';
    if (state === 'active') {
      sub = `In progress · ${formatDuration(sessionMs(rec))} · ${s.setsDone}/${s.setsTotal} sets`;
      label = 'Continue workout';
      chip = h('span', { class: 'cta-chip', 'aria-hidden': 'true' }, formatDuration(sessionMs(rec)), icon('play', 16));
      cls += ' split';
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
        h('span', {}, label),
        chip
      ),
      pickButton(ctx, 'workout')
    );
  };
  drawWorkoutCard();
  ctx.refreshers.push(drawWorkoutCard);

  // ----- meals card -----
  const mealCard = h('div', { class: 'home-card meal-card' });
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
