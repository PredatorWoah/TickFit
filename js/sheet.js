// sheet.js
// A bottom sheet: a panel that slides up from the bottom of the screen over the page.
// Good for phones because it keeps you in context and is easy to reach with a thumb.
//
//   const sheet = openSheet({ title: 'Bench Press', build: (body, close) => { ... } });
//
// It closes when you tap the dark area, press Escape, tap the X, or press the phone's Back button.

import { h } from './dom.js';
import { icon } from './icons.js';

let current = null; // only one sheet at a time

/**
 * @param title    heading shown at the top
 * @param build    function(bodyElement, close) that fills the sheet
 * @param onClose  called once after the sheet has closed
 */
export function openSheet({ title, build, onClose }) {
  if (current) current.close();

  const opener = document.activeElement;
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close', 20));
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-title' }, title), closeBtn),
    body
  );
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: () => close() });
  const root = h('div', { class: 'sheet-root' }, backdrop, panel);

  let closed = false;
  let poppedByBrowser = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('popstate', onPop);
    // If we pushed a history entry for this sheet and the user didn't already use Back, remove it.
    if (!poppedByBrowser && history.state && history.state.tickfitSheet) history.back();
    root.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => root.remove(), 220);
    if (current && current.root === root) current = null;
    if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    if (onClose) onClose();
  }

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const onPop = () => {
    poppedByBrowser = true; // the phone's Back button already removed our history entry
    close();
  };

  document.body.append(root);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  history.pushState({ tickfitSheet: true }, '');
  window.addEventListener('popstate', onPop);
  build(body, close);
  requestAnimationFrame(() => {
    root.classList.add('open');
    closeBtn.focus({ preventScroll: true });
  });

  current = { root, close };
  return { close };
}
