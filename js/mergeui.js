// mergeui.js
// The "Bring in progress" sheet: copy the days you logged in another plan into this one, so switching plans
// keeps your streak, calendar, summaries and lifting history. Offered by itself right after you switch to or
// add a plan, and always available from My plans.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState, mergeProgressInto } from './store.js';
import { loggedDays } from './merge.js';

/** Other plans that have logged days, the one in `first` at the top. */
function sources(toId, first) {
  const { plans, progress } = getState();
  return plans
    .filter((p) => p.id !== toId)
    .map((p) => ({ plan: p, days: loggedDays(progress[p.id]) }))
    .filter((s) => s.days > 0)
    .sort((a, b) => (b.plan.id === first) - (a.plan.id === first) || b.days - a.days);
}

/** Is there anything to bring into this plan? */
export const canMergeInto = (toId) => sources(toId).length > 0;

/**
 * @param toId    the plan to bring progress into (usually the active one)
 * @param first   a plan to list first (the one you just left)
 * @param intro   text at the top
 * @param onDone  called after the sheet closes if anything was brought in
 */
export function openMergeSheet({ toId, first = null, intro = null, onDone = () => {} }) {
  const to = getState().plans.find((p) => p.id === toId);
  const list = sources(toId, first);
  if (!to || !list.length) return;
  let changed = false;

  openSheet({
    title: 'Bring in progress',
    onClose: () => changed && onDone(),
    build(body, close) {
      const rows = list.map(({ plan, days }) => {
        const status = h('small', {}, `${days} logged day${days === 1 ? '' : 's'}`);
        const btn = h(
          'button',
          {
            class: 'btn primary small',
            type: 'button',
            onclick: () => {
              const r = mergeProgressInto(plan.id, toId);
              if (!r) return;
              changed = changed || r.copied > 0;
              closeBtn.textContent = 'Done';
              btn.disabled = true;
              btn.textContent = 'Done';
              status.textContent = r.copied
                ? `Brought in ${r.copied} day${r.copied === 1 ? '' : 's'}${r.skipped ? `. ${r.skipped} already had progress here, so they were kept as they are` : ''}.`
                : 'Nothing new to bring in: those days already have progress here.';
              toast(r.copied ? `Brought in ${r.copied} day${r.copied === 1 ? '' : 's'} from ${plan.name}` : 'Nothing new to bring in');
            },
          },
          icon('plus', 18),
          'Bring in'
        );
        return h('li', { class: 'merge-row' }, h('span', { class: 'merge-text' }, h('b', {}, plan.name), status), btn);
      });
      const closeBtn = h('button', { class: 'btn wide', type: 'button', onclick: close }, 'Not now');
      body.append(
        h('p', { class: 'sheet-target' }, intro || `Copy the days you logged in another plan into "${to.name}". Your streak, calendar, summaries and lifting history then carry on here.`),
        h('ul', { class: 'merge-list' }, rows),
        h('p', { class: 'hint' }, 'Each day keeps the exercises and meals it had, with every tick and logged set. Days you already logged in this plan are never overwritten, and the other plan keeps its copy too.'),
        closeBtn
      );
    },
  });
}

/** After switching from `prevId` to `newId`: offer to bring the old plan's progress along, if it has any. */
export function offerMerge(prevId, newId, onDone) {
  const { progress, plans } = getState();
  if (!prevId || prevId === newId || !loggedDays(progress[prevId])) return;
  const prev = plans.find((p) => p.id === prevId);
  // wait for the new screen to draw, so the sheet slides up over it
  setTimeout(
    () =>
      openMergeSheet({
        toId: newId,
        first: prevId,
        intro: `Keep your history? You logged ${loggedDays(progress[prevId])} days in "${prev ? prev.name : 'your last plan'}". Bring them into this plan so your streak, calendar and progress carry on.`,
        onDone,
      }),
    350
  );
}
