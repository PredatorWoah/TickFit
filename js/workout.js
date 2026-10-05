// workout.js
// The Workout screen ("workout mode"). Everything happens on this one screen, with no pop-ups:
//   * Start workout starts a clock (it also starts by itself when you tick your first set).
//   * Exercises are listed in order. The one you're on is open, showing a row for each set with big
//     weight and reps boxes. Finish all its sets and the next exercise opens by itself.
//   * A rest timer starts after each set (More has a switch for that).
//   * Finish workout shows a summary: time, sets and total weight lifted.

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { notesCard } from './notesui.js';
import { openBackupSheet } from './backupui.js';
import { loggedDayCount } from './safety.js';
import { getState } from './store.js';
import { exerciseBurn, singleBurn, bodyWeightKg } from './burn.js';
import { exerciseProgress, plannedSets, repsTarget, lastPerformance, formatSets } from './stats.js';
import { rowsFor, saveRows, startSession, finishSession, reopenSession, sessionState, sessionMs, workoutSummary, estimateMinutes, nextExercise, formatDuration } from './logging.js';
import { parseRestSeconds, startRest } from './timer.js';
import { fromStr, todayStr } from './dates.js';
import { haptic } from './platform.js';
import { createCtx, dateBar, LOCALE } from './dayview.js';

let clockTimer = null; // the 1 second tick for the running clock

/** Stop the clock and remove the floating bar. Called whenever we leave this screen. */
export function teardownWorkout() {
  clearInterval(clockTimer);
  clockTimer = null;
  const bar = document.getElementById('wk-bar');
  if (bar) bar.remove();
  document.body.classList.remove('has-wkbar');
}

export function renderWorkout(root, plan, date, goto) {
  teardownWorkout();
  clear(root);
  const ctx = createCtx(plan, date, goto);
  const { day } = ctx;

  root.append(dateBar(ctx));

  // ----- a rest day -----
  if (!day.workout.length) {
    root.append(h('div', { class: 'empty-card' }, h('div', { class: 'empty-icon' }, icon('flame', 32)), h('h1', { class: 'wk-title' }, 'Rest day'), h('p', {}, 'No workout today. Recovery is part of the plan. A walk and a good night of sleep are plenty.')));
    root.append(notesCard(ctx));
    return;
  }

  const totalSets = day.workout.reduce((t, w) => t + plannedSets(w), 0);

  // ----- header -----
  const progressText = h('span', { class: 'wk-progress-text' });
  const progressFill = h('div', { class: 'bar-fill' });
  const stateArea = h('div', { class: 'wk-state' });
  root.append(
    h('h1', { class: 'wk-title' }, day.label),
    h('p', { class: 'wk-meta' }, `${day.workout.length} exercises · ${totalSets} sets · about ${estimateMinutes(day)} min`),
    h('div', { class: 'wk-progress' }, progressText, h('div', { class: 'bar big' }, progressFill)),
    stateArea
  );
  root.append(notesCard(ctx));

  // ----- the clock and the finish summary -----
  const clockEls = []; // every element that shows the running clock
  const tick = () => clockEls.forEach((el) => (el.textContent = formatDuration(sessionMs(ctx.rec()))));

  /** After a workout: ask to save a backup, unless one was already made today or the person turned this off in More. */
  function askToSaveProgress() {
    const { settings, progress } = getState();
    if (settings.askBackupAfterWorkout === false) return;
    if (settings.lastBackup === todayStr() || loggedDayCount(progress) < 1) return;
    // wait for the summary sheet to finish closing, two sheets cannot share the phone's Back history at once
    setTimeout(() => openBackupSheet(() => {}, { title: 'Save your progress', intro: 'Nice work. Your workout is saved on this phone. A quick backup keeps it safe if you lose the phone or switch to a new one.', notNow: true }), 380);
  }

  function openSummary() {
    const s = workoutSummary(day, ctx.rec());
    const burn = exerciseBurn(day, ctx.rec(), bodyWeightKg(getState().settings, getState().bodyLog, todayStr()));
    openSheet({
      title: 'Workout complete',
      onClose: askToSaveProgress,
      build(body, close) {
        const stat = (value, label) => h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(value)), h('div', { class: 'stat-label' }, label));
        body.append(
          ...[
            h('p', { class: 'sheet-target' }, `${day.label} · ${fromStr(date).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}`),
            h('div', { class: 'stats' }, stat(formatDuration(sessionMs(ctx.rec())), 'time'), stat(`${s.setsDone}/${s.setsTotal}`, 'sets'), stat(s.volumeKg ? s.volumeKg.toLocaleString() : '–', s.volumeKg ? 'kg lifted' : 'lifted')),
            burn.kcal > 0 && h('div', { class: 'burn-total' }, h('b', {}, `~${burn.kcal} kcal`), ' burnt (estimate)', burn.cardioKcal > 0 && h('span', {}, ` · cardio ${burn.cardioMinutes} min, ~${burn.cardioKcal} kcal`)),
            burn.items.length > 0 && h('ul', { class: 'burn-list' }, burn.items.map((i) => h('li', {}, h('span', {}, i.name), h('span', {}, `~${i.kcal} kcal`)))),
            s.exercisesDone < s.exercisesTotal && h('p', { class: 'hint' }, `${s.exercisesTotal - s.exercisesDone} exercise${s.exercisesTotal - s.exercisesDone === 1 ? '' : 's'} not finished. You can still tick them off later.`),
            h('button', { class: 'btn primary wide big', type: 'button', onclick: close }, 'Done'),
          ].filter(Boolean)
        );
      },
    });
  }

  /** The area under the header: Start button, the running clock, or the summary. */
  function drawState() {
    clear(stateArea);
    clockEls.length = 0;
    const state = sessionState(ctx.rec());
    if (state === 'idle') {
      stateArea.append(h('button', { class: 'btn primary wide big cta', type: 'button', onclick: () => ctx.change((r) => startSession(r)) }, icon('play', 22), 'Start workout'));
    } else if (state === 'active') {
      // Nothing here: the floating bar at the bottom shows the clock and the Finish button.
    } else {
      const s = workoutSummary(day, ctx.rec());
      const clock = h('b', {}, formatDuration(sessionMs(ctx.rec())));
      stateArea.append(
        h(
          'div',
          { class: 'done-card' },
          h('span', { class: 'done-badge' }, icon('check', 22)),
          h('div', { class: 'done-text' }, h('b', {}, 'Workout complete'), h('span', {}, clock, ` · ${s.setsDone}/${s.setsTotal} sets${s.volumeKg ? ` · ${s.volumeKg.toLocaleString()}\u00a0kg` : ''}`)),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => ctx.change((r) => reopenSession(r)) }, 'Reopen')
        )
      );
    }
    tick();
  }

  /** The floating bar with the clock and the Finish button, shown while a workout is running. */
  function syncBar() {
    const existing = document.getElementById('wk-bar');
    if (sessionState(ctx.rec()) !== 'active') {
      if (existing) existing.remove();
      document.body.classList.remove('has-wkbar');
      return;
    }
    if (existing) return;
    const clock = h('span', { class: 'clock big' }, '0:00');
    clockEls.push(clock);
    const bar = h(
      'div',
      { id: 'wk-bar', class: 'wk-bar' },
      h('div', { class: 'wk-bar-time' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), clock),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            haptic('success');
            ctx.change((r) => finishSession(r));
            openSummary();
          },
        },
        'Finish workout'
      )
    );
    document.body.append(bar);
    document.body.classList.add('has-wkbar');
    tick();
  }

  let lastState = null;
  ctx.refreshers.push(() => {
    const s = workoutSummary(day, ctx.rec());
    progressText.textContent = `${s.setsDone} of ${s.setsTotal} sets`;
    progressFill.style.width = (s.setsTotal ? (s.setsDone / s.setsTotal) * 100 : 0) + '%';
    const state = sessionState(ctx.rec());
    if (state !== lastState) {
      lastState = state;
      drawState();
    }
    syncBar();
  });
  clockTimer = setInterval(tick, 1000);

  // ----- the exercises -----
  let openId = (nextExercise(day, ctx.rec()) || {}).id || null; // the one that is open (one at a time)
  const items = new Map(); // exercise id -> { li, setOpen(bool) }

  function setOpenExercise(id, scroll) {
    openId = id;
    for (const [exId, item] of items) item.setOpen(exId === id);
    if (id && scroll) {
      const li = items.get(id).li;
      setTimeout(() => li.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    }
  }

  function exerciseItem(w, number) {
    const timed = !!w.reps && repsTarget(w.reps) === null; // "30 min" or "45 sec" has no weight or reps
    const restSecs = parseRestSeconds(w.rest);
    const last = () => lastPerformance(plan, ctx.records(), date, w.exercise);

    const facts = [];
    if (w.sets || w.reps) facts.push(w.sets && w.reps ? `${w.sets} × ${w.reps}` : w.sets ? `${w.sets} sets` : w.reps);
    if (w.weight) facts.push(/^\d/.test(w.weight) && !/[a-z]/i.test(w.weight) ? `${w.weight} kg` : w.weight);
    if (w.rest) facts.push(`rest ${w.rest}`);

    const badge = h('span', { class: 'ex-badge' }, String(number));
    const sub = h('span', { class: 'ex-sub' });
    const chev = h('span', { class: 'ex-chev' }, icon('chevron-down', 20));
    const head = h('button', { class: 'ex-head', type: 'button', 'aria-expanded': 'false', onclick: () => setOpenExercise(openId === w.id ? null : w.id, false) }, badge, h('span', { class: 'ex-text' }, h('span', { class: 'ex-title' }, w.exercise), sub), chev);
    const body = h('div', { class: 'ex-body', hidden: true });
    const li = h('li', { class: 'ex' }, head, body);

    let rows = null;
    let popIndex = -1; // which set was just ticked (it gets a little pop animation)

    const save = () => ctx.change((r) => saveRows(r, w, rows));

    function drawBody() {
      clear(body);
      const wasDone = !!ctx.rec().ticks[w.id];
      const list = h('div', { class: 'sets' });
      const numInput = (value, placeholder, label, onValue) => {
        const input = h('input', {
          class: 'set-in',
          type: 'number',
          inputMode: 'decimal',
          min: 0,
          step: 'any',
          placeholder,
          'aria-label': label,
          oninput: (e) => {
            const v = parseFloat(e.target.value);
            onValue(isFinite(v) && v >= 0 ? v : null);
          },
        });
        input.value = value ?? '';
        return input;
      };

      list.append(h('div', { class: 'set-head' + (timed ? ' timed' : '') }, h('span', {}, 'Set'), timed ? h('span', {}, 'Target') : [h('span', {}, 'Kg'), h('span', {}, 'Reps')], h('span', {}, '')));
      rows.forEach((s, i) => {
        const justTicked = i === popIndex; // only the set you just ticked gets the little pop
        const chk = h(
          'button',
          {
            class: 'set-check' + (s.done ? ' on' : '') + (justTicked ? ' pop' : ''),
            type: 'button',
            role: 'checkbox',
            'aria-checked': String(s.done),
            'aria-label': `Set ${i + 1} done`,
            onclick: () => {
              s.done = !s.done;
              popIndex = s.done ? i : -1;
              if (s.done) haptic();
              // The first ticked set starts the workout clock, so you never have to press Start.
              if (s.done && sessionState(ctx.rec()) === 'idle') ctx.change((r) => startSession(r));
              save();
              if (s.done && restSecs && i < rows.length - 1 && getState().settings.autoRest !== false) startRest(restSecs, `${w.exercise}, set ${i + 1} done`);
              drawBody();
              // Finished every set? Close this one and open the next exercise.
              if (s.done && rows.every((x) => x.done)) {
                const next = nextExercise(day, ctx.rec());
                setOpenExercise(next ? next.id : null, true);
              }
            },
          },
          icon('check', 26)
        );
        list.append(
          h(
            'div',
            { class: 'set-row' + (s.done ? ' done' : '') + (timed ? ' timed' : '') },
            h('span', { class: 'set-n' }, String(i + 1)),
            timed ? h('span', { class: 'set-timed' }, w.reps) : [numInput(s.w, 'kg', `Set ${i + 1} weight in kilograms`, (v) => ((s.w = v), save())), numInput(s.r, 'reps', `Set ${i + 1} reps`, (v) => ((s.r = v), save()))],
            chk
          )
        );
      });
      popIndex = -1;

      const lastTime = last();
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(w.exercise + ' proper form')}`;
      body.append(
        ...[
          facts.length > 0 && h('p', { class: 'ex-target' }, facts.join(' · ')),
          w.notes && h('p', { class: 'sheet-note' }, w.notes),
          lastTime && h('p', { class: 'last-time' }, h('b', {}, 'Last time '), `(${fromStr(lastTime.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}): ${formatSets(lastTime.sets)}`),
          list,
          h(
            'div',
            { class: 'set-tools' },
            h(
              'button',
              {
                class: 'btn ghost small',
                type: 'button',
                onclick: () => {
                  rows.push({ ...rows[rows.length - 1], done: false });
                  save();
                  drawBody();
                },
              },
              icon('plus', 18),
              'Add set'
            ),
            rows.length > 1 &&
              h(
                'button',
                {
                  class: 'btn ghost small',
                  type: 'button',
                  onclick: () => {
                    rows.pop();
                    save();
                    drawBody();
                  },
                },
                icon('minus', 18),
                'Remove set'
              ),
            h('a', { class: 'btn ghost small', href: w.video || searchUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('play', 16), w.video ? 'Watch video' : 'Form video'),
            restSecs && h('button', { class: 'btn ghost small', type: 'button', onclick: () => startRest(restSecs, w.exercise) }, icon('timer', 18), `Rest ${w.rest}`)
          ),
          !wasDone &&
            h(
              'button',
              {
                class: 'btn wide',
                type: 'button',
                onclick: () => {
                  rows.forEach((x) => (x.done = true));
                  if (sessionState(ctx.rec()) === 'idle') ctx.change((r) => startSession(r));
                  save();
                  drawBody();
                  const next = nextExercise(day, ctx.rec());
                  setOpenExercise(next ? next.id : null, true);
                },
              },
              'Mark all sets done'
            )
        ].filter(Boolean)
      );
    }

    items.set(w.id, {
      li,
      setOpen(open) {
        head.setAttribute('aria-expanded', String(open));
        body.hidden = !open;
        li.classList.toggle('open', open);
        if (open) {
          rows = rowsFor(ctx.rec(), w, last()); // always start from what is saved
          drawBody();
        }
      },
    });

    ctx.refreshers.push(() => {
      const r = ctx.rec();
      const p = exerciseProgress(w, r);
      const ticked = !!r.ticks[w.id];
      li.classList.toggle('done', ticked);
      badge.replaceChildren(ticked ? icon('check', 18) : String(number));
      const logged = (r.sets && r.sets[w.id] || []).filter((s) => s.done && (s.w != null || s.r != null));
      const kcal = p.done > 0 ? singleBurn(day, r, w, bodyWeightKg(getState().settings, getState().bodyLog, todayStr())) : 0;
      const burnTxt = kcal ? ` · ~${kcal} kcal` : '';
      sub.textContent = (ticked ? (logged.length ? formatSets(logged) : 'Done') : p.done > 0 ? `${p.done} of ${p.total} sets done` : facts.join(' · ')) + burnTxt;
    });
    return li;
  }

  root.append(h('ul', { class: 'exlist' }, day.workout.map((w, i) => exerciseItem(w, i + 1))));

  ctx.refresh();
  setOpenExercise(openId, false);
}
