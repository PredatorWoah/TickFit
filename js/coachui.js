// coachui.js
// The "AI coach" sheet (Workout screen): how many exercises for which muscles, how long you have, anything the
// coach should know. The draft comes back with weights and reasons; "Use this workout" puts it on the day, and
// Undo puts the day back. The thinking is in coach.js; the AI is the one set up in More (llm.js).

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, savePlans, snapshot, restoreSnapshot, setSetting } from './store.js';
import { activeAI } from './aiassist.js';
import { ask } from './llm.js';
import { MUSCLES, MAX_EXERCISES, normalizeAsk, progressDigest, coachPrompt, parseCoachDraft, applyCoachDraft } from './coach.js';
import { dayFor } from './schedule.js';
import { todayStr, formatShort } from './dates.js';

const MINUTES = [30, 45, 60, 75, 90];

export function openCoach({ plan, date, onDone }) {
  const ai = activeAI();
  const saved = (getState().settings || {}).coachAsk || {};
  const counts = { ...(saved.counts || {}) };
  // the total is the muscles you chose plus `extra` exercises left to the coach (the Total stepper sets extra)
  let extra = Math.max(0, (Number(saved.total) || 0) - normalizeAsk({ counts }).total);
  let minutes = MINUTES.includes(saved.minutes) ? saved.minutes : 60;
  let stop = null;

  openSheet({
    title: 'AI coach',
    onClose: () => stop && stop.abort(),
    build(body, close) {
      if (!ai) {
        body.append(
          h('p', {}, 'The coach uses the AI you set up yourself, with your own key. Turn on More > AI helpers, pick OpenRouter (it has free models), Claude, ChatGPT or Gemini and paste your key, then come back here.'),
          h('button', { class: 'btn primary wide', type: 'button', onclick: close }, 'OK')
        );
        return;
      }

      // ----- what to draft
      const sumOf = () => normalizeAsk({ counts, total: normalizeAsk({ counts }).total + extra });
      const totalOut = h('b', { class: 'coach-total-n' });
      const freeOut = h('span', { class: 'hint tight' });
      const rows = new Map();
      const refresh = () => {
        const a = sumOf();
        totalOut.textContent = String(a.total);
        freeOut.textContent = a.free ? `${a.free} of the coach's choice` : a.total ? '' : 'Pick some muscles, or set a total and let the coach choose';
        for (const [m, out] of rows) out.textContent = String(counts[m] || 0);
        go.disabled = !a.total;
      };
      const stepper = (label, get, set, max = MAX_EXERCISES) => {
        const out = h('b', { class: 'coach-n' }, String(get()));
        const change = (d) => {
          set(Math.max(0, Math.min(max, get() + d)));
          refresh();
        };
        return [
          h(
            'div',
            { class: 'coach-row' },
            h('span', { class: 'coach-label' }, label),
            h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Fewer ${label}`, onclick: () => change(-1) }, icon('minus', 18)),
            out,
            h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `More ${label}`, onclick: () => change(1) }, icon('plus', 18))
          ),
          out,
        ];
      };
      const muscleRows = MUSCLES.map((m) => {
        const [row, out] = stepper(m, () => counts[m] || 0, (n) => {
          if (normalizeAsk({ counts: { ...counts, [m]: n } }).total > MAX_EXERCISES) return toast(`Up to ${MAX_EXERCISES} exercises in one workout`);
          if (n) counts[m] = n;
          else delete counts[m];
          extra = Math.min(extra, MAX_EXERCISES - normalizeAsk({ counts }).total);
        });
        rows.set(m, out);
        return row;
      });
      const [totalRow] = stepper('Total', () => sumOf().total, (n) => (extra = Math.max(0, n - normalizeAsk({ counts }).total)));
      totalRow.classList.add('coach-total');
      totalRow.replaceChild(totalOut, totalRow.querySelector('.coach-n'));

      const time = h('select', { class: 'text-input coach-time', 'aria-label': 'Time you have', onchange: (e) => (minutes = Number(e.target.value)) }, MINUTES.map((n) => h('option', { value: n, selected: n === minutes }, `${n} min`)));
      const note = h('textarea', { class: 'notes', rows: 2, maxlength: 500, placeholder: 'Anything the coach should know? A sore shoulder, no bench free, want a lighter day...' });
      const status = h('p', { class: 'hint', role: 'status' });
      const result = h('div', { 'aria-live': 'polite' });
      const day = dayFor(plan, date);

      const go = h(
        'button',
        {
          class: 'btn primary wide big',
          type: 'button',
          onclick: async () => {
            const a = sumOf();
            if (!a.total) return;
            setSetting('coachAsk', { counts: a.counts, total: a.total, minutes });
            go.disabled = true;
            result.replaceChildren();
            status.textContent = `${ai.name} is looking at your last 6 weeks and drafting...`;
            stop = new AbortController();
            try {
              const digest = progressDigest(plan, getState().progress[plan.id] || {}, todayStr());
              const prompt = coachPrompt({ ask: a, digest, profile: (getState().settings || {}).profile || null, dayLabel: day.label, note: note.value.trim(), minutes });
              const reply = await ask(prompt, {
                maxTokens: 8000,
                effort: 'high',
                signal: stop.signal,
                onWait: (at) => (status.textContent = `${ai.name}'s limit ran out. Trying again at ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by itself.`),
              });
              const draft = parseCoachDraft(reply, a);
              if (!draft || !draft.exercises.length) throw new Error(`${ai.name} did not send a usable workout. Tap Draft again.`);
              status.textContent = '';
              showDraft(draft);
            } catch (e) {
              status.textContent = e.message || String(e);
            } finally {
              stop = null;
              go.disabled = false;
              go.textContent = 'Draft again';
            }
          },
        },
        icon('sparkle', 18),
        'Draft my workout'
      );

      function showDraft(draft) {
        const logged = Object.values(((getState().progress[plan.id] || {})[date] || {}).sets || {}).some((l) => (l || []).some((s) => s && s.done));
        const use = h(
          'button',
          {
            class: 'btn primary wide',
            type: 'button',
            onclick: () => {
              const before = snapshot();
              applyCoachDraft(plan, date, draft);
              savePlans();
              close();
              toast(`Coach workout set for ${date === todayStr() ? 'today' : formatShort(date)}`, {
                undo: () => {
                  restoreSnapshot(before);
                  onDone();
                },
              });
              onDone();
            },
          },
          logged ? 'Use this workout (sets you logged stay in your history)' : 'Use this workout'
        );
        result.replaceChildren(
          ...[
            draft.summary ? h('p', { class: 'coach-summary' }, draft.summary) : null,
            draft.warnings.length ? h('div', { class: 'msg warn' }, h('ul', {}, draft.warnings.map((w) => h('li', {}, w)))) : null,
            h(
              'ol',
              { class: 'coach-list' },
              draft.exercises.map((x) =>
                h(
                  'li',
                  {},
                  h('b', {}, x.exercise),
                  h('span', { class: 'coach-meta' }, [x.muscle, `${x.sets} × ${x.reps}`, x.weight && `@ ${x.weight}`, x.rir !== null && `${x.rir} RIR`, x.rest && `rest ${x.rest}`].filter(Boolean).join(' · ')),
                  x.why ? h('small', {}, x.why) : null
                )
              )
            ),
            use,
          ].filter(Boolean) // (append() would print a null as the word "null")
        );
        result.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }

      body.append(
        h('p', { class: 'hint' }, `For ${date === todayStr() ? 'today' : formatShort(date)} (${day.label}). Choose how many exercises for each muscle; a total above them leaves the rest to the coach.`),
        h('div', { class: 'coach-grid' }, ...muscleRows),
        totalRow,
        freeOut,
        h('label', { class: 'field' }, h('span', {}, 'Time you have'), time),
        note,
        h('p', { class: 'hint tight' }, `Sent to ${ai.name}: these choices, your training profile, your note and your last 6 weeks of logged sets (exercise names, weights and reps). Never meals, notes, photos or body measurements.`),
        go,
        status,
        result
      );
      refresh();
    },
  });
}
