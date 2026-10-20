// updateui.js
// The "New version" sheet (Android app), loaded on demand: what changed, then one button that downloads the
// update, checks it and opens Android's installer. The first time, Android asks once to allow TickFit to
// install updates; when you come back from that switch, it carries on by itself.

import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { appVersion } from './platform.js';
import { downloadUpdate, installUpdate, isDownloaded } from './updater.js';

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

export function openUpdateSheet(rel) {
  let onBack = null;
  openSheet({
    title: `TickFit ${rel.version} is ready`,
    onClose: () => onBack && document.removeEventListener('visibilitychange', onBack),
    build(body) {
      const status = h('p', { class: 'hint', role: 'status' });
      const fill = h('div', { class: 'bar-fill' });
      const bar = h('div', { class: 'bar upd-bar', hidden: true }, fill);
      let downloaded = isDownloaded(rel); // e.g. before Android restarted the app to allow installing
      const go = h('button', { class: 'btn primary wide big', type: 'button' }, downloaded ? 'Install' : `Download and install${rel.size ? ` (${mb(rel.size)})` : ''}`);

      async function install() {
        go.disabled = true;
        try {
          const r = await installUpdate();
          if (r.needsPermission) {
            status.textContent = 'Android asks once to let TickFit install its own updates. Turn on "Allow from this source", then come back here: TickFit carries on by itself.';
            go.textContent = 'Install';
            go.disabled = false;
            if (!onBack) {
              onBack = () => document.visibilityState === 'visible' && install();
              document.addEventListener('visibilitychange', onBack);
            }
            return;
          }
          if (onBack) document.removeEventListener('visibilitychange', onBack);
          onBack = null;
          status.textContent = "Android's installer is open: tap Update. Your plans, progress and photos stay as they are.";
          go.textContent = 'Open the installer again';
          go.disabled = false;
        } catch (e) {
          downloaded = isDownloaded(rel); // false again if the file had gone
          status.textContent = e.message || String(e);
          if (!downloaded) go.textContent = `Download and install${rel.size ? ` (${mb(rel.size)})` : ''}`;
          go.disabled = false;
        }
      }

      go.onclick = async () => {
        if (downloaded) return install();
        go.disabled = true;
        bar.hidden = false;
        status.textContent = 'Downloading...';
        try {
          await downloadUpdate(rel, (done, total) => {
            const t = total > 0 ? total : rel.size;
            if (t) fill.style.width = `${Math.min(100, (done / t) * 100)}%`;
            status.textContent = `Downloading... ${mb(done)}${t ? ` of ${mb(t)}` : ''}`;
          });
          downloaded = true;
          fill.style.width = '100%';
          status.textContent = 'Downloaded and checked.';
          await install();
        } catch (e) {
          status.textContent = e.message || String(e);
          go.disabled = false;
          bar.hidden = true;
        }
      };

      body.append(
        ...[
          h('p', {}, `You have ${appVersion() || 'an older version'}. The update installs over this app, so everything you logged stays.`),
          rel.notes.length ? h('ul', { class: 'upd-notes' }, rel.notes.map((n) => h('li', {}, n))) : null,
          bar,
          status,
          go,
          h('p', { class: 'hint tight' }, 'It comes from TickFit\'s releases on GitHub. Before installing, the app checks the file\'s fingerprint, and Android checks it was made by the same people as this app.'),
        ].filter(Boolean) // (append() would print a null as the word "null")
      );
    },
  });
}
