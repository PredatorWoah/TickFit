// assistantui.js
// The AI assistant sheet ("Ask AI"), loaded on demand. A short chat: ask anything about your training, food or
// progress. When the AI suggests changes, each one is shown as a sentence with Apply and Skip; nothing changes
// until you tap. After applying, Undo puts everything back.
//
// If your AI usage runs out, the question waits and is sent again by itself when the limit resets (llm.js ask);
// the sheet says when, and Stop cancels it.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, savePlans, snapshot, restoreSnapshot } from './store.js';
import { ask, activeProvider } from './llm.js';
import { assistantContext, assistantPrompt, parseReply, describeAction, applyAction, historyAllowed } from './assistant.js';

const chat = []; // this session's conversation: { role: 'you' | 'ai', text, actions?, done? }

const QUICK = [
  'Summarise my last week',
  'How is my progress? Be honest',
  "Make today's workout doable at home with no equipment",
  "Lower today's calories by about 300",
  'Add more protein to my meals',
  'Review my goal and suggest changes',
];

const clock = (ms) => new Date(ms).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });

/**
 * @param plan      the active plan
 * @param date      the date being looked at ("YYYY-MM-DD")
 * @param onChange  called after a change is applied or undone, to redraw the screen
 */
export function openAssistant({ plan, date, onChange }) {
  const ai = activeProvider();
  if (!ai) return toast('Turn on AI helpers and add a key in More first.');
  let busy = null; // AbortController while waiting for an answer

  openSheet({
    title: 'Ask AI',
    onClose: () => busy && busy.abort(),
    build(body) {
      const log = h('div', { class: 'ai-chat', 'aria-live': 'polite' });
      const status = h('p', { class: 'ai-status', role: 'status' });
      const input = h('textarea', { class: 'text-input ai-input', rows: 2, maxlength: 1500, placeholder: 'Ask anything, or tell it what to change', 'aria-label': 'Your message to the AI' });
      const send = h('button', { class: 'btn primary ai-send', type: 'button', 'aria-label': 'Send' }, icon('chevron-right', 22));
      const stop = h('button', { class: 'btn small', type: 'button', hidden: true, onclick: () => busy && busy.abort() }, 'Stop');
      const chips = h('div', { class: 'ai-quick', role: 'group', 'aria-label': 'Quick questions' }, QUICK.map((q) => h('button', { class: 'pick-chip', type: 'button', onclick: () => go(q) }, q)));

      function bubble(t) {
        const el = h('div', { class: `ai-msg ${t.role}` }, h('p', {}, t.text));
        if (t.role === 'ai' && t.actions && t.actions.length) {
          const list = h('ul', { class: 'ai-actions' });
          const rows = t.actions.map((a, i) => {
            const state = h('span', { class: 'ai-act-state' });
            const apply = h('button', { class: 'btn small primary', type: 'button', onclick: () => doApply([i]) }, 'Apply');
            const skip = h('button', { class: 'btn small', type: 'button', onclick: () => ((t.done[i] = 'skipped'), draw()) }, 'Skip');
            const li = h('li', { class: 'ai-act' }, h('span', { class: 'ai-act-text' }, describeAction(a)), h('div', { class: 'ai-act-btns' }, apply, skip, state));
            return { li, apply, skip, state };
          });
          const all = h('button', { class: 'btn small', type: 'button', onclick: () => doApply(t.actions.map((_, i) => i).filter((i) => !t.done[i])) }, `Apply all ${t.actions.length}`);
          function draw() {
            rows.forEach((r, i) => {
              const d = t.done[i];
              r.apply.hidden = r.skip.hidden = !!d;
              r.state.textContent = d === 'applied' ? 'Applied' : d === 'skipped' ? 'Skipped' : d ? d : '';
              r.li.classList.toggle('settled', !!d);
            });
            const left = t.actions.filter((_, i) => !t.done[i]).length;
            all.hidden = left < 2;
            all.textContent = `Apply all ${left}`;
          }
          // Apply some actions together, with one Undo for all of them
          function doApply(idx) {
            const before = snapshot();
            let ok = 0;
            for (const i of idx) {
              if (t.done[i]) continue;
              const res = applyAction(plan, t.actions[i]);
              t.done[i] = res.ok ? 'applied' : `Not applied: ${res.message}`;
              if (res.ok) ok++;
            }
            savePlans();
            draw();
            onChange();
            if (ok)
              toast(ok === 1 ? 'Change applied' : `${ok} changes applied`, {
                undo: () => {
                  restoreSnapshot(before);
                  idx.forEach((i) => t.done[i] === 'applied' && (t.done[i] = undefined));
                  draw();
                  onChange();
                },
              });
          }
          rows.forEach((r) => list.append(r.li));
          el.append(list, all);
          draw();
        }
        return el;
      }
      const redraw = () => {
        log.replaceChildren(...(chat.length ? chat.map(bubble) : [h('p', { class: 'hint' }, `Ask ${ai.name} anything about your plan, food or progress. It can suggest changes to exercises, meals, calories, water and workout time; you approve each one.`)]));
        log.scrollTop = log.scrollHeight;
      };

      async function go(text) {
        const message = String(text || input.value).trim();
        if (!message || busy) return;
        input.value = '';
        const history = chat.map((t) => ({ role: t.role, text: t.text }));
        chat.push({ role: 'you', text: message });
        redraw();
        busy = new AbortController();
        send.disabled = true;
        stop.hidden = false;
        status.textContent = `${ai.name} is thinking...`;
        try {
          const prompt = assistantPrompt(assistantContext(getState(), plan, date, { history: historyAllowed() }), history, message);
          const answer = await ask(prompt, {
            maxTokens: 4000,
            signal: busy.signal,
            onWait: (at) => (status.textContent = `Your AI usage limit ran out. TickFit will ask again by itself at ${clock(at)}; keep the app open. Tap Stop to cancel.`),
          });
          const { reply, actions } = parseReply(answer, date);
          chat.push({ role: 'ai', text: reply, actions, done: {} });
          status.textContent = '';
        } catch (e) {
          status.textContent = e.message === 'Stopped.' ? 'Stopped.' : e.message;
        } finally {
          busy = null;
          send.disabled = false;
          stop.hidden = true;
          redraw();
        }
      }
      send.onclick = () => go();
      input.addEventListener('keydown', (e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), go()));

      body.append(
        h('p', { class: 'hint tight ai-who' }, `${ai.name} · ${ai.model}`),
        log,
        chips,
        status,
        h('div', { class: 'ai-compose' }, input, send),
        stop,
        h('p', { class: 'hint tight' }, `Sent to ${ai.name} with each message: your plan for the next 7 days${historyAllowed() ? ', and your last 2 weeks of ticks, sets, weight and steps' : ''}. Change this in More.`)
      );
      redraw();
    },
  });
}
