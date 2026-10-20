// share.js
// Share a plan with a friend: the whole plan is packed into a link (and a QR code), with no server in
// between. The link opens TickFit, which asks "Add this plan?". Only the plan travels: never your progress,
// weights, photos or settings.
//
//   https://predatorwoah.github.io/TickFit/#plan=1.<deflate + base64url of the plan's JSON>

const SITE = 'https://predatorwoah.github.io/TickFit/';
export const PREFIX = '#plan=';

/** Only the plan itself: name, days and its library. No ids from this phone, no picks, no dates. Pure. */
export function sharablePlan(plan) {
  const out = { name: plan.name, days: plan.days.map(({ label, workout, meals, extras, focus }) => ({ label, workout, meals, extras, ...(focus ? { focus } : {}) })) };
  if (plan.library) out.library = plan.library;
  return out;
}

const toB64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The plan packed for a link: "1." + compressed JSON (deflate) in base64url. */
export async function encodePlan(plan) {
  const json = new TextEncoder().encode(JSON.stringify(sharablePlan(plan)));
  return '1.' + toB64url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Unpack a shared plan (raw object, still to be checked by validatePlan). Throws on a damaged link. */
export async function decodePlan(text) {
  const m = /^1\.([A-Za-z0-9_-]+)$/.exec(String(text || '').trim());
  if (!m) throw new Error('That plan link is incomplete or damaged.');
  const bytes = await pipe(fromB64url(m[1]), new DecompressionStream('deflate-raw'));
  if (bytes.length > 2_000_000) throw new Error('That plan is too big.');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** This copy of TickFit's own address (so forks share their own links), or the public site in the app. */
export function siteUrl(loc = location) {
  return /^https?:$/.test(loc.protocol) && !/^(localhost|127\.|10\.|192\.168\.)/.test(loc.hostname) ? loc.origin + loc.pathname : SITE;
}

export async function planLink(plan) {
  return siteUrl() + PREFIX + (await encodePlan(plan));
}

/** The packed plan in a link's #plan= part, or null. */
export function planFromHash(hash = location.hash) {
  return hash && hash.startsWith(PREFIX) ? decodeURIComponent(hash.slice(PREFIX.length)) : null;
}

/**
 * A QR code for some text as an SVG string, or null when it is too long for a QR code (about 2,900
 * characters). Uses the bundled qrcode-generator (vendor/qrcode, MIT), loaded only when needed.
 */
export async function qrSvg(text) {
  const { default: qrcode } = await import('../vendor/qrcode/qrcode.js');
  let qr;
  try {
    qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
  } catch {
    return null; // too much data
  }
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
