// Draws the TickFit icon and writes every size the web app and Android app use.
//   node scripts/make-icons.mjs        (from android-app/, after `npm ci`)
//
// The mark: a barbell bent into a tick, with weight plates on both ends. Edit ART to change it.
// Outputs (in ../icons): icon.svg, icon-maskable.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'icons');

// The artwork is drawn around the point (272, 240); `place(scale)` centres it on the 512 canvas.
const ART = `
  <defs>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcff5c"/><stop offset="1" stop-color="#a4dc1e"/></linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1ff9a"/><stop offset="1" stop-color="#bfee33"/></linearGradient>
    <linearGradient id="plate2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9dd22"/><stop offset="1" stop-color="#8bbd16"/></linearGradient>
  </defs>
  <path d="M150 268 L224 342 L368 172" fill="none" stroke="url(#lime)" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(368 172) rotate(-49.8)">
    <rect x="-8" y="-76" width="42" height="152" rx="16" fill="url(#plate)"/>
    <rect x="42" y="-52" width="32" height="104" rx="12" fill="url(#plate2)"/>
  </g>
  <g transform="translate(150 268) rotate(-135)">
    <rect x="-8" y="-58" width="42" height="116" rx="16" fill="url(#plate)"/>
    <rect x="42" y="-40" width="32" height="80" rx="12" fill="url(#plate2)"/>
  </g>`;
const place = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-272 -240)">${ART}</g>`;
const GLOW = `<defs><radialGradient id="glow" cx="0.5" cy="0.45" r="0.62"><stop offset="0" stop-color="#c6f432" stop-opacity="0.20"/><stop offset="1" stop-color="#c6f432" stop-opacity="0"/></radialGradient></defs>`;
const BG = '#0a0d12';

// "any" icon: rounded square, mark nearly fills it
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GLOW}<rect width="512" height="512" rx="112" fill="${BG}"/><rect width="512" height="512" rx="112" fill="url(#glow)"/>${place(1.12)}</svg>\n`;
// maskable icon: full square, mark inside Android's safe zone (the middle 66%)
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GLOW}<rect width="512" height="512" fill="${BG}"/><rect width="512" height="512" fill="url(#glow)"/>${place(0.8)}</svg>\n`;
// iPhone home screen icon: full square, iOS rounds the corners itself
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GLOW}<rect width="512" height="512" fill="${BG}"/><rect width="512" height="512" fill="url(#glow)"/>${place(1.0)}</svg>\n`;

const png = (svg, size) => sharp(Buffer.from(svg), { density: 400 }).resize(size, size).png().toFile.bind(null);
async function write(svg, size, name) {
  await sharp(Buffer.from(svg), { density: 400 }).resize(size, size).png().toFile(join(out, name));
}

writeFileSync(join(out, 'icon.svg'), rounded);
writeFileSync(join(out, 'icon-maskable.svg'), maskable);
await write(rounded, 192, 'icon-192.png');
await write(rounded, 512, 'icon-512.png');
await write(maskable, 512, 'icon-maskable-512.png');
await write(apple, 180, 'apple-touch-icon.png');
console.log('Icons written to', out);
