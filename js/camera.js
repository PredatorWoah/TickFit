// camera.js
// The "ghost camera" for progress photos: a live camera with your last photo shown faintly on top, so you
// can line up the same pose, distance and angle every time. Has a self-timer (you can't tap while posing)
// and a front/back switch. The picture never leaves the phone: it goes straight to photos.js.
//
// If the camera can't be used (no permission, an old browser), the caller falls back to the phone's own
// camera app through a file input.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { getState, setSetting } from './store.js';

export const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/** Seconds to show for a countdown of `total` after `elapsedMs`. Pure. */
export const countdownLeft = (total, elapsedMs) => Math.max(0, Math.ceil(total - elapsedMs / 1000));

/**
 * Open the camera full screen.
 * @param ghostUrl  the last photo's image URL, shown on top while framing (or null for the first photo)
 * @param onShot    async (Blob) called with the JPEG when a photo is taken
 * @param onFail    called when the camera can't be opened (then use the phone's camera app instead)
 */
export async function openGhostCamera({ ghostUrl, onShot, onFail }) {
  let facing = 'user';
  let stream = null;
  let closed = false;
  const video = h('video', { class: 'cam-video', autoplay: true, playsinline: true, muted: true, 'aria-label': 'Camera preview' });
  video.muted = true;
  const ghost = ghostUrl ? h('img', { class: 'cam-ghost', src: ghostUrl, alt: '' }) : null;
  const count = h('div', { class: 'cam-count', 'aria-live': 'assertive' });
  const opacity = h('input', { type: 'range', min: 0, max: 80, value: 35, class: 'cam-range', 'aria-label': 'How strongly to show your last photo' });
  let timer = Number(getState().settings.camTimer ?? 5);
  const timerBtn = h('button', { class: 'cam-btn', type: 'button' });
  const showTimer = () => {
    timerBtn.replaceChildren(icon('timer', 20), h('span', {}, timer ? `${timer}s` : 'Off'));
    timerBtn.setAttribute('aria-label', `Self-timer: ${timer ? timer + ' seconds' : 'off'}. Tap to change`);
  };
  timerBtn.onclick = () => {
    timer = { 0: 3, 3: 5, 5: 10, 10: 0 }[timer] ?? 5;
    setSetting('camTimer', timer);
    showTimer();
  };
  showTimer();

  const stage = h('div', { class: 'cam-stage' }, video, ghost, count);
  const shoot = h('button', { class: 'cam-shoot', type: 'button', 'aria-label': 'Take the photo' });
  const flip = h('button', { class: 'cam-btn', type: 'button', 'aria-label': 'Switch between front and back camera' }, icon('swap', 20), h('span', {}, 'Flip'));
  const close = h('button', { class: 'cam-btn cam-close', type: 'button', 'aria-label': 'Close the camera' }, icon('close', 22));
  const root = h(
    'div',
    { class: 'cam', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Take a progress photo' },
    stage,
    h('div', { class: 'cam-top' }, close, h('span', { class: 'cam-tip' }, ghost ? 'Line yourself up with your last photo' : 'Your first photo: pick a spot you can use every time'), timerBtn),
    h('div', { class: 'cam-bottom' }, ghost ? h('label', { class: 'cam-fade' }, h('span', {}, 'Last photo'), opacity) : h('span', {}), shoot, flip)
  );
  const setOpacity = () => ghost && (ghost.style.opacity = String(opacity.value / 100));
  opacity.addEventListener('input', setOpacity);
  setOpacity();

  const stop = () => stream && stream.getTracks().forEach((t) => t.stop());
  const end = () => {
    if (closed) return;
    closed = true;
    stop();
    root.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && end();

  async function start() {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
    } catch (e) {
      end();
      if (onFail) onFail(e);
      return false;
    }
    video.srcObject = stream;
    // the front camera is shown like a mirror, so the ghost is mirrored the same way to line up
    root.classList.toggle('mirror', facing === 'user');
    try {
      await video.play();
    } catch {
      /* autoplay rules; the stream still shows */
    }
    return true;
  }

  async function capture() {
    const w = video.videoWidth;
    const hgt = video.videoHeight;
    if (!w || !hgt) return toast('The camera is not ready yet');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    const g = canvas.getContext('2d');
    // save what you saw: mirrored for the front camera, like the preview and like a mirror selfie
    if (facing === 'user') {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    g.drawImage(video, 0, 0, w, hgt);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return toast('Could not take the photo');
    root.classList.add('flash');
    setTimeout(() => root.classList.remove('flash'), 250);
    end();
    await onShot(blob);
  }

  let counting = null;
  shoot.onclick = () => {
    if (counting) {
      // a second tap cancels the countdown
      clearInterval(counting);
      counting = null;
      count.textContent = '';
      return;
    }
    if (!timer) return capture();
    const t0 = Date.now();
    const tickDown = () => {
      const left = countdownLeft(timer, Date.now() - t0);
      count.textContent = left ? String(left) : '';
      if (!left) {
        clearInterval(counting);
        counting = null;
        capture();
      }
    };
    tickDown();
    counting = setInterval(tickDown, 200);
  };
  flip.onclick = () => {
    facing = facing === 'user' ? 'environment' : 'user';
    start();
  };
  close.onclick = end;

  document.body.append(root);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  return start();
}
