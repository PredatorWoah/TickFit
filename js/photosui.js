// photosui.js
// The "Progress photos" card on the Progress screen: take or pick a photo of yourself, then swipe through
// them from the oldest (left) to the newest (right), each with its date along the bottom like a watermark.
// Tap one to change its date, save it (with the date written on it) or delete it; Compare puts the first and
// the latest side by side. The photos themselves live in photos.js, on this device only.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { getState } from './store.js';
import { todayStr, toStr, diffDays, isValidStr } from './dates.js';
import { isNative, nativePlugin } from './platform.js';
import { openGhostCamera, cameraSupported } from './camera.js';
import { listPhotos, addPhoto, deletePhoto, setPhotoDate, withWatermark, binPhoto, unbinPhoto, emptyBin } from './photos.js';

const urls = new Map(); // photo id -> object URL, made once per photo and reused across redraws
// Photos deleted a moment ago sit in a bin (photos.js) while Undo is offered; a bin left from an earlier visit
// (the app was closed before the message went) is emptied when the photos are first shown.
let binChecked = false;

const urlFor = (p) => {
  if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
  return urls.get(p.id);
};
const forget = (id) => {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
};

/** "11 Oct 2026" (day first, as most people reading this write it) */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function photoDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The small second line: body weight logged that day, and how long after the first photo. Pure. */
export function photoNote(photo, first, bodyLog = {}) {
  const parts = [];
  const kg = bodyLog[photo.date];
  if (typeof kg === 'number') parts.push(`${kg} kg`);
  if (first && first.id !== photo.id) {
    const days = diffDays(first.date, photo.date);
    if (days > 0) parts.push(days % 7 === 0 && days >= 14 ? `week ${days / 7}` : `day ${days + 1}`);
  } else if (first) parts.push('start');
  return parts.join(' · ');
}

/** A picked file's own date (when the photo was taken or saved), or today for a fresh camera shot. */
function fileDate(file) {
  const t = file && file.lastModified;
  const d = t ? toStr(new Date(t)) : todayStr();
  return isValidStr(d) && d <= todayStr() ? d : todayStr();
}

async function saveCopy(photo) {
  const blob = await withWatermark(photo, photoDate(photo.date));
  const name = `tickfit-${photo.date}.jpg`;
  if (isNative()) {
    // the app can't download, so hand the picture to the share sheet (Photos, Drive, WhatsApp...)
    const Filesystem = nativePlugin('Filesystem');
    const Share = nativePlugin('Share');
    if (!Filesystem || !Share) throw new Error('Saving is not available');
    const data = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
    await Share.share({ title: 'Progress photo', files: [written.uri], dialogTitle: 'Save your progress photo' }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** One photo with its date along the bottom. */
function slide(photo, first, bodyLog, onOpen) {
  const note = photoNote(photo, first, bodyLog);
  return h(
    'button',
    { class: 'ph-slide', type: 'button', 'aria-label': `Photo from ${photoDate(photo.date)}${note ? ', ' + note : ''}. Open it`, onclick: () => onOpen(photo) },
    h('img', { src: urlFor(photo), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }),
    h('span', { class: 'ph-mark' }, h('b', {}, photoDate(photo.date)), note && h('small', {}, note))
  );
}

/** The card. It fills itself in once the photos are read (that is asynchronous). */
export function photosCard() {
  const card = h('section', { class: 'card ph-card' });
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'user', hidden: true, 'aria-hidden': 'true' });
  const gallery = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-hidden': 'true' });

  const draw = async (scrollTo) => {
    let photos = [];
    let problem = null;
    try {
      if (!binChecked) {
        binChecked = true;
        await emptyBin(10000).catch(() => {});
      }
      photos = await listPhotos();
    } catch (e) {
      problem = e.message;
    }
    const bodyLog = getState().bodyLog || {};
    const first = photos[0];
    const head = h(
      'div',
      { class: 'ph-head' },
      h('div', {}, h('h2', {}, 'Progress photos'), h('p', { class: 'row-meta' }, photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}${photos.length > 1 ? `, ${photoDate(first.date)} to ${photoDate(photos[photos.length - 1].date)}` : ''}` : 'See your change, not just the numbers.')),
      photos.length > 1 && h('button', { class: 'btn small', type: 'button', onclick: () => openCompare(photos, bodyLog) }, icon('compare', 18), 'Compare')
    );
    const add = h(
      'div',
      { class: 'btn-row ph-add' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            // the ghost camera (your last photo faintly on top); the phone's camera app if it can't open
            if (!cameraSupported()) return camera.click();
            const last = photos[photos.length - 1];
            openGhostCamera({
              ghostUrl: last ? urlFor(last) : null,
              onShot: async (blob) => {
                try {
                  const photo = await addPhoto(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), todayStr());
                  toast('Photo saved');
                  draw(photo.id);
                } catch (e) {
                  toast(e.message || 'Could not save that photo');
                }
              },
              onFail: () => {
                toast('Camera not available here, opening your camera app');
                camera.click();
              },
            });
          },
        },
        icon('camera', 20),
        'Take a photo'
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => gallery.click() }, icon('image', 20), 'From gallery')
    );
    card.replaceChildren(head);
    if (problem) card.append(h('p', { class: 'msg warn' }, problem));
    if (!photos.length) {
      card.append(h('p', { class: 'hint' }, 'Take one now, then again every week or two. Same spot, same light, same pose makes the change easy to see.'));
    } else {
      const strip = h('div', { class: 'ph-strip', role: 'list', 'aria-label': 'Progress photos, oldest first. Swipe to see more' }, ...photos.map((p) => h('div', { role: 'listitem', class: 'ph-item', 'data-id': p.id }, slide(p, first, bodyLog, (photo) => openPhoto(photo, photos, bodyLog, draw)))));
      const pos = h('span', { class: 'ph-pos', 'aria-live': 'polite' });
      const step = (dir) => strip.scrollBy({ left: dir * strip.clientWidth * 0.85, behavior: 'smooth' });
      const nav =
        photos.length > 1 &&
        h(
          'div',
          { class: 'ph-nav' },
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Older photo', onclick: () => step(-1) }, icon('back', 18)),
          pos,
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Newer photo', onclick: () => step(1) }, icon('chevron-right', 18))
        );
      const update = () => {
        const items = [...strip.children];
        const mid = strip.scrollLeft + strip.clientWidth / 2;
        let at = 0;
        items.forEach((el, i) => {
          if (el.offsetLeft <= mid) at = i;
        });
        pos.textContent = `${at + 1} of ${items.length}`;
      };
      strip.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
      card.append(...[strip, nav].filter(Boolean));
      // start on the newest (or the one just added / changed)
      requestAnimationFrame(() => {
        const target = (scrollTo && strip.querySelector(`[data-id="${scrollTo}"]`)) || strip.lastElementChild;
        if (target) strip.scrollLeft = target.offsetLeft - (strip.clientWidth - target.clientWidth) / 2;
        update();
      });
    }
    card.append(add, h('p', { class: 'hint tight' }, 'Photos stay on this phone only. They are not in the backup file, so save the ones you want to keep.'), camera, gallery);
  };

  const onPick = (input) => async () => {
    const file = input.files && input.files[0];
    input.value = ''; // so picking the same file again still works
    if (!file) return;
    try {
      const photo = await addPhoto(file, input === camera ? todayStr() : fileDate(file));
      toast('Photo saved');
      draw(photo.id);
    } catch (e) {
      toast(e.message || 'Could not save that photo');
    }
  };
  camera.addEventListener('change', onPick(camera));
  gallery.addEventListener('change', onPick(gallery));

  card.append(h('h2', {}, 'Progress photos'));
  draw();
  return card;
}

function openPhoto(photo, photos, bodyLog, redraw) {
  openSheet({
    title: photoDate(photo.date),
    build(body, close) {
      const dateIn = h('input', { type: 'date', class: 'date-input', value: photo.date, max: todayStr(), 'aria-label': 'Date of this photo' });
      body.append(
        h('div', { class: 'ph-big' }, h('img', { src: urlFor(photo), alt: `Progress photo from ${photoDate(photo.date)}` }), h('span', { class: 'ph-mark' }, h('b', {}, photoDate(photo.date)), h('small', {}, photoNote(photo, photos[0], bodyLog)))),
        h(
          'label',
          { class: 'field' },
          h('span', {}, 'Taken on'),
          dateIn
        ),
        h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: async () => {
                try {
                  await saveCopy(photo);
                  if (!isNative()) toast('Saved with the date on it');
                } catch {
                  toast('Could not save it. Try again.');
                }
              },
            },
            icon('upload', 18),
            'Save a copy'
          ),
          h(
            'button',
            {
              class: 'btn danger',
              type: 'button',
              onclick: async () => {
                // into the bin at once, really deleted only when Undo is no longer offered
                await binPhoto(photo.id).catch(() => {});
                close();
                redraw();
                toast('Photo deleted', {
                  undo: async () => {
                    await unbinPhoto(photo.id).catch(() => {});
                    redraw(photo.id);
                  },
                  onGone: (undone) => {
                    if (undone) return;
                    deletePhoto(photo.id).catch(() => {});
                    forget(photo.id);
                  },
                });
              },
            },
            icon('trash', 18),
            'Delete'
          )
        )
      );
      dateIn.addEventListener('change', async () => {
        if (!isValidStr(dateIn.value) || dateIn.value > todayStr()) return;
        await setPhotoDate(photo.id, dateIn.value).catch(() => {});
        photo.date = dateIn.value;
        toast('Date changed');
        close();
        redraw(photo.id);
      });
    },
  });
}

function openCompare(photos, bodyLog) {
  const first = photos[0];
  const last = photos[photos.length - 1];
  const days = diffDays(first.date, last.date);
  openSheet({
    title: 'Then and now',
    build(body) {
      const side = (p, label) => h('figure', { class: 'ph-side' }, h('div', { class: 'ph-big' }, h('img', { src: urlFor(p), alt: `${label}: ${photoDate(p.date)}` }), h('span', { class: 'ph-mark' }, h('b', {}, photoDate(p.date)), h('small', {}, photoNote(p, first, bodyLog) || label))));
      const a = bodyLog[first.date];
      const b = bodyLog[last.date];
      // Side by side, or a slider that wipes from the first photo to the latest one
      const sideBySide = h('div', { class: 'ph-compare' }, side(first, 'First'), side(last, 'Latest'));
      const range = h('input', { type: 'range', min: 0, max: 100, value: 50, class: 'ph-wipe-range', 'aria-label': 'Slide between the first and the latest photo' });
      const top = h('img', { class: 'ph-wipe-top', src: urlFor(first), alt: `First: ${photoDate(first.date)}` });
      const wipe = h(
        'div',
        { class: 'ph-wipe', hidden: true },
        h('div', { class: 'ph-big' }, h('img', { src: urlFor(last), alt: `Latest: ${photoDate(last.date)}` }), top, h('span', { class: 'ph-wipe-line' }), h('span', { class: 'ph-wipe-tag left' }, photoDate(first.date)), h('span', { class: 'ph-wipe-tag right' }, photoDate(last.date))),
        range
      );
      const line = wipe.querySelector('.ph-wipe-line');
      const setWipe = () => {
        top.style.clipPath = `inset(0 ${100 - range.value}% 0 0)`;
        line.style.left = `${range.value}%`;
      };
      range.addEventListener('input', setWipe);
      setWipe();
      const modes = h('div', { class: 'seg', role: 'group', 'aria-label': 'How to compare' });
      const setMode = (m) => {
        sideBySide.hidden = m !== 'side';
        wipe.hidden = m !== 'wipe';
        modes.replaceChildren(...[['side', 'Side by side'], ['wipe', 'Slider']].map(([id, name]) => h('button', { type: 'button', 'aria-pressed': String(m === id), onclick: () => setMode(id) }, name)));
      };
      setMode('wipe');
      body.append(
        modes,
        sideBySide,
        wipe,
        h('p', { class: 'hint' }, `${days} day${days === 1 ? '' : 's'} apart${typeof a === 'number' && typeof b === 'number' ? `, ${Math.abs(Math.round((b - a) * 10) / 10)} kg ${b < a ? 'down' : b > a ? 'up' : 'the same'}` : ''}.`)
      );
    },
  });
}
