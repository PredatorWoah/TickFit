// aisettings.js
// The "AI helpers" card in More. Everything AI is optional: one tick switches it all on or off, and the app
// works the same without it. With it on, the person picks a provider (OpenRouter, OpenAI, Claude or Gemini),
// follows the steps (with links) to get a key, pastes it, and picks a model from the list the provider sends
// back: OpenRouter marks its free models, and the list can be filtered by free, by maker and by name.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { getState, setSetting } from './store.js';
import { PROVIDERS, PROVIDER_IDS, getConfig, saveConfig, clearKey, hasKey, aiEnabled, activeProvider, listModels, filterModels, pickModel } from './llm.js';

const modelCache = {}; // provider id -> [{ id, name, free, family }] fetched this session

/** @param again  redraws the More screen */
export function aiCard(again) {
  const settings = getState().settings;
  const on = aiEnabled(settings) || (settings.aiOn === true && !PROVIDER_IDS.some(hasKey));
  const active = activeProvider(settings);
  const shown = PROVIDERS[settings.aiShow] ? settings.aiShow : (active && active.id) || 'openrouter';

  const master = h(
    'label',
    { class: 'check-line ai-master' },
    h('input', { type: 'checkbox', checked: on, onchange: (e) => (setSetting('aiOn', e.target.checked), again()) }),
    h('b', {}, 'Use AI helpers')
  );
  const card = h('section', { class: 'card ai-card' }, h('h2', {}, 'AI helpers (optional)'), master);
  if (!on) {
    card.append(h('p', { class: 'hint' }, 'Off. TickFit works fully without AI. Tick the box to add an assistant that can summarise your progress, review your goals and, with your OK each time, change exercises, meals, calories and workout time. You bring your own key; some providers have free models.'));
    return card;
  }

  card.append(
    h('label', { class: 'check-line' }, h('input', { type: 'checkbox', checked: settings.aiHistory !== false, onchange: (e) => setSetting('aiHistory', e.target.checked) }), 'Let the assistant see my history (ticks, sets, weight, steps), so it can review my progress'),
    h(
      'div',
      { class: 'msg warn' },
      h('b', {}, 'Good to know'),
      h(
        'ul',
        {},
        h('li', {}, 'What you ask, your plan for the coming week and (if ticked above) your last 2 weeks are sent to the provider you pick. Nothing goes anywhere until you ask something.'),
        h('li', {}, 'The AI only suggests. Every change waits for you to tap Apply, and Undo puts it back.'),
        h('li', {}, 'Your key is saved on this device, unencrypted, and never in backups. Use a key you can delete.'),
        h('li', {}, 'If your usage limit runs out, TickFit waits and asks again by itself when it resets.')
      )
    )
  );

  // which provider to show and use
  card.append(
    h('p', { class: 'hint tight' }, 'Provider'),
    h(
      'div',
      { class: 'seg ai-providers', role: 'group', 'aria-label': 'AI provider' },
      PROVIDER_IDS.map((id) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(id === shown),
            onclick: () => {
              setSetting('aiShow', id);
              if (hasKey(id)) setSetting('aiProvider', id);
              again();
            },
          },
          PROVIDERS[id].name.replace(/ \(.*\)$/, ''),
          hasKey(id) ? h('span', { class: 'ai-dot', 'aria-label': 'key saved' }) : null
        )
      )
    )
  );
  // 2.1 to 2.3 offered OpenCode Zen, now OpenRouter: say so to anyone who had picked it
  if ((settings.aiProvider === 'opencode' || settings.aiShow === 'opencode') && !hasKey('openrouter')) card.append(h('p', { class: 'msg' }, 'OpenCode Zen has been replaced by OpenRouter: one key for hundreds of models, many of them free. Its old key was removed from this phone; add an OpenRouter key below.'));
  card.append(providerBlock(shown, again));
  if (active) card.append(h('p', { class: 'hint ai-inuse' }, inUseText(active)));
  return card;
}

function providerBlock(id, again) {
  const p = PROVIDERS[id];
  const cfg = getConfig(id);
  const keyInput = h('input', { class: 'text-input', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: cfg.key ? 'Key saved (hidden). Paste a new one to replace it' : `Paste your ${p.name} API key`, 'aria-label': `${p.name} API key` });
  const block = h(
    'div',
    { class: 'ai-provider' },
    h('h3', { class: 'ai-p-name' }, p.name, h('span', { class: 'pill' }, cfg.key ? 'Key saved' : 'No key yet')),
    h('p', { class: 'hint tight' }, p.cost),
    h('details', { class: 'fold', open: !cfg.key }, h('summary', {}, 'How to get a key'), h('ol', { class: 'steps' }, p.steps.map((s) => h('li', {}, s))), h('p', { class: 'ai-links' }, h('a', { href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('chevron-right', 14), 'Get a key'), h('a', { href: p.docsUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('chevron-right', 14), 'Docs'))),
    h('label', { class: 'f' }, h('span', {}, 'API key'), keyInput)
  );
  const modelHost = h('div', { class: 'ai-models' });
  block.append(
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: async (e) => {
            const key = keyInput.value.trim() || cfg.key;
            if (!key) return toast('Paste a key first');
            saveConfig(id, { key, model: getConfig(id).model });
            setSetting('aiProvider', id);
            setSetting('aiShow', id);
            e.currentTarget.disabled = true;
            delete modelCache[id];
            toast(`${p.name} key saved on this device`);
            again(); // the model list loads in the redrawn card
          },
        },
        'Save key'
      ),
      cfg.key && h('button', { class: 'btn danger', type: 'button', onclick: () => (clearKey(id), delete modelCache[id], toast('Key removed'), again()) }, 'Remove key')
    ),
    modelHost
  );
  if (cfg.key) drawModels(id, modelHost, again);
  return block;
}

const inUseText = (a) => [h('b', {}, 'In use: '), `${a.name}, ${a.model ? `model ${a.model}` : 'a free model (picked when the list loads)'}.`];

/** The model dropdown: fetched from the provider, with filters. */
async function drawModels(id, host, again) {
  const cfg = getConfig(id);
  const status = h('p', { class: 'hint tight', role: 'status' }, 'Loading the models this key can use...');
  host.replaceChildren(status);
  let models = modelCache[id];
  if (!models) {
    try {
      models = modelCache[id] = await listModels(id);
    } catch (e) {
      status.textContent = `Could not load the model list (${e.message}). You can still type a model name.`;
      models = [];
    }
  }
  // no model chosen yet (a new OpenRouter key): start on a good free one
  if (!getConfig(id).model && pickModel(models)) {
    saveConfig(id, { key: getConfig(id).key, model: pickModel(models) });
    refreshInUse(host);
  }
  let free = id === 'openrouter' && models.some((m) => m.free);
  let family = '';
  let text = '';
  const select = h('select', { class: 'text-input ai-model-select', 'aria-label': 'Model' });
  const count = h('span', { class: 'ai-count' });
  const typed = h('input', { class: 'text-input', type: 'text', autocomplete: 'off', spellcheck: false, value: cfg.model, 'aria-label': 'Model name' });
  const freeBtn = h('button', { type: 'button', class: 'pick-chip' });
  const famRow = h('div', { class: 'pick-chips ai-fams', role: 'group', 'aria-label': 'Who makes the model' });
  const search = h('input', { class: 'pick-search', type: 'search', placeholder: 'Search models', 'aria-label': 'Search models', oninput: (e) => ((text = e.target.value), fill()) });

  function fill() {
    freeBtn.setAttribute('aria-pressed', String(free));
    freeBtn.textContent = free ? 'Free only' : 'All prices';
    // only the makers that have models under the other filters (OpenRouter has dozens)
    const families = [...new Set(filterModels(models, { free, text }).map((m) => m.family))].sort();
    if (family && !families.includes(family)) family = '';
    famRow.hidden = families.length < 2;
    famRow.replaceChildren(...['', ...families].map((f) => h('button', { type: 'button', class: 'pick-chip', 'aria-pressed': String(f === family), onclick: () => ((family = f), fill()) }, f || 'All')));
    const list = filterModels(models, { free, family, text });
    const current = getConfig(id).model;
    const options = list.map((m) => h('option', { value: m.id, selected: m.id === current }, `${m.free ? 'Free · ' : ''}${m.id}${m.name && m.name !== m.id ? ` (${m.name})` : ''}`));
    if (current && !list.some((m) => m.id === current)) options.unshift(h('option', { value: current, selected: true }, `${current} (in use)`));
    select.replaceChildren(...options);
    count.textContent = `${list.length} of ${models.length} models`;
  }
  freeBtn.onclick = () => ((free = !free), fill());
  select.onchange = () => {
    saveConfig(id, { key: getConfig(id).key, model: select.value });
    typed.value = select.value;
    refreshInUse(host);
    toast(`Using ${select.value}`);
  };

  const parts = [];
  if (models.length) {
    status.textContent = '';
    parts.push(
      h('div', { class: 'ai-filter-row' }, id === 'openrouter' && models.some((m) => m.free) ? freeBtn : null, count),
      famRow,
      search,
      h('label', { class: 'f' }, h('span', {}, 'Model'), select)
    );
    fill();
  }
  parts.push(
    h(
      'details',
      { class: 'fold' },
      h('summary', {}, 'Type a model name instead'),
      typed,
      h('button', { class: 'btn small', type: 'button', onclick: () => { saveConfig(id, { key: getConfig(id).key, model: typed.value }); toast('Model saved'); again(); } }, 'Use this model')
    ),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => (delete modelCache[id], drawModels(id, host, again)) }, 'Refresh the list')
  );
  host.replaceChildren(status, ...parts.filter(Boolean));
}

/** Update the "In use" line under the card after the model changes. */
function refreshInUse(host) {
  const line = host.closest('.ai-card')?.querySelector('.ai-inuse');
  const now = activeProvider();
  if (line && now) line.replaceChildren(...inUseText(now));
}
