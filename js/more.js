// more.js
// The More screen: your data (backup, restore, storage protection), appearance, rest timer,
// the optional Gemini key, and the privacy note.

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { getState, getActivePlan, setSetting, importBackup, looksLikeBackup, isStoragePersisted, dataSizeKb } from './store.js';
import { applyTheme } from './theme.js';
import { getGeminiConfig, saveGeminiConfig, clearGeminiKey, DEFAULT_MODEL } from './gemini.js';
import { getClaudeConfig, saveClaudeConfig, clearClaudeKey, DEFAULT_CLAUDE_MODEL } from './claude.js';
import { activeAI } from './aiassist.js';
import { validatePlan } from './parser.js';
import { todayStr } from './dates.js';
import { openBackupSheet } from './backupui.js';
import { runningVersion, forceUpdate } from './update.js';
import { canPromptInstall, promptInstall, isInstalledApp } from './install.js';
import { isNative, appVersion } from './platform.js';
import { burnFactor } from './burn.js';
import { describeBackupAge } from './safety.js';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
  const installed = isInstalledApp(); // true in the Android app and for an installed web app
  const inApp = isNative();
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
    row('Protected from auto clean up', inApp || persisted === true ? 'Yes' : persisted === false ? 'Not guaranteed' : 'Unknown', inApp || persisted === true ? 'good-text' : ''),
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
        h('li', {}, 'On the OLD phone: tap "Back up now" and send the file to yourself, for example through Drive, email or WhatsApp.'),
        h('li', {}, 'On the NEW phone: open the same TickFit link and install it.'),
        h('li', {}, 'Open this More screen, tap "Restore from a backup file" and pick the file.'),
        h('li', {}, 'Check your plans and history, then you are done. Your Gemini key (if you set one) is never in the file, so add it again.')
      )
    )
  );

  // ----- appearance: the look (Pulse or Bento) and the theme -----
  const style = settings.style === 'bento' ? 'bento' : 'pulse';
  const naturalTheme = (st) => (st === 'bento' ? 'light' : 'dark');
  const currentTheme = settings.theme || naturalTheme(style);
  const styleButtons = [
    ['pulse', 'Pulse', 'Dark, bold, orange'],
    ['bento', 'Bento', 'Bright blocks, thick lines'],
  ].map(([id, name, about]) =>
    h(
      'button',
      {
        type: 'button',
        class: `style-opt style-${id}`,
        'aria-pressed': String(style === id),
        onclick: () => {
          if (id === style) return;
          setSetting('style', id);
          // Each look comes with its own natural theme, unless the person follows the phone
          if (currentTheme !== 'auto') setSetting('theme', naturalTheme(id));
          applyTheme(getState().settings);
          again();
        },
      },
      h('span', { class: 'style-swatch', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
      h('b', {}, name),
      h('small', {}, about)
    )
  );
  const themeButtons = ['dark', 'light', 'auto'].map((t) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(currentTheme === t),
        onclick: () => {
          setSetting('theme', t);
          applyTheme(getState().settings);
          again();
        },
      },
      { dark: 'Dark', light: 'Light', auto: 'Match phone' }[t]
    )
  );

  // ----- get the app (only shown in a browser tab, not once it is installed) -----
  function getAppCard() {
    if (isInstalledApp()) return null;
    const install = canPromptInstall()
      ? h('button', { class: 'btn primary wide', type: 'button', onclick: async () => ((await promptInstall()) ? toast('Installing TickFit…') : again()) }, icon('upload', 20), 'Install TickFit on this device')
      : null;
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Get the app'),
      h('p', { class: 'hint' }, 'TickFit works as an app too: its own icon, full screen, and it works offline. Your data is the same as on the website.'),
      install,
      h('a', { class: 'btn wide', href: 'https://github.com/PredatorWoah/TickFit/releases/latest', target: '_blank', rel: 'noopener' }, 'Android app (APK download)'),
      h('p', { class: 'hint' }, 'iPhone: tap Share, then Add to Home Screen. Android APK: open the downloaded file and allow "install unknown apps" for your browser when asked.')
    );
  }

  // ----- app version (the deploy stamp on the running code) -----
  const versionRow = h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Running version'), h('span', { class: 'kv-value' }, runningVersion()));

  // ----- AI helpers (optional): Claude and Gemini, each with the person's own key -----
  /** One provider's key and model, with Save and Remove. */
  const keyBlock = ({ name, cfg, save, clear, defaultModel, keyLabel, notes }) => {
    const keyInput = h('input', { class: 'text-input', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: cfg.key ? 'Key saved (hidden)' : `Paste your ${name} API key`, 'aria-label': `${name} API key` });
    const modelInput = h('input', { class: 'text-input', type: 'text', autocomplete: 'off', spellcheck: false, value: cfg.model, 'aria-label': `${name} model name` });
    return h(
      'details',
      { class: 'ai-block', open: !!cfg.key },
      h('summary', {}, h('b', {}, name), h('span', { class: 'pill' }, cfg.key ? 'Key saved' : 'Not set up')),
      h('ul', { class: 'ai-notes' }, notes.map((n) => h('li', {}, n))),
      h('label', { class: 'f' }, h('span', {}, keyLabel), keyInput),
      h('label', { class: 'f' }, h('span', {}, `Model (default ${defaultModel})`), modelInput),
      h(
        'button',
        {
          class: 'btn primary wide',
          type: 'button',
          onclick: () => {
            const key = keyInput.value.trim() || cfg.key;
            if (!key) return toast('Paste a key first');
            save({ key, model: modelInput.value });
            toast(`${name} key saved on this device`);
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
              clear();
              toast('Key removed');
              again();
            },
          },
          'Remove key from this device'
        )
    );
  };
  const claudeCfg = getClaudeConfig();
  const geminiCfg = getGeminiConfig();
  const ai = activeAI();
  const bothKeys = !!(claudeCfg.key && geminiCfg.key);

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
    ),
    plan && h('button', { class: 'btn wide lib-open', type: 'button', onclick: () => actions.show('library') }, icon('library', 18), 'Exercise and meal library')
  );

  root.append(
    h('h1', { class: 'page-title' }, 'More'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Look'),
      h('div', { class: 'style-pick', role: 'group', 'aria-label': 'Look' }, styleButtons),
      h('h2', { class: 'sub-h' }, 'Theme'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, themeButtons)
    ),
    planCard,
    dataCard,
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Calories burnt: fine tune'),
      h('p', { class: 'hint' }, 'TickFit guesses how many calories your workouts burn. If your watch or the gym machine usually shows a different number, move all of TickFit\'s guesses up or down to match it.'),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': 'Make calorie burn estimates lower or higher' },
        [
          [80, '−20%'],
          [90, '−10%'],
          [100, 'As is'],
          [110, '+10%'],
          [120, '+20%'],
        ].map(([pct, label]) =>
          h('button', { type: 'button', 'aria-pressed': String(Math.round(burnFactor(settings) * 100) === pct), onclick: () => { setSetting('burnCalibration', pct); again(); } }, label)
        )
      ),
      h(
        'p',
        { class: 'hint tight' },
        (() => {
          const pct = Math.round(burnFactor(settings) * 100);
          const ex = Math.round(300 * burnFactor(settings));
          return pct === 100 ? 'Now: guesses shown as they are. Example: a 300 kcal workout shows 300 kcal.' : `Now: guesses ${pct > 100 ? 'raised' : 'lowered'} by ${Math.abs(pct - 100)}%. Example: a 300 kcal workout shows ${ex} kcal.`;
        })()
      ),
      h('p', { class: 'hint tight' }, 'Only affects estimates. Calories you type in yourself never change. To fix one day, use the Progress tab.')
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'After a workout'),
      h(
        'label',
        { class: 'check-line' },
        h('input', { type: 'checkbox', checked: settings.askBackupAfterWorkout !== false, onchange: (e) => setSetting('askBackupAfterWorkout', e.target.checked) }),
        'Ask me to back up my progress'
      )
    ),
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
    getAppCard() || '',
    isNative()
      ? h(
          'section',
          { class: 'card' },
          h('h2', {}, 'App version'),
          h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'TickFit for Android'), h('span', { class: 'kv-value' }, appVersion())),
          h('p', { class: 'hint' }, 'This app has everything inside it, so it works with no internet. New versions come as a new download on the Releases page. Your data stays on this phone when you update (install the new file over the old one).'),
          h('a', { class: 'btn wide', href: 'https://github.com/PredatorWoah/TickFit/releases/latest', target: '_blank', rel: 'noopener' }, 'See the latest version')
        )
      : h(
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
      h('h2', {}, 'AI helpers (optional)'),
      h('p', { class: 'hint' }, 'With your own Claude or Gemini key, TickFit can turn a document into a plan in one tap and suggest exercises and meals for a day. You do not need this: the "Copy AI prompt" button works with any chatbot.'),
      h(
        'div',
        { class: 'msg warn' },
        h('b', {}, 'Read this first'),
        h(
          'ul',
          {},
          h('li', {}, 'Only what you ask about is sent: the document you convert, or the day\'s name, focus and chosen exercise or meal names (plus your goal, experience, equipment and diet if you used the plan builder). Never your history, weights or notes.'),
          h('li', {}, 'Your key is saved in this browser, unencrypted. Anyone who can use this phone profile or browser could read it. Use a key you can delete, and never reuse an important one.'),
          h('li', {}, 'Keys are never included in backup files.')
        )
      ),
      bothKeys &&
        h(
          'div',
          { class: 'seg', role: 'group', 'aria-label': 'Which AI to use' },
          ['claude', 'gemini'].map((id) =>
            h('button', { type: 'button', 'aria-pressed': String(ai && ai.id === id), onclick: () => { setSetting('aiProvider', id); again(); } }, id === 'claude' ? 'Use Claude' : 'Use Gemini')
          )
        ),
      ai && !bothKeys && h('p', { class: 'hint' }, `Using ${ai.name}.`),
      keyBlock({
        name: 'Claude',
        cfg: claudeCfg,
        save: saveClaudeConfig,
        clear: clearClaudeKey,
        defaultModel: DEFAULT_CLAUDE_MODEL,
        keyLabel: 'API key (from the Anthropic Console)',
        notes: ['By Anthropic. Needs an Anthropic Console account with credit: each use costs a little on your account.', 'What you send goes to Anthropic under their API terms.'],
      }),
      keyBlock({
        name: 'Gemini',
        cfg: geminiCfg,
        save: saveGeminiConfig,
        clear: clearGeminiKey,
        defaultModel: DEFAULT_MODEL,
        keyLabel: 'API key (free from Google AI Studio)',
        notes: ['By Google. Has a free tier.', 'On the free tier, Google may use what you send to improve its products.'],
      })
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint' }, 'TickFit has no accounts, no servers and no tracking. Everything you enter stays in this browser on this device. Nothing is sent anywhere, except by the optional food lookup and AI helpers above, and only when you use them.')
    )
  );
}
