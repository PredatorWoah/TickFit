// home.js
// The Today screen. Each look lays it out its own way (theme.js lookOf()):
//   Arena  a scoreboard: you today against the same day last week, four "quarters" (train, eat, water,
//          move), a replay tip from last time, tonight's line-up and one big Kick off button
//   Deck   one card at a time: the next thing to do is a big card; swipe it right (or tap Done) to tick it,
//          left (or Later) to put it at the back. Everything already done collects underneath.
//   Bento  a grid of soft tiles: the day ring, streak, workout, meals, water, weight
// Weight and your own notes follow in every look. The detail lives on the Workout and Meals screens.

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { updateRecord } from './store.js';
import { dayStats, mealTotals, mealNumbers, currentStreak, pctFor, lastPerformance, plannedSets, WATER_STEP_ML } from './stats.js';
import { sessionState, sessionMs, workoutMs, startSession, workoutSummary, estimateMinutes, formatDuration } from './logging.js';
import { suggestNext } from './gym.js';
import { weightTile } from './weightui.js';
import { stepsOn, stepsFor, stepsText } from './steps.js';
import { addDays, diffDays, fromStr } from './dates.js';
import { haptic } from './platform.js';
import { lookOf } from './theme.js';
import { createCtx, dayName, dateText, weekStrip, ring, waterTile, section, openJump, pickButton, LOCALE } from './dayview.js';

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
  const look = lookOf();
  if (look === 'deck') deckHome(root, ctx, actions);
  else if (look === 'bento') bentoHome(root, ctx, actions);
  else arenaHome(root, ctx, actions);

  // ----- in every look: body weight (a tile that opens the log sheet) and your own notes -----
  if (look !== 'bento') {
    const weightHost = h('div', {});
    const drawWeight = () => weightHost.replaceChildren(weightTile(drawWeight));
    drawWeight();
    root.append(section('Weight', null, weightHost));
  }
  const notes = h('textarea', {
    class: 'notes',
    rows: 3,
    placeholder: 'How did it go? Anything to remember?',
    'aria-label': 'Your notes for this day',
    oninput: (e) =>
      updateRecord(ctx.plan.id, ctx.date, (r) => {
        r.notes = e.target.value;
      }),
  });
  notes.value = ctx.rec().notes || '';
  root.append(section('My notes', null, notes));

  ctx.refresh();
}

// ---------- pieces every look uses ----------

const litres = (ml) => (ml / 1000).toFixed(2).replace(/\.?0+$/, '') || '0';
const short = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
const hasOptions = (ctx) => !!(ctx.plan.library && ctx.plan.library.exercises && ctx.plan.library.exercises.length) && !/\brest\b/i.test(ctx.day.label);

/** What the workout button says and does right now. */
function workoutAction(ctx, actions) {
  const { day, plan, date } = ctx;
  const rec = ctx.rec();
  const state = sessionState(rec);
  const s = workoutSummary(day, rec);
  const go = () => {
    if (sessionState(ctx.rec()) === 'idle') updateRecord(plan.id, date, (r) => startSession(r));
    actions.show('workout');
  };
  if (state === 'active') return { state, title: "Today's workout", sub: `In progress · ${s.setsDone}/${s.setsTotal} sets`, label: 'Continue workout', live: formatDuration(sessionMs(rec)), go };
  if (state === 'finished') return { state, title: 'Workout done', sub: `Done in ${formatDuration(workoutMs(rec))} · ${s.setsDone}/${s.setsTotal} sets`, label: 'View workout', go };
  if (s.setsDone > 0) return { state, title: "Today's workout", sub: `${s.setsDone}/${s.setsTotal} sets done`, label: 'Continue workout', go };
  return { state, title: "Today's workout", sub: `${day.workout.length} exercise${day.workout.length === 1 ? '' : 's'} · about ${estimateMinutes(day)} min`, label: 'Start workout', go };
}

/** The day name with a chevron; tap to jump to any day of the plan. */
const dayButton = (ctx) => h('button', { class: 'day-title', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openJump(ctx) }, h('span', {}, ctx.day.label), icon('chevron-down', 18));

const planChip = (ctx, actions) => h('button', { class: 'plan-chip', type: 'button', onclick: () => actions.show('plans') }, h('span', {}, ctx.plan.name), icon('chevron-right', 16));

const stepsPill = (ctx) => (stepsOn() && stepsFor(ctx.date) !== null ? h('span', { class: 'steps-pill', 'aria-label': `${stepsText(stepsFor(ctx.date))} steps` }, icon('steps', 16), h('b', {}, stepsText(stepsFor(ctx.date))), ' steps') : null);

/** The meals card: calories eaten, the next meal, a way to the Meals screen. */
function mealCard(ctx, actions) {
  const { day } = ctx;
  const card = h('div', { class: 'home-card meal-card' });
  const draw = () => {
    clear(card);
    if (!day.meals.length) {
      card.append(h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon' }, icon('meal', 22)), h('div', { class: 'hc-text' }, h('b', {}, 'Meals'), h('span', {}, 'No meals planned for this day.'))), pickButton(ctx, 'meals'));
      return;
    }
    const rec = ctx.rec();
    const eaten = day.meals.filter((m) => rec.ticks[m.id]).length;
    const t = mealTotals(day, rec);
    const next = day.meals.find((m) => !rec.ticks[m.id]);
    const kcalLine = t.calories !== null ? `${(t.caloriesEaten ?? 0).toLocaleString()} / ${t.estimated ? '~' : ''}${t.calories.toLocaleString()} kcal` : `${eaten} of ${day.meals.length} meals`;
    const fill = h('div', { class: 'bar-fill' });
    fill.style.width = (t.calories ? Math.min(100, ((t.caloriesEaten ?? 0) / t.calories) * 100) : (eaten / day.meals.length) * 100) + '%';
    card.append(
      h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon meal' }, icon('meal', 22)), h('div', { class: 'hc-text' }, h('b', {}, 'Meals'), h('span', {}, kcalLine))),
      h('div', { class: 'bar' }, fill),
      next ? h('p', { class: 'hc-next' }, h('b', {}, 'Next: '), `${next.time ? next.time + ' ' : ''}${next.name}${next.items[0] ? `, ${next.items[0]}${next.items.length > 1 ? ' and more' : ''}` : ''}`) : h('p', { class: 'hc-next' }, 'All meals eaten. Nice.'),
      h('button', { class: 'btn wide', type: 'button', onclick: () => actions.show('meals') }, 'Open meals'),
      pickButton(ctx, 'meals')
    );
  };
  draw();
  ctx.refreshers.push(draw);
  return card;
}

// ---------- Arena: the scoreboard ----------

function arenaHome(root, ctx, actions) {
  const { day, plan, date } = ctx;
  const streak = currentStreak(plan, ctx.records(), ctx.today);
  const matchday = plan.startDate ? diffDays(plan.startDate, date) + 1 : 0;
  const kicker = [matchday > 0 ? `MATCHDAY ${matchday}` : null, fromStr(date).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()].filter(Boolean).join(' · ');

  root.append(
    h(
      'header',
      { class: 'home-head ar-head' },
      h('div', { class: 'ar-kicker' }, h('span', {}, kicker), streak > 0 && h('span', { class: 'ar-streak', 'aria-label': `${streak} day streak` }, icon('flame', 16), `${streak} STREAK`)),
      h('div', { class: 'head-row' }, h('div', { class: 'head-text' }, h('h1', { class: 'date-main' }, dayName(ctx)), date !== ctx.today && h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.goto(ctx.today) }, 'Back to today'))),
      h('div', { class: 'chip-row' }, planChip(ctx, actions), stepsPill(ctx)),
      weekStrip(ctx)
    )
  );

  // ----- the scoreboard: you today against the same weekday last week -----
  const lastDate = addDays(date, -7);
  const lastName = fromStr(lastDate).toLocaleDateString(LOCALE, { weekday: 'long' }).toUpperCase();
  const you = h('span', { class: 'ar-big you' });
  const them = h('span', { class: 'ar-big' });
  const line = h('span', { class: 'ar-line-text' });
  const lineDot = h('span', { class: 'ar-dot', 'aria-hidden': 'true' });
  root.append(
    h(
      'section',
      { class: 'ar-score', 'aria-label': 'Scoreboard' },
      h('div', { class: 'ar-teams' }, h('div', { class: 'ar-team' }, h('small', {}, date === ctx.today ? 'YOU TODAY' : 'YOU'), you), h('span', { class: 'ar-vs', 'aria-hidden': 'true' }, 'VS'), h('div', { class: 'ar-team right' }, h('small', {}, `LAST ${lastName}`), them)),
      h('div', { class: 'ar-line' }, lineDot, line),
      dayButton(ctx)
    )
  );

  // ----- the quarters -----
  const quarter = (name) => {
    const val = h('b', {});
    const of = h('span', {});
    const fill = h('i', {});
    return { el: h('div', { class: 'ar-q' }, h('small', {}, name), h('div', { class: 'ar-q-num' }, val, of), h('div', { class: 'ar-q-bar', 'aria-hidden': 'true' }, fill)), val, of, fill };
  };
  const qs = [quarter('Q1 TRAIN'), quarter('Q2 EAT'), quarter('Q3 WATER')];
  const moveOn = stepsOn() && stepsFor(date) !== null;
  if (moveOn) qs.push(quarter('Q4 MOVE'));
  root.append(h('div', { class: `ar-quarters n${qs.length}` }, qs.map((q) => q.el)));

  // ----- replay: what last time says about today -----
  if (day.workout.length) {
    for (const w of day.workout) {
      const hint = suggestNext(w, lastPerformance(plan, ctx.records(), date, w.exercise));
      if (hint && hint.kind === 'up') {
        root.append(h('div', { class: 'ar-replay' }, icon('trophy', 20), h('span', {}, h('b', {}, `REPLAY · ${w.exercise}. `), hint.text)));
        break;
      }
    }
  }

  // ----- the line-up and the big button -----
  const lineup = h('div', { class: 'ar-lineup-host' });
  const drawLineup = () => {
    clear(lineup);
    if (!day.workout.length) {
      lineup.append(h('div', { class: 'home-card ar-rest' }, h('b', {}, hasOptions(ctx) ? 'PICK THE LINE-UP' : 'REST DAY'), h('span', {}, hasOptions(ctx) ? 'Your plan has exercises to choose from.' : 'No match today. Recovery wins seasons.'), pickButton(ctx, 'workout')));
      return;
    }
    const a = workoutAction(ctx, actions);
    const rec = ctx.rec();
    lineup.append(
      h('div', { class: 'ar-sec-head' }, h('h2', { class: 'ar-sec-title' }, "TODAY'S LINE-UP"), h('span', {}, a.sub)),
      h(
        'ol',
        { class: 'ar-lineup' },
        day.workout.map((w, i) => {
          const done = !!rec.ticks[w.id];
          return h('li', { class: done ? 'done' : '' }, h('button', { type: 'button', class: 'ar-player', onclick: a.go, 'aria-label': `${w.exercise}${done ? ', done' : ''}. Open the workout` }, h('span', { class: 'ar-no' }, done ? icon('check', 18) : String(i + 1).padStart(2, '0')), h('span', { class: 'ar-name' }, w.exercise), h('span', { class: 'ar-sets' }, w.reps ? `${plannedSets(w)} × ${w.reps}` : `${plannedSets(w)} sets`)));
        })
      ),
      h('button', { class: 'btn primary wide big ar-kick' + (a.live ? ' split' : ''), type: 'button', onclick: a.go }, icon(a.state === 'finished' ? 'check' : 'play', 22), h('span', {}, a.state === 'finished' ? 'Full time · view' : a.label === 'Start workout' ? 'Kick off' : 'Back in the game'), a.live && h('span', { class: 'cta-chip', 'aria-hidden': 'true' }, a.live)),
      pickButton(ctx, 'workout')
    );
  };
  drawLineup();
  ctx.refreshers.push(drawLineup);

  root.append(lineup, mealCard(ctx, actions));
  const water = waterTile(ctx);
  if (water) root.append(section('Water', null, water));

  ctx.refreshers.push(() => {
    const rec = ctx.rec();
    const s = dayStats(day, rec);
    const mine = s.total ? s.pct : null;
    const theirs = pctFor(plan, ctx.records(), lastDate);
    you.textContent = mine === null ? '–' : String(mine);
    them.textContent = theirs === null ? '–' : String(theirs);
    const left = s.total - s.done;
    let text;
    if (!s.total) text = 'Rest day. No match to play.';
    else if (!left) text = theirs === null || mine >= theirs ? 'Full time. You won the day.' : 'Full time. Everything ticked.';
    else if (theirs === null) text = `${left} play${left === 1 ? '' : 's'} left`;
    else if (mine > theirs) text = `Leading by ${mine - theirs} · ${left} play${left === 1 ? '' : 's'} left`;
    else if (mine === theirs) text = `Level · ${left} play${left === 1 ? '' : 's'} left`;
    else text = `Behind by ${theirs - mine} · ${left} play${left === 1 ? '' : 's'} left`;
    line.textContent = text;
    lineDot.classList.toggle('on', left > 0 && date === ctx.today && s.total > 0);

    const setQ = (q, val, of, pct) => {
      q.val.textContent = val;
      q.of.textContent = of;
      q.fill.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
    };
    if (day.workout.length) {
      const w = workoutSummary(day, rec);
      setQ(qs[0], String(w.setsDone), `/${w.setsTotal}`, w.setsTotal ? (w.setsDone / w.setsTotal) * 100 : 0);
    } else setQ(qs[0], 'REST', '', 0);
    const t = mealTotals(day, rec);
    if (t.calories) setQ(qs[1], short(t.caloriesEaten ?? 0), `/${short(t.calories)}`, ((t.caloriesEaten ?? 0) / t.calories) * 100);
    else if (day.meals.length) {
      const eaten = day.meals.filter((m) => rec.ticks[m.id]).length;
      setQ(qs[1], String(eaten), `/${day.meals.length}`, (eaten / day.meals.length) * 100);
    } else setQ(qs[1], '–', '', 0);
    const target = day.extras.waterLiters;
    const ml = rec.waterMl || 0;
    setQ(qs[2], litres(ml), target ? `/${target}L` : 'L', target ? (ml / (target * 1000)) * 100 : 0);
    if (moveOn) {
      const n = stepsFor(date) || 0;
      setQ(qs[3], short(n), '', (n / 10000) * 100);
    }
  });
}

// ---------- Deck: one card at a time ----------

/**
 * A font size (px) for a big Deck card title: as large as `max`, but small enough that the longest word fits
 * the card on one line (so a word is never split), and smaller again for long titles. Pure.
 */
export function deckTitleSize(text, max = 42, width = 300) {
  const words = String(text || '').split(/\s+/);
  const longest = Math.max(1, ...words.map((w) => w.length));
  const total = String(text || '').length;
  const fit = Math.floor(width / (longest * 0.8));
  const byLength = total > 48 ? 24 : total > 32 ? 28 : total > 20 ? 34 : max;
  return Math.max(18, Math.min(max, fit, byLength));
}
const deckTitle = (text, max) => h('h2', { class: 'dk-title', style: `font-size:${deckTitleSize(text, max)}px` }, text);

const later = new Map(); // date -> ids put at the back with Later (kept while the app is open)

/** Everything left to do today as cards, and everything done. Pure enough to test by hand. */
function deckCards(ctx) {
  const { day } = ctx;
  const rec = ctx.rec();
  const todo = [];
  const done = [];
  if (day.workout.length) {
    const state = sessionState(rec);
    (state === 'finished' ? done : todo).push({ id: 'workout', kind: 'workout', name: day.label || 'Workout' });
  }
  for (const m of day.meals) (rec.ticks[m.id] ? done : todo).push({ id: m.id, kind: 'meal', name: m.name, meal: m });
  if (day.extras.waterLiters) ((rec.waterMl || 0) >= day.extras.waterLiters * 1000 ? done : todo).push({ id: 'water', kind: 'water', name: 'Water' });
  day.extras.supplements.forEach((s, i) => (rec.ticks[`s${i + 1}`] ? done : todo).push({ id: `s${i + 1}`, kind: 'supp', name: s }));
  const back = later.get(ctx.date) || [];
  todo.sort((a, b) => back.indexOf(a.id) - back.indexOf(b.id)); // cards never sent back keep their order
  return { todo, done };
}

function deckHome(root, ctx, actions) {
  const { plan, date } = ctx;
  const streak = currentStreak(plan, ctx.records(), ctx.today);
  const count = h('span', { class: 'dk-count' });
  const segs = h('div', { class: 'dk-segs', role: 'img' });
  root.append(
    h(
      'header',
      { class: 'home-head dk-head' },
      h(
        'div',
        { class: 'head-row' },
        h('div', { class: 'head-text' }, h('p', { class: 'date-sub' }, `${dayName(ctx)} · ${dateText(ctx)}`), h('h1', { class: 'date-main' }, count), date !== ctx.today && h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.goto(ctx.today) }, 'Back to today')),
        streak > 0 && h('div', { class: 'streak', 'aria-label': `${streak} day streak` }, icon('flame', 18), h('b', {}, String(streak)))
      ),
      segs,
      weekStrip(ctx),
      h('div', { class: 'chip-row' }, planChip(ctx, actions), stepsPill(ctx))
    )
  );

  const stack = h('div', { class: 'dk-stack' });
  const bar = h('div', { class: 'dk-actions' });
  const doneRow = h('ul', { class: 'dk-done', 'aria-label': 'Done today' });
  root.append(stack, bar, doneRow);

  const colorOf = (c) => (c ? `k-${c.kind}` : '');

  function tickCard(c) {
    const was = JSON.stringify(ctx.rec());
    if (c.kind === 'meal' || c.kind === 'supp') ctx.change((r) => (r.ticks[c.id] = true));
    else if (c.kind === 'water') ctx.change((r) => (r.waterMl = (r.waterMl || 0) + WATER_STEP_ML));
    haptic();
    if (c.kind !== 'water')
      toast(`${c.name} done`, {
        undo: () => {
          const before = JSON.parse(was);
          ctx.change((r) => {
            r.ticks = before.ticks || {};
            r.waterMl = before.waterMl || 0;
          });
        },
      });
  }
  function sendBack(c) {
    const list = (later.get(date) || []).filter((x) => x !== c.id);
    list.push(c.id);
    later.set(date, list);
    ctx.refresh();
  }

  function cardBody(c) {
    const rec = ctx.rec();
    if (c.kind === 'workout') {
      const a = workoutAction(ctx, actions);
      const list = ctx.day.workout.slice(0, 5);
      return [
        h('span', { class: 'dk-tag' }, a.live ? `LIVE · ${a.live}` : 'UP NEXT · WORKOUT'),
        deckTitle(c.name),
        h('ul', { class: 'dk-lines' }, list.map((w) => h('li', { class: rec.ticks[w.id] ? 'done' : '' }, h('span', {}, w.exercise), h('span', {}, w.reps ? `${plannedSets(w)} × ${w.reps}` : `${plannedSets(w)} sets`))), ctx.day.workout.length > 5 && h('li', { class: 'more' }, h('span', {}, `+${ctx.day.workout.length - 5} more`))),
        h('p', { class: 'dk-foot' }, a.sub),
      ];
    }
    if (c.kind === 'meal') {
      const m = c.meal;
      const n = mealNumbers(m);
      const nums = [typeof n.calories === 'number' && `${n.estimated ? '~' : ''}${n.calories} kcal`, typeof n.protein === 'number' && `${n.estimated ? '~' : ''}${n.protein} g protein`].filter(Boolean).join(' · ');
      return [h('span', { class: 'dk-tag' }, m.time ? `UP NEXT · ${m.time}` : 'UP NEXT · MEAL'), deckTitle(m.name), h('ul', { class: 'dk-lines' }, m.items.slice(0, 5).map((x) => h('li', {}, h('span', {}, x)))), nums && h('p', { class: 'dk-foot' }, nums)];
    }
    if (c.kind === 'water') {
      const target = ctx.day.extras.waterLiters;
      const ml = rec.waterMl || 0;
      return [h('span', { class: 'dk-tag' }, 'UP NEXT · WATER'), deckTitle(`${litres(ml)} / ${target} L`), h('p', { class: 'dk-foot' }, `${Math.max(0, Math.ceil((target * 1000 - ml) / WATER_STEP_ML))} more glasses to go`), h('button', { class: 'btn small dk-minus', type: 'button', 'aria-label': 'Remove a glass of water', onclick: () => ctx.change((r) => (r.waterMl = Math.max(0, (r.waterMl || 0) - WATER_STEP_ML))) }, icon('minus', 18), '1 glass')];
    }
    return [h('span', { class: 'dk-tag' }, 'UP NEXT · SUPPLEMENT'), deckTitle(c.name)];
  }

  function draw() {
    const { todo, done } = deckCards(ctx);
    const total = todo.length + done.length;
    count.textContent = !total ? 'Rest day' : todo.length ? `${todo.length} card${todo.length === 1 ? '' : 's'} left` : 'All clear';
    segs.replaceChildren(...[done.length && h('i', { class: 'on', style: `flex:${done.length}` }), todo.length && h('i', { style: `flex:${todo.length}` })].filter(Boolean));
    segs.setAttribute('aria-label', `${done.length} of ${total} done`);
    clear(stack);
    clear(bar);
    if (!todo.length) {
      stack.append(h('div', { class: 'dk-card k-clear' }, h('span', { class: 'dk-tag' }, total ? 'ALL CLEAR' : 'NOTHING PLANNED'), h('h2', { class: 'dk-title' }, total ? 'Deck finished' : 'Rest day'), h('p', { class: 'dk-foot' }, total ? `${done.length} card${done.length === 1 ? '' : 's'} done today. See you tomorrow.` : 'Nothing to tick today. Rest is part of the plan.'), !total && pickButton(ctx, 'workout')));
    } else {
      const top = todo[0];
      // the two cards behind are only a picture of what is coming: they can't be touched
      todo.slice(1, 3).reverse().forEach((c, i, arr) => stack.append(h('div', { class: `dk-back ${colorOf(c)} b${arr.length - i}`, 'aria-hidden': 'true' })));
      const card = h('div', { class: `dk-card ${colorOf(top)}`, role: 'group', 'aria-label': `${top.name}. Swipe right for done, left for later` }, ...cardBody(top).filter(Boolean), h('span', { class: 'dk-hint right', 'aria-hidden': 'true' }, top.kind === 'workout' ? 'START' : top.kind === 'water' ? '+1 GLASS' : 'DONE'), h('span', { class: 'dk-hint left', 'aria-hidden': 'true' }, 'LATER'));
      stack.append(card);
      const primary = top.kind === 'workout' ? { 'Start workout': 'Start', 'Continue workout': 'Continue', 'View workout': 'View' }[workoutAction(ctx, actions).label] : top.kind === 'water' ? '+1 glass' : top.kind === 'meal' ? 'Ate it' : 'Taken';
      const doPrimary = () => (top.kind === 'workout' ? workoutAction(ctx, actions).go() : tickCard(top));
      bar.append(
        ...[
          h('button', { class: 'btn dk-later', type: 'button', disabled: todo.length < 2, onclick: () => sendBack(top) }, icon('back', 18), 'Later'),
          h('button', { class: 'btn primary dk-go', type: 'button', onclick: doPrimary }, primary, icon('chevron-right', 18)),
          top.kind === 'workout' && pickButton(ctx, 'workout'),
        ].filter(Boolean)
      );
      swipeable(card, { right: doPrimary, left: todo.length > 1 ? () => sendBack(top) : null });
    }
    doneRow.replaceChildren(...done.map((c) => h('li', { class: colorOf(c) }, icon('check', 14), h('span', {}, c.name))));
    doneRow.hidden = !done.length;
  }
  ctx.refreshers.push(draw);
}

/**
 * Drag a card sideways to act on it. Only a clear sideways drag counts (a scroll up or down never does),
 * it must travel far enough, and the tap that ends a drag is swallowed so nothing on the card gets pressed
 * by accident.
 */
function swipeable(card, { right, left }) {
  const LIMIT = 110;
  let id = null;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dragging = false;
  let swallow = false;
  const reset = () => {
    card.classList.remove('dragging', 'go-right', 'go-left');
    card.style.transform = '';
  };
  card.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    dx = 0;
    dragging = false;
  });
  card.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - sx;
    const my = e.clientY - sy;
    if (!dragging) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) return void (id = null); // a scroll
      if (Math.abs(mx) < 14 || Math.abs(mx) < Math.abs(my) * 1.5) return;
      dragging = true;
      card.setPointerCapture(id);
      card.classList.add('dragging');
    }
    dx = mx;
    if ((dx < 0 && !left) || (dx > 0 && !right)) dx /= 4; // that way does nothing: resist
    card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
    card.classList.toggle('go-right', dx > LIMIT * 0.6 && !!right);
    card.classList.toggle('go-left', dx < -LIMIT * 0.6 && !!left);
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!dragging) return;
    swallow = true;
    setTimeout(() => (swallow = false), 350);
    const act = dx > LIMIT ? right : dx < -LIMIT ? left : null;
    if (!act) return reset();
    card.style.transform = `translateX(${dx > 0 ? 130 : -130}%) rotate(${dx > 0 ? 12 : -12}deg)`;
    card.classList.add('flying');
    setTimeout(act, 180);
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', (e) => {
    if (e.pointerId === id) {
      id = null;
      reset();
    }
  });
  // the click a drag ends with never reaches a button on the card
  card.addEventListener('click', (e) => swallow && (e.stopPropagation(), e.preventDefault()), true);
}

// ---------- Bento: a grid of tiles ----------

function bentoHome(root, ctx, actions) {
  const { day, plan, date } = ctx;
  const streak = currentStreak(plan, ctx.records(), ctx.today);
  root.append(
    h(
      'header',
      { class: 'home-head bn-head' },
      h('div', { class: 'head-row' }, h('div', { class: 'head-text' }, h('h1', { class: 'date-main' }, dayName(ctx)), h('p', { class: 'date-sub' }, dateText(ctx)), date !== ctx.today && h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.goto(ctx.today) }, 'Back to today'))),
      h('div', { class: 'chip-row' }, planChip(ctx, actions), stepsPill(ctx)),
      weekStrip(ctx)
    )
  );

  const grid = h('div', { class: 'bn-grid' });
  root.append(grid);

  // the day ring
  const hero = ring(104);
  const status = h('p', { class: 'hero-status' });
  grid.append(h('section', { class: 'bn-tile t-ring' }, hero.el, h('div', { class: 'bn-ring-text' }, dayButton(ctx), status)));
  ctx.refreshers.push(() => {
    const s = dayStats(day, ctx.rec());
    hero.set(s.pct, s.total ? `${s.done}/${s.total}` : '');
    status.textContent = s.total === 0 ? 'Rest day' : s.done === s.total ? 'All done!' : `${s.total - s.done} to go`;
  });

  // streak
  grid.append(h('section', { class: 'bn-tile t-streak' }, icon('flame', 26), streak > 0 ? [h('b', { class: 'bn-num' }, String(streak)), h('span', {}, 'day streak')] : [h('b', { class: 'bn-tile-head' }, 'Start a streak'), h('span', {}, 'Tick half of today to begin')]));

  // workout
  const wk = h('section', { class: 'bn-tile t-workout wide' });
  const drawWk = () => {
    clear(wk);
    if (!day.workout.length) {
      wk.append(h('div', { class: 'bn-tile-head' }, icon('dumbbell', 22), h('b', {}, hasOptions(ctx) ? "Pick today's exercises" : 'Rest day')), h('p', { class: 'bn-sub' }, hasOptions(ctx) ? 'Your plan has options to choose from.' : 'Recovery is part of the plan.'), pickButton(ctx, 'workout'));
      return;
    }
    const a = workoutAction(ctx, actions);
    wk.append(
      h('div', { class: 'bn-tile-head' }, icon(a.state === 'finished' ? 'check' : 'dumbbell', 22), h('b', {}, a.title)),
      h('p', { class: 'bn-sub' }, a.sub),
      h('p', { class: 'bn-list' }, day.workout.map((w) => w.exercise).join(' · ')),
      h('button', { class: 'btn primary wide' + (a.live ? ' split' : ''), type: 'button', onclick: a.go }, h('span', {}, a.label), a.live && h('span', { class: 'cta-chip', 'aria-hidden': 'true' }, a.live)),
      pickButton(ctx, 'workout')
    );
  };
  drawWk();
  ctx.refreshers.push(drawWk);

  // meals
  const meals = mealCard(ctx, actions);
  meals.className = 'bn-tile t-meals wide';
  grid.append(wk, meals);

  // water
  const target = day.extras.waterLiters;
  if (target) {
    const val = h('b', { class: 'bn-num' });
    grid.append(
      h(
        'section',
        { class: 'bn-tile t-water wide' },
        h('div', { class: 'bn-tile-head' }, icon('drop', 22), h('b', {}, 'Water')),
        h('div', {}, val, h('span', { class: 'bn-of' }, ` / ${target} L`)),
        h(
          'div',
          { class: 'bn-water-btns' },
          h('button', { class: 'round', type: 'button', 'aria-label': 'Remove a glass of water', onclick: () => ctx.change((r) => (r.waterMl = Math.max(0, (r.waterMl || 0) - WATER_STEP_ML))) }, icon('minus', 20)),
          h('button', { class: 'round primary', type: 'button', 'aria-label': `Add ${WATER_STEP_ML} millilitres of water`, onclick: () => ctx.change((r) => (r.waterMl = (r.waterMl || 0) + WATER_STEP_ML)) }, icon('plus', 20))
        )
      )
    );
    ctx.refreshers.push(() => (val.textContent = litres(ctx.rec().waterMl || 0)));
  }

  // weight
  const weightHost = h('section', { class: 'bn-tile t-weight wide' });
  const drawWeight = () => weightHost.replaceChildren(weightTile(drawWeight));
  drawWeight();
  grid.append(weightHost);
}
