// update.js
// Helpers for getting the newest version of the app. Your plans and progress are never touched:
// they live in localStorage, and this only clears the app's offline file cache.

import { h } from './dom.js';

/**
 * The version of the code that is running right now: the deploy stamp on this file's own URL
 * (like ?v=abc1234, added when deploying). "dev" when running straight from the source files.
 */
export function runningVersion() {
  return new URL(import.meta.url).searchParams.get('v') || 'dev';
}

/** Throw away the cached app files and the service worker, then reload to fetch everything fresh. Saved data is NOT affected. */
export async function forceUpdate() {
  try {
    const regs = (await navigator.serviceWorker.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('tickfit-')).map((k) => caches.delete(k)));
  } catch {
    // If anything fails we still reload; the next load will try again.
  }
  location.reload();
}

/** A small bar offering a reload after a new version has installed itself. */
export function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  document.body.append(
    h(
      'div',
      { id: 'update-banner', class: 'update-banner', role: 'status' },
      h('span', {}, 'TickFit has a new version.'),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => location.reload() }, 'Reload')
    )
  );
}
