// shareui.js
// The plan sharing sheet (QR code, share or copy the link) and the "Add this plan?" sheet a shared link opens.

import { h, toast, copyText } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { isNative, nativePlugin } from './platform.js';
import { planLink, qrSvg, decodePlan, planFromHash } from './share.js';
import { validatePlan } from './parser.js';
import { addPlan, getState } from './store.js';
import { todayStr } from './dates.js';

export function openPlanShare(plan) {
  openSheet({
    title: 'Share this plan',
    async build(body) {
      const qrBox = h('div', { class: 'qr-box', role: 'img', 'aria-label': 'QR code for this plan' }, h('p', { class: 'hint' }, 'Making the code…'));
      body.append(h('p', { class: 'hint' }, `Your friend scans this with their phone camera (or opens the link) and TickFit adds "${plan.name}". Only the plan goes: never your progress, weights, photos or settings.`), qrBox);
      let link;
      try {
        link = await planLink(plan);
      } catch {
        qrBox.replaceChildren(h('p', { class: 'msg warn' }, 'This browser cannot pack the plan. Try the TickFit app or a newer browser.'));
        return;
      }
      const svg = await qrSvg(link);
      if (svg) {
        const holder = h('div', { class: 'qr-svg' });
        holder.innerHTML = svg; // made right here from our own data, never from outside text
        qrBox.replaceChildren(holder);
      } else qrBox.replaceChildren(h('p', { class: 'msg warn' }, 'This plan is too big for one QR code. Share the link instead: it works the same.'));
      const share = async () => {
        try {
          if (isNative() && nativePlugin('Share')) await nativePlugin('Share').share({ title: `TickFit plan: ${plan.name}`, text: `My TickFit plan "${plan.name}". Open this to add it:`, url: link, dialogTitle: 'Share this plan' });
          else if (navigator.share) await navigator.share({ title: `TickFit plan: ${plan.name}`, text: `My TickFit plan "${plan.name}". Open this to add it:`, url: link });
          else return copy();
        } catch {
          /* closed the share sheet */
        }
      };
      const copy = async () => toast((await copyText(link)) ? 'Link copied' : 'Could not copy the link');
      body.append(
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: share }, icon('upload', 18), 'Share link'), h('button', { class: 'btn', type: 'button', onclick: copy }, icon('paste', 18), 'Copy link')),
        h('p', { class: 'hint tight' }, `The link is ${link.length.toLocaleString()} characters long; it carries the whole plan.`)
      );
    },
  });
}

/** If the page was opened from a shared plan link, offer to add that plan. `onAdded()` redraws the app. */
export async function handleIncomingPlan(onAdded) {
  const packed = planFromHash();
  if (!packed) return;
  history.replaceState(null, '', location.pathname + location.search); // the link is used once
  let check;
  try {
    check = validatePlan(await decodePlan(packed));
  } catch (e) {
    return toast(e.message || 'That plan link is damaged.');
  }
  if (!check.ok) return toast(`That shared plan has a problem: ${check.errors[0]}`);
  const plan = check.plan;
  const exercises = new Set(plan.days.flatMap((d) => d.workout.map((w) => w.exercise))).size + (plan.library ? plan.library.exercises.length : 0);
  openSheet({
    title: 'A plan from a friend',
    build(body, close) {
      body.append(
        h('div', { class: 'option sel' }, h('span', { class: 'option-icon' }, icon('plans', 24)), h('span', { class: 'option-text' }, h('b', {}, plan.name), h('span', {}, `${plan.days.length} day${plan.days.length === 1 ? '' : 's'} · ${exercises} exercise${exercises === 1 ? '' : 's'}`))),
        h('p', { class: 'hint' }, getState().plans.length ? 'It is added next to your plans and starts today. Your own plans and progress are not touched; switch back any time in More > My plan.' : 'It starts today.'),
        h('button', { class: 'btn primary wide', type: 'button', onclick: () => { addPlan(plan, todayStr()); close(); toast(`Added "${plan.name}"`); onAdded(); } }, icon('plus', 18), 'Add and use this plan'),
        h('button', { class: 'btn ghost wide', type: 'button', onclick: close }, 'Not now')
      );
    },
  });
}
