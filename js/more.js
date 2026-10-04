// more.js
// The More screen: backup and restore, and the privacy note.
// (Phase 3 adds settings here: theme, language, Gemini key.)

import { h, clear, toast } from './dom.js';
import { exportBackup, importBackup, looksLikeBackup } from './store.js';
import { validatePlan } from './parser.js';
import { todayStr } from './dates.js';

/** Download a JSON file. Works on phones too (Safari/Chrome offer to save or share it). */
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** @param actions { refresh() } redraw the app after a restore */
export function renderMore(root, actions) {
  clear(root);

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // lets you pick the same file again later
      if (!file) return;
      let obj;
      try {
        obj = JSON.parse(await file.text());
      } catch {
        return toast('That file is not valid JSON');
      }
      if (!looksLikeBackup(obj)) return toast('That does not look like a TickFit backup file.');
      if (!confirm('Restore this backup? It REPLACES all plans and progress currently in the app.')) return;
      const result = importBackup(obj, validatePlan);
      if (!result.ok) return toast(result.error);
      toast(`Restored ${result.plans} plan${result.plans === 1 ? '' : 's'}`);
      actions.refresh();
    },
  });

  root.append(
    h('h1', { class: 'page-title' }, 'More'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Backup'),
      h('p', { class: 'hint' }, 'Your data lives only on this device. Save a backup file now and then, or to move to a new phone.'),
      h(
        'button',
        {
          class: 'btn primary wide',
          onclick: () => {
            downloadJson(exportBackup(), `tickfit-backup-${todayStr()}.json`);
            toast('Backup saved');
          },
        },
        'Export backup'
      ),
      h('button', { class: 'btn wide', onclick: () => fileInput.click() }, 'Import backup'),
      fileInput
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint' }, 'TickFit has no accounts, no servers and no tracking. Everything you enter stays in this browser on this device. Nothing is ever sent anywhere.')
    )
  );
}
