// photos.js
// Progress photos: pictures of yourself, kept on this device only, to compare over the weeks.
//
// Photos are far too big for localStorage (where the rest of TickFit lives), so they go in the browser's own
// database, IndexedDB, under "tickfit-photos". Like everything else they never leave the device: nothing here
// sends anything anywhere. They can go inside the backup file (the backup sheet asks), and each photo can also
// be saved on its own.
//
// Each photo: { id, date: 'YYYY-MM-DD', added: ms, blob: JPEG, w, h }

const DB_NAME = 'tickfit-photos';
const STORE = 'photos';
const MAX_SIDE = 1280; // pixels on the long side, plenty for comparing and about 150 to 300 KB each
const QUALITY = 0.82;

let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('This browser cannot store photos.'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open the photo storage.'));
    });
    dbPromise.catch(() => (dbPromise = null)); // try again next time
  }
  return dbPromise;
}

function run(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error || new Error('Photo storage failed.'));
        tx.onabort = () => reject(tx.error || new Error('Photo storage is full or blocked.'));
      })
  );
}

/** All photos, oldest first (by the date they show, then when they were added). Binned ones are left out. */
export async function listPhotos() {
  const all = ((await run('readonly', (s) => s.getAll())) || []).filter((p) => !p.binned);
  return all.sort((a, b) => (a.date === b.date ? a.added - b.added : a.date < b.date ? -1 : 1));
}

// Deleting goes through a bin first, so Undo works and nothing comes back if the app closes meanwhile:
// binPhoto hides it at once (saved in the database), unbinPhoto is Undo, emptyBin really deletes.
async function setBinned(id, binned) {
  const photo = await run('readonly', (s) => s.get(id));
  if (!photo) return;
  if (binned) photo.binned = Date.now();
  else delete photo.binned;
  await run('readwrite', (s) => s.put(photo));
}
export const binPhoto = (id) => setBinned(id, true);
export const unbinPhoto = (id) => setBinned(id, false);

/** Really delete binned photos (all of them, or those binned more than `olderThanMs` ago). */
export async function emptyBin(olderThanMs = 0) {
  const all = (await run('readonly', (s) => s.getAll())) || [];
  const now = Date.now();
  for (const p of all) if (p.binned && now - p.binned >= olderThanMs) await deletePhoto(p.id);
}

/** Shrink a picture to MAX_SIDE and make it a JPEG. Pure maths for the size, so it can be tested. */
export function fitSize(w, h, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function shrink(file) {
  // createImageBitmap follows the photo's rotation (EXIF) in current browsers, so portraits stay upright
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const { w, h } = fitSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Could not read that picture.');
  return { blob, w, h };
}

/** Save a new photo from a picked or taken picture. Returns the stored photo. */
export async function addPhoto(file, date) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('That file is not a picture.');
  const { blob, w, h } = await shrink(file);
  const photo = { id: `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, date, added: Date.now(), blob, w, h };
  await run('readwrite', (s) => s.put(photo));
  return photo;
}

export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id));

export async function setPhotoDate(id, date) {
  const photo = await run('readonly', (s) => s.get(id));
  if (!photo) return;
  photo.date = date;
  await run('readwrite', (s) => s.put(photo));
}

/**
 * A copy of the photo with its date written along the bottom (for saving or sharing it).
 * @param label  the text, like "11 Oct 2026 · 72.4 kg"
 */
export async function withWatermark(photo, label) {
  const bmp = await createImageBitmap(photo.blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const g = canvas.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const size = Math.max(16, Math.round(canvas.width / 22));
  const band = size * 2.4;
  const fade = g.createLinearGradient(0, canvas.height - band, 0, canvas.height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = fade;
  g.fillRect(0, canvas.height - band, canvas.width, band);
  g.font = `800 ${size}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.textAlign = 'center';
  g.fillText(label, canvas.width / 2, canvas.height - size * 0.8);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

// ----- photos inside the backup file -----

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Every photo as plain data for the backup file: { id, date, added, w, h, jpeg: base64 }. */
export async function photosForBackup() {
  const out = [];
  for (const p of await listPhotos()) out.push({ id: p.id, date: p.date, added: p.added, w: p.w, h: p.h, jpeg: await toBase64(p.blob) });
  return out;
}

/** How many photos there are and roughly how big they make a backup (MB, base64 grows them by a third). */
export async function photoStats() {
  const all = await listPhotos();
  return { count: all.length, mb: Math.round((all.reduce((t, p) => t + p.blob.size, 0) * 1.37) / 1e5) / 10 };
}

/** Put photos from a backup file back. Photos already here (same id) are kept as they are. Returns how many were added. */
export async function restorePhotos(list) {
  const have = new Set((await listPhotos()).map((p) => p.id));
  let added = 0;
  for (const x of list) {
    if (!x || typeof x.jpeg !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) || have.has(x.id)) continue;
    const bytes = Uint8Array.from(atob(x.jpeg), (ch) => ch.charCodeAt(0));
    const photo = { id: String(x.id || `ph-${Date.now().toString(36)}-${added}`), date: x.date, added: Number(x.added) || Date.now(), w: Number(x.w) || 0, h: Number(x.h) || 0, blob: new Blob([bytes], { type: 'image/jpeg' }) };
    await run('readwrite', (s) => s.put(photo));
    added++;
  }
  return added;
}
