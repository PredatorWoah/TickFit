// backupui.js
// One "Back up" sheet used everywhere (More, the daily reminder, after a workout).
// You can rename the file, then share it, download it, or (desktop Chrome/Edge) save over an old one.

import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './dom.js';
import { openSheet } from './sheet.js';
import { isNative } from './platform.js';
import { canShareFiles, saveBackupFile, shareBackupFile, canOverwrite, saveOverExisting, defaultBackupName } from './backup.js';

/** @param onDone  called after a backup was made, so the screen can refresh */
export function openBackupSheet(onDone = () => {}) {
  openSheet({
    title: 'Back up your data',
    build(body, close) {
      const input = h('input', { type: 'text', value: defaultBackupName(), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Backup file name' });
      const finish = (msg) => {
        toast(msg);
        close();
        onDone();
      };
      const run = (fn, msg) => async () => {
        try {
          if ((await fn(input.value)) !== false) finish(msg);
        } catch {
          toast('That did not work. Try another option.');
        }
      };

      body.append(
        ...[
          h('p', { class: 'hint' }, 'A backup is one small file with all your plans and progress. Keep it somewhere safe, like Drive or Files.'),
          h('label', { class: 'field stack' }, h('span', {}, 'File name'), h('span', { class: 'name-row' }, input, h('span', { class: 'ext' }, '.json'))),
          canShareFiles() && h('button', { class: 'btn primary wide', type: 'button', onclick: run(shareBackupFile, 'Backup shared') }, icon('upload', 20), isNative() ? 'Save or share backup' : 'Share or save to Drive / Files'),
          !isNative() && h('button', { class: 'btn wide' + (canShareFiles() ? '' : ' primary'), type: 'button', onclick: run((n) => saveBackupFile(n), 'Backup saved to Downloads') }, 'Download file'),
          canOverwrite() && h('button', { class: 'btn wide', type: 'button', onclick: run(saveOverExisting, 'Backup saved') }, 'Save over an existing file…'),
          h('p', { class: 'hint' }, isNative() ? 'Pick Drive, Files or any app from the list. Saving it to Google Drive keeps it safe if you lose your phone.' : canOverwrite() ? 'On this device "Save over" can replace an older backup. Choosing the same file name asks before replacing it.' : 'Phones cannot replace an old file, so a repeated name becomes "name (1)". Rename above to keep things tidy, or use Share and pick the same Drive file to replace it.'),
        ].filter(Boolean)
      );
    },
  });
}
