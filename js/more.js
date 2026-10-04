// more.js
// The More screen: backup and restore, and the privacy note.
// Also: theme, rest timer sound, and the optional Gemini key.

import { h, clear, toast } from './dom.js';
import { getState, setSetting, exportBackup, importBackup, looksLikeBackup } from './store.js';
import { applyTheme } from './theme.js';
import { getGeminiConfig, saveGeminiConfig, clearGeminiKey, DEFAULT_MODEL } from './gemini.js';
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

  // ----- appearance -----
  const settings = getState().settings;
  const themeButtons = ['dark', 'light', 'auto'].map((t) =>
    h(
      'button',
      {
        'aria-pressed': String((settings.theme || 'dark') === t),
        onclick: () => {
          setSetting('theme', t);
          applyTheme(t);
          renderMore(root, actions);
        },
      },
      { dark: 'Dark', light: 'Light', auto: 'Match phone' }[t]
    )
  );

  // ----- Gemini (optional) -----
  const cfg = getGeminiConfig();
  const keyInput = h('input', { class: 'text-input', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: cfg.key ? 'Key saved (hidden)' : 'Paste your Gemini API key', 'aria-label': 'Gemini API key' });
  const modelInput = h('input', { class: 'text-input', type: 'text', autocomplete: 'off', spellcheck: false, value: cfg.model, 'aria-label': 'Gemini model name' });

  root.append(
    h('h1', { class: 'page-title' }, 'More'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Appearance'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, themeButtons)
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Rest timer'),
      h(
        'label',
        { class: 'check-line' },
        h('input', {
          type: 'checkbox',
          checked: settings.sound !== false,
          onchange: (e) => setSetting('sound', e.target.checked),
        }),
        'Beep and vibrate when rest ends'
      )
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'AI helper (optional)'),
      h('p', { class: 'hint' }, 'Turn a plain document into a plan in one tap using your own free Google Gemini key. You do not need this: the "Copy AI prompt" button works with any chatbot.'),
      h(
        'div',
        { class: 'msg warn' },
        h('b', {}, 'Read this first'),
        h(
          'ul',
          {},
          h('li', {}, 'The text of your document is sent to Google when you use this. Nothing else leaves your phone.'),
          h('li', {}, 'On the free tier, Google may use what you send to improve its products.'),
          h('li', {}, 'Your key is saved in this browser, unencrypted. Anyone who can use this phone profile or browser could read it. Use a key you can delete, and never reuse an important one.'),
          h('li', {}, 'The key is never included in backup files.')
        )
      ),
      h('label', { class: 'f' }, h('span', {}, 'API key (free from Google AI Studio)'), keyInput),
      h('label', { class: 'f' }, h('span', {}, `Model (default ${DEFAULT_MODEL})`), modelInput),
      h(
        'button',
        {
          class: 'btn primary wide',
          onclick: () => {
            const key = keyInput.value.trim() || cfg.key;
            if (!key) return toast('Paste a key first');
            saveGeminiConfig({ key, model: modelInput.value });
            toast('Saved on this device');
            renderMore(root, actions);
          },
        },
        'Save'
      ),
      cfg.key &&
        h(
          'button',
          {
            class: 'btn danger wide',
            onclick: () => {
              clearGeminiKey();
              toast('Key removed');
              renderMore(root, actions);
            },
          },
          'Remove key from this device'
        )
    ),
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
