// backupui.js
// One "Back up" sheet used everywhere (More, the daily reminder, after a workout).
// You can rename the file, then share it, download it, or (desktop Chrome/Edge) save over an old one.

import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './dom.js';
import { openSheet } from './sheet.js';
import { isNative } from './platform.js';
import { canShareFiles, saveBackupFile, shareBackupFile, canOverwrite, saveOverExisting, defaultBackupName, prepareBackup } from './backup.js';
import { photoStats } from './photos.js';
import { getState, setSetting, markBackedUp } from './store.js';

/**
 * @param onDone  called after a backup was made, so the screen can refresh
 * @param opts    { title, intro, notNow }  a different heading and intro text, and a "Not now" button
 */
export function openBackupSheet(onDone = () => {}, opts = {}) {
  openSheet({
    title: opts.title || 'Back up your data',
    build(body, close) {
      const input = h('input', { type: 'text', value: defaultBackupName(), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Backup file name' });
      const finish = (msg) => {
        toast(msg);
        close();
        onDone();
      };
      // Android cannot always tell whether the file was saved (see shareNative in backup.js), so ask
      const askIfSaved = () =>
        body.replaceChildren(
          h('p', { class: 'hint' }, 'Did the backup get saved? Some apps (like Drive) do not tell TickFit when they finish.'),
          h('button', { class: 'btn primary wide', type: 'button', onclick: () => { markBackedUp(); finish('Backup saved'); } }, 'Yes, it is saved'),
          h('button', { class: 'btn wide', type: 'button', onclick: close }, 'No, not this time')
        );
      // The file is made as soon as the sheet opens (and again when the photo choice changes), so it is ready
      // the moment a button is tapped: phones only allow the share sheet straight after a tap.
      const withPhotos = () => getState().settings.backupPhotos !== false;
      let ready = prepareBackup({ photos: withPhotos() });
      const photoChoice = h('label', { class: 'check-line', hidden: true }, h('input', { type: 'checkbox', checked: withPhotos(), onchange: (e) => { setSetting('backupPhotos', e.target.checked); ready = prepareBackup({ photos: e.target.checked }); } }), h('span', {}));
      photoStats()
        .then((st) => {
          if (!st.count) return;
          photoChoice.hidden = false;
          photoChoice.lastChild.textContent = `Include my ${st.count} progress photo${st.count === 1 ? '' : 's'} (about ${st.mb < 0.1 ? '0.1' : st.mb} MB)`;
        })
        .catch(() => {});
      const run = (fn, msg) => async () => {
        try {
          const result = await fn(input.value, await ready);
          if (result === 'unsure') askIfSaved();
          else if (result !== false) finish(msg);
        } catch {
          toast('That did not work. Try another option.');
        }
      };

      body.append(
        ...[
          h('p', { class: 'hint' }, opts.intro || 'A backup is one file with all your plans and progress (and your photos, if you tick that). Keep it somewhere safe, like Drive or Files.'),
          h('label', { class: 'field stack' }, h('span', {}, 'File name'), h('span', { class: 'name-row' }, input, h('span', { class: 'ext' }, '.json'))),
          photoChoice,
          canShareFiles() && h('button', { class: 'btn primary wide', type: 'button', onclick: run(shareBackupFile, 'Backup shared') }, icon('upload', 20), isNative() ? 'Save or share backup' : 'Share or save to Drive / Files'),
          !isNative() && h('button', { class: 'btn wide' + (canShareFiles() ? '' : ' primary'), type: 'button', onclick: run(saveBackupFile, 'Backup saved to Downloads') }, 'Download file'),
          canOverwrite() && h('button', { class: 'btn wide', type: 'button', onclick: run(saveOverExisting, 'Backup saved') }, 'Save over an existing file…'),
          opts.notNow && h('button', { class: 'btn ghost wide', type: 'button', onclick: close }, 'Not now'),
          h('p', { class: 'hint' }, isNative() ? 'Pick Drive, Files or any app from the list. Saving it to Google Drive keeps it safe if you lose your phone.' : canOverwrite() ? 'On this device "Save over" can replace an older backup. Choosing the same file name asks before replacing it.' : 'Phones cannot replace an old file, so a repeated name becomes "name (1)". Rename above to keep things tidy, or use Share and pick the same Drive file to replace it.'),
        ].filter(Boolean)
      );
    },
  });
}
