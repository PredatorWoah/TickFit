// scanner.js
// Scan a food packet's barcode with the camera, or type its digits. The picture never leaves the phone:
// the phone itself reads the stripes (the browser's BarcodeDetector), and only the digits are looked up
// (lookup.js, and only with the online lookup turned on).
//
// Phones whose browser can't read barcodes still get the box to type the digits printed under the stripes.

import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { cleanBarcode } from './lookup.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export const scanSupported = () => 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/**
 * Open the scanner sheet. Calls onCode(digits) once with a barcode, then closes.
 */
export function openScanner({ onCode }) {
  let stream = null;
  let timer = null;
  let done = false;
  const stop = () => {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  openSheet({
    title: 'Scan a barcode',
    onClose: stop,
    build(body, close) {
      const finish = (code) => {
        if (done) return;
        done = true;
        stop();
        close();
        onCode(code);
      };
      const status = h('p', { class: 'hint', role: 'status' });
      const video = h('video', { class: 'scan-video', autoplay: true, playsinline: true, muted: true, 'aria-label': 'Camera preview' });
      video.muted = true;
      const view = h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-line', 'aria-hidden': 'true' }));
      const digits = h('input', { type: 'text', inputmode: 'numeric', class: 'text-input', placeholder: 'Or type the numbers under the stripes', 'aria-label': 'Barcode numbers', maxlength: 18, autocomplete: 'off' });
      const useTyped = () => {
        const code = cleanBarcode(digits.value);
        if (!code) {
          toast('A barcode has 8 to 14 digits');
          return digits.focus();
        }
        finish(code);
      };
      digits.addEventListener('keydown', (e) => e.key === 'Enter' && useTyped());

      body.append(
        ...[
          scanSupported() ? view : null,
          status,
          h('div', { class: 'scan-type' }, digits, h('button', { class: 'btn small', type: 'button', onclick: useTyped }, 'Look up')),
          h('p', { class: 'hint' }, 'Only the barcode number is sent to Open Food Facts, a free food database. The camera picture stays on your phone.')
        ].filter(Boolean));

      if (!scanSupported()) {
        status.textContent = 'This phone\'s browser can\'t read barcodes with the camera, so type the numbers instead.';
        return;
      }
      status.textContent = 'Point the camera at the barcode';
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        } catch {
          view.remove();
          status.textContent = 'The camera is not allowed or not available. Type the numbers instead.';
          return;
        }
        if (done) return stop();
        video.srcObject = stream;
        await video.play().catch(() => {});
        let detector;
        try {
          const supported = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : FORMATS;
          detector = new BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        } catch {
          detector = new BarcodeDetector();
        }
        const look = async () => {
          if (done || !stream) return;
          try {
            if (video.readyState >= 2) {
              for (const b of await detector.detect(video)) {
                const code = cleanBarcode(b.rawValue);
                if (code) return finish(code);
              }
            }
          } catch {
            /* a frame that couldn't be read; try the next one */
          }
          timer = setTimeout(look, 250);
        };
        look();
      })();
    },
  });
}
