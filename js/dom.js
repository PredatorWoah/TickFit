// dom.js
// A tiny helper for building HTML elements, so screens read like a template.
//
//   h('button', { class: 'btn', onclick: save }, 'Save')
//   h('ul', {}, items.map((i) => h('li', {}, i.name)))
//
// Text is always added as text (never as HTML), so imported plans can't inject code.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && key !== 'list') el[key] = value; // value, checked, disabled, placeholder...
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Remove everything inside an element. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Copy text to the clipboard. Falls back for older browsers. Returns true on success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * A short message at the bottom of the screen.
 * @param opts  { undo: fn } adds an Undo button (and keeps the message up longer); { ms } sets how long it stays.
 *              onGone(undone) runs when it disappears, e.g. to really delete something only once Undo is no longer possible.
 */
export function toast(message, opts = {}) {
  const old = document.querySelector('.toast');
  if (old) {
    if (old._finish) old._finish(false);
    old.remove();
  }
  let done = false;
  const el = h('div', { class: 'toast' + (opts.undo ? ' has-action' : ''), role: 'status' }, h('span', {}, message));
  const finish = (undone) => {
    if (done) return;
    done = true;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
    if (opts.onGone) opts.onGone(undone);
  };
  el._finish = finish;
  if (opts.undo) {
    el.append(
      h(
        'button',
        {
          class: 'toast-undo',
          type: 'button',
          onclick: () => {
            if (done) return;
            opts.undo();
            finish(true);
          },
        },
        'Undo'
      )
    );
  }
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => finish(false), opts.ms || (opts.undo ? 5500 : 2200));
}
