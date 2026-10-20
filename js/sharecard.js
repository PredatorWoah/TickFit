// sharecard.js
// A picture of today's workout to share (Instagram story, WhatsApp...), drawn on the phone in your look:
// Pulse (dark, orange) or Bento (cream blocks). 1080 x 1350 pixels.

import { liftFact } from './lift.js';

const fmt = (n) => Math.round(n).toLocaleString('en-IN');

/**
 * What goes on the card. Pure, so it can be tested.
 * @param s     workoutSummary(): { setsDone, volumeKg, exercisesDone }
 * @param best  [{ name, w, r }] the top sets, heaviest first
 */
export function cardLines({ label, dateText, minutes, s, kcal, best = [], records = 0 }) {
  const fact = s.volumeKg > 0 ? liftFact(s.volumeKg) : null;
  return {
    title: label,
    date: dateText,
    stats: [
      [minutes ? `${minutes}` : '–', 'minutes'],
      [String(s.setsDone), 'sets'],
      [s.volumeKg ? fmt(s.volumeKg) : '–', 'kg lifted'],
      [kcal ? `~${fmt(kcal)}` : '–', 'kcal'],
    ],
    fact: fact ? fact.short : null,
    best: best.slice(0, 3).map((b) => `${b.name}  ${b.w} × ${b.r}`),
    records: records > 0 ? `${records} new personal best${records === 1 ? '' : 's'} 🏆` : null,
  };
}

function wrap(g, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw the card. Returns a PNG Blob. */
export async function drawCard(lines, style = 'pulse') {
  const W = 1080;
  const H = 1350;
  const bento = style === 'bento';
  const display = bento ? '"Space Grotesk"' : '"Barlow Condensed"';
  const num = bento ? '"Space Mono"' : '"Barlow Condensed"';
  const body = bento ? '"Space Grotesk"' : 'Manrope';
  try {
    await Promise.all([document.fonts.load(`800 120px ${display}`), document.fonts.load(`700 80px ${num}`), document.fonts.load(`700 40px ${body}`)]);
  } catch {
    /* system fonts then */
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const ink = bento ? '#111111' : '#f3f5f8';
  const muted = bento ? '#4d4636' : '#8b93a3';
  const accent = bento ? '#ff4f8b' : '#ff6a2b';
  const block = (x, y, w, h, fill, r = 36) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    if (bento) {
      g.fillStyle = '#111';
      g.save();
      g.translate(10, 10);
      g.fill();
      g.restore();
    }
    g.fillStyle = fill;
    g.fill();
    if (bento) {
      g.lineWidth = 6;
      g.strokeStyle = '#111';
      g.stroke();
    }
  };

  // background
  if (bento) {
    g.fillStyle = '#fff4dc';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(17,17,17,0.09)';
    for (let y = 30; y < H; y += 44) for (let x = 30; x < W; x += 44) g.fillRect(x, y, 4, 4);
  } else {
    g.fillStyle = '#07090d';
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, 900);
    glow.addColorStop(0, 'rgba(255,106,43,0.35)');
    glow.addColorStop(1, 'rgba(255,106,43,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }

  // header
  g.fillStyle = muted;
  g.font = `700 36px ${body}`;
  g.fillText(lines.date.toUpperCase(), 80, 130);
  g.fillStyle = ink;
  g.font = `800 ${bento ? 96 : 120}px ${display}`;
  const titleLines = wrap(g, bento ? lines.title : lines.title.toUpperCase(), W - 160).slice(0, 2);
  titleLines.forEach((t, i) => g.fillText(t, 80, 250 + i * (bento ? 100 : 118)));
  let y = 250 + (titleLines.length - 1) * (bento ? 100 : 118);
  if (lines.records) {
    g.fillStyle = accent;
    g.font = `800 42px ${body}`;
    g.fillText(lines.records, 80, y + 64);
    y += 64;
  }
  y += 60;

  // four stat tiles
  const tw = (W - 160 - 30) / 2;
  const th = 210;
  const fills = bento ? ['#ffd23f', '#ff4f8b', '#ffffff', '#3d5afe'] : ['#12151c', '#12151c', '#12151c', '#12151c'];
  lines.stats.forEach(([value, label], i) => {
    const x = 80 + (i % 2) * (tw + 30);
    const ty = y + Math.floor(i / 2) * (th + 30);
    block(x, ty, tw, th, fills[i]);
    const onBlue = bento && i === 3;
    g.fillStyle = onBlue ? '#ffffff' : bento ? '#111' : i === 2 ? accent : ink;
    g.font = `700 ${value.length > 6 ? 76 : 96}px ${num}`;
    g.fillText(value, x + 36, ty + 120);
    g.fillStyle = onBlue ? '#ffffff' : bento ? '#111' : muted;
    g.font = `700 34px ${body}`;
    g.fillText(label, x + 36, ty + 172);
  });
  y += 2 * th + 30 + 60;

  // the fun fact
  if (lines.fact) {
    g.font = `700 40px ${body}`;
    const fl = wrap(g, lines.fact, W - 220).slice(0, 2);
    block(80, y, W - 160, 70 + fl.length * 52, bento ? '#ffffff' : 'rgba(255,106,43,0.14)');
    g.fillStyle = bento ? '#111' : '#ff8a52';
    fl.forEach((t, i) => g.fillText(t, 116, y + 78 + i * 52));
    y += 70 + fl.length * 52 + 40;
  }

  // top sets and records
  g.fillStyle = muted;
  g.font = `800 30px ${body}`;
  // as many top sets as fit above the footer
  const room = Math.floor((H - 150 - (y + 70)) / 56) + 1;
  const best = lines.best.slice(0, Math.max(0, room));
  if (best.length) {
    g.fillText('TOP SETS', 80, y + 10);
    g.fillStyle = ink;
    g.font = `700 40px ${body}`;
    best.forEach((t, i) => g.fillText(t, 80, y + 70 + i * 56));
  }

  // footer
  g.fillStyle = muted;
  g.font = `700 32px ${body}`;
  g.fillText('Tracked with TickFit · free, no account', 80, H - 70);
  g.fillStyle = accent;
  g.beginPath();
  g.arc(W - 110, H - 82, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = bento ? '#111' : '#1a0a00';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(W - 122, H - 82);
  g.lineTo(W - 112, H - 72);
  g.lineTo(W - 96, H - 94);
  g.stroke();

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
