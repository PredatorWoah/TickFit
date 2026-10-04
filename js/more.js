// more.js
// The More screen: your data (backup, restore, storage protection), appearance, rest timer,
// the optional Gemini key, and the privacy note.

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { getState, getActivePlan, setSetting, importBackup, looksLikeBackup, isStoragePersisted, dataSizeKb } from './store.js';
import { applyTheme } from './theme.js';
import { getGeminiConfig, saveGeminiConfig, clearGeminiKey, DEFAULT_MODEL } from './gemini.js';
import { validatePlan } from './parser.js';
import { todayStr } from './dates.js';
import { openBackupSheet } from './backupui.js';
import { runningVersion, forceUpdate } from './update.js';
import { describeBackupAge } from './safety.js';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

/** @param actions { refresh() } redraw the app after a restore */
export function renderMore(root, actions) {
  clear(root);
  const settings = getState().settings;
  const again = () => renderMore(root, actions);

  // ----- your data -----
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

  const persisted = isStoragePersisted();
  const installed = isInstalled();
  const row = (label, value, tone) => h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, label), h('span', { class: 'kv-value' + (tone ? ' ' + tone : '') }, value));

  const backupButtons = [
    h('button', { class: 'btn primary wide', type: 'button', onclick: () => openBackupSheet(again) }, icon('upload', 20), 'Back up now'),
    h('button', { class: 'btn wide', type: 'button', onclick: () => fileInput.click() }, 'Restore from a backup file'),
    fileInput,
  ];

  const dataCard = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Your data'),
    h('p', { class: 'hint' }, 'Everything lives on this phone only. Nothing is sent anywhere, which also means nobody else can recover it for you. A backup file is your safety net.'),
    row('Last backup', describeBackupAge(settings.lastBackup, todayStr()), settings.lastBackup ? '' : 'warn-text'),
    row('Saved on this phone', `${dataSizeKb()} KB`),
    row('Protected from auto clean up', persisted === true ? 'Yes' : persisted === false ? 'Not guaranteed' : 'Unknown', persisted === true ? 'good-text' : ''),
    row('Installed as an app', installed ? 'Yes' : 'No', installed ? 'good-text' : ''),
    !installed && isIos() && h('div', { class: 'msg warn' }, h('b', {}, 'Install it on your iPhone. '), 'Safari can erase a website\'s data after about a week of not opening it. Tap Share, then "Add to Home Screen", and open TickFit from there. That removes the risk.'),
    !installed && !isIos() && h('p', { class: 'hint' }, 'Tip: install TickFit from your browser menu ("Install app" or "Add to Home screen"). Installed apps are far less likely to have their data cleared.'),
    ...backupButtons,
    h(
      'details',
      { class: 'fold' },
      h('summary', {}, 'Moving to a new phone'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'On the OLD phone: tap "Share backup" (or "Save backup file") and send the file to yourself, for example through email, Drive or WhatsApp.'),
        h('li', {}, 'On the NEW phone: open the same TickFit link and install it.'),
        h('li', {}, 'Open this More screen, tap "Restore from a backup file" and pick the file.'),
        h('li', {}, 'Check your plans and history, then you are done. Your Gemini key (if you set one) is never in the file, so add it again.')
      )
    )
  );

  // ----- appearance -----
  const themeButtons = ['dark', 'light', 'auto'].map((t) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String((settings.theme || 'dark') === t),
        onclick: () => {
          setSetting('theme', t);
          applyTheme(t);
          again();
        },
      },
      { dark: 'Dark', light: 'Light', auto: 'Match phone' }[t]
    )
  );

  // ----- app version (the deploy stamp on the running code) -----
  const versionRow = h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Running version'), h('span', { class: 'kv-value' }, runningVersion()));

  // ----- Gemini (optional) -----
  const cfg = getGeminiConfig();
  const keyInput = h('input', { class: 'text-input', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: cfg.key ? 'Key saved (hidden)' : 'Paste your Gemini API key', 'aria-label': 'Gemini API key' });
  const modelInput = h('input', { class: 'text-input', type: 'text', autocomplete: 'off', spellcheck: false, value: cfg.model, 'aria-label': 'Gemini model name' });

  // ----- my plan: the one obvious place to switch, edit or add plans -----
  const plan = getActivePlan();
  const planCard = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'My plan'),
    h('div', { class: 'plan-name' }, plan ? plan.name : 'No plan yet'),
    plan && h('p', { class: 'row-meta' }, `${getState().plans.length} plan${getState().plans.length === 1 ? '' : 's'} saved on this phone`),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => actions.show('plans') }, 'Switch plans'),
      plan && h('button', { class: 'btn', type: 'button', onclick: () => actions.show('edit', { planId: plan.id }) }, 'Edit this plan'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => actions.show('new') }, icon('plus', 18), 'New plan')
    )
  );

  root.append(
    h('h1', { class: 'page-title' }, 'More'),
    planCard,
    dataCard,
    h('section', { class: 'card' }, h('h2', {}, 'Appearance'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, themeButtons)),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Rest timer'),
      h(
        'label',
        { class: 'check-line' },
        h('input', { type: 'checkbox', checked: settings.autoRest !== false, onchange: (e) => setSetting('autoRest', e.target.checked) }),
        'Start it automatically after each set'
      ),
      h(
        'label',
        { class: 'check-line' },
        h('input', { type: 'checkbox', checked: settings.sound !== false, onchange: (e) => setSetting('sound', e.target.checked) }),
        'Beep and vibrate when rest ends'
      )
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'App version'),
      h('p', { class: 'hint' }, 'TickFit updates itself when you are online. If a new feature does not show up after reloading, tap this. It reloads the newest files. Your plans and progress are not touched.'),
      versionRow,
      h('button', { class: 'btn wide', type: 'button', onclick: () => forceUpdate() }, 'Update TickFit now')
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Food lookup (optional)'),
      h('p', { class: 'hint' }, 'In the meal editor, "Estimate from foods" works offline for common foods. Turn this on to also look up unfamiliar foods online, mostly packaged products, using the free Open Food Facts database.'),
      h(
        'label',
        { class: 'check-line' },
        h('input', { type: 'checkbox', checked: !!settings.foodLookup, onchange: (e) => setSetting('foodLookup', e.target.checked) }),
        'Look up foods online when I tap Estimate'
      ),
      h('p', { class: 'hint' }, 'What is sent: only the food name, such as "paneer tikka", to openfoodfacts.org. No amounts, plans, progress or personal details. Their servers can see your IP address, like any website. Off by default.')
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
          type: 'button',
          onclick: () => {
            const key = keyInput.value.trim() || cfg.key;
            if (!key) return toast('Paste a key first');
            saveGeminiConfig({ key, model: modelInput.value });
            toast('Saved on this device');
            again();
          },
        },
        'Save'
      ),
      cfg.key &&
        h(
          'button',
          {
            class: 'btn danger wide',
            type: 'button',
            onclick: () => {
              clearGeminiKey();
              toast('Key removed');
              again();
            },
          },
          'Remove key from this device'
        )
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint' }, 'TickFit has no accounts, no servers and no tracking. Everything you enter stays in this browser on this device. Nothing is ever sent anywhere.')
    )
  );
}
