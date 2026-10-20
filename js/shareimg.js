// shareimg.js
// Hand a picture to the phone's share sheet (Instagram, WhatsApp, Photos...), or download it on a computer.

import { h } from './dom.js';
import { isNative, nativePlugin } from './platform.js';

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Share or save an image. Returns 'shared', 'downloaded' or 'cancelled'. */
export async function shareImage(blob, name, title = 'TickFit') {
  if (isNative()) {
    const Filesystem = nativePlugin('Filesystem');
    const Share = nativePlugin('Share');
    if (!Filesystem || !Share) throw new Error('Sharing is not available');
    const written = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: 'CACHE' });
    try {
      await Share.share({ title, files: [written.uri], dialogTitle: title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
