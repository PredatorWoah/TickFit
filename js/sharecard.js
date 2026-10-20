// sharecard.js
// A picture of today's workout to share (Instagram story, WhatsApp...), drawn on the phone in your look:
// Arena (a full-time scoreboard), Deck (colour cards) or Bento (pastel tiles). 1080 x 1350 pixels.

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

// Each look's colours and fonts for the picture (the same as css/arena.css, deck.css, bento.css).
const LOOKS = {
  arena: { bg: '#0a0e18', ink: '#e8ecf5', muted: '#8f99b0', accent: '#ffc23d', mark: '#1a1200', display: '"Big Shoulders Display"', dWeight: 900, num: '"Big Shoulders Display"', nWeight: 900, body: '"IBM Plex Sans"', label: '"IBM Plex Mono"', upper: true, tiles: [['#121a2b', '#e8ecf5'], ['#121a2b', '#e8ecf5'], ['#121a2b', '#ffc23d'], ['#121a2b', '#e8ecf5']], fact: ['#1c1608', '#ffc23d'] },
  deck: { bg: '#e9ecf1', ink: '#101114', muted: '#4b505a', accent: '#ff5a1f', mark: '#101114', display: 'Archivo', dWeight: 900, num: 'Archivo', nWeight: 900, body: 'Archivo', label: 'Archivo', upper: true, wide: true, tiles: [['#ff5a1f', '#101114'], ['#00a884', '#101114'], ['#ffffff', '#101114'], ['#2e5bff', '#ffffff']], fact: ['#101114', '#ffffff'] },
  bento: { bg: '#f4f4f0', ink: '#1d1d1b', muted: '#5e5e58', accent: '#5b45e0', mark: '#ffffff', display: 'Fredoka', dWeight: 600, num: 'Fredoka', nWeight: 600, body: 'Figtree', label: 'Figtree', upper: false, tiles: [['#e2dafc', '#1d1d1b'], ['#cdeedd', '#1d1d1b'], ['#ffd9c4', '#1d1d1b'], ['#d2e7fb', '#1d1d1b']], fact: ['#fbecb0', '#1d1d1b'] },
};

/** Draw the card in a look ('arena', 'deck' or 'bento'). Returns a PNG Blob. */
export async function drawCard(lines, style = 'arena') {
  const W = 1080;
  const H = 1350;
  const L = LOOKS[style] || LOOKS.arena;
  try {
    await Promise.all([document.fonts.load(`${L.dWeight} 120px ${L.display}`), document.fonts.load(`${L.nWeight} 80px ${L.num}`), document.fonts.load(`700 40px ${L.body}`), document.fonts.load(`700 30px ${L.label}`)]);
  } catch {
    /* system fonts then */
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const wide = (on) => {
    if ('fontStretch' in g) g.fontStretch = on && L.wide ? 'expanded' : 'normal';
  };
  const block = (x, y, w, h, fill, r = 36) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fillStyle = fill;
    g.fill();
  };

  // background
  g.fillStyle = L.bg;
  g.fillRect(0, 0, W, H);
  if (style === 'arena') {
    const glow = g.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, 800);
    glow.addColorStop(0, 'rgba(255,194,61,0.16)');
    glow.addColorStop(1, 'rgba(255,194,61,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }

  // header: the date, then the title (wide and in capitals for Arena and Deck)
  g.fillStyle = L.muted;
  g.font = `700 34px ${L.label}`;
  g.fillText((style === 'arena' ? `FULL TIME · ${lines.date}` : lines.date).toUpperCase(), 80, 130);
  g.fillStyle = L.ink;
  wide(true);
  const titleSize = style === 'arena' ? 128 : style === 'deck' ? 92 : 100;
  const lead = Math.round(titleSize * 0.96);
  g.font = `${L.dWeight} ${titleSize}px ${L.display}`;
  const titleLines = wrap(g, L.upper ? lines.title.toUpperCase() : lines.title, W - 160).slice(0, 2);
  titleLines.forEach((t, i) => g.fillText(t, 80, 250 + i * lead));
  wide(false);
  let y = 250 + (titleLines.length - 1) * lead;
  if (lines.records) {
    g.fillStyle = style === 'bento' ? L.accent : style === 'deck' ? '#c43c06' : L.accent;
    g.font = `800 42px ${L.body}`;
    g.fillText(lines.records, 80, y + 64);
    y += 64;
  }
  y += 60;

  // four stat tiles
  const tw = (W - 160 - 30) / 2;
  const th = 210;
  lines.stats.forEach(([value, label], i) => {
    const x = 80 + (i % 2) * (tw + 30);
    const ty = y + Math.floor(i / 2) * (th + 30);
    const [fill, text] = L.tiles[i] || L.tiles[0];
    block(x, ty, tw, th, fill, style === 'bento' ? 48 : 36);
    g.fillStyle = text;
    wide(true);
    g.font = `${L.nWeight} ${value.length > 6 ? 80 : 104}px ${L.num}`;
    g.fillText(value, x + 36, ty + 122);
    wide(false);
    g.fillStyle = text;
    g.globalAlpha = style === 'arena' && i !== 2 ? 0.7 : 0.85;
    g.font = `700 34px ${L.label}`;
    g.fillText(style === 'arena' ? label.toUpperCase() : label, x + 36, ty + 174);
    g.globalAlpha = 1;
  });
  y += 2 * th + 30 + 60;

  // the fun fact
  if (lines.fact) {
    g.font = `700 40px ${L.body}`;
    const fl = wrap(g, lines.fact, W - 220).slice(0, 2);
    block(80, y, W - 160, 70 + fl.length * 52, L.fact[0], style === 'bento' ? 48 : 36);
    g.fillStyle = L.fact[1];
    fl.forEach((t, i) => g.fillText(t, 116, y + 78 + i * 52));
    y += 70 + fl.length * 52 + 40;
  }

  // top sets: as many as fit above the footer
  g.fillStyle = L.muted;
  g.font = `800 30px ${L.label}`;
  const room = Math.floor((H - 150 - (y + 70)) / 56) + 1;
  const best = lines.best.slice(0, Math.max(0, room));
  if (best.length) {
    g.fillText(style === 'arena' ? 'TOP SCORERS' : 'TOP SETS', 80, y + 10);
    g.fillStyle = L.ink;
    g.font = `700 40px ${L.body}`;
    best.forEach((t, i) => g.fillText(t, 80, y + 70 + i * 56));
  }

  // footer
  g.fillStyle = L.muted;
  g.font = `700 32px ${L.body}`;
  g.fillText('Tracked with TickFit · free, no account', 80, H - 70);
  g.fillStyle = L.accent;
  g.beginPath();
  g.arc(W - 110, H - 82, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = L.mark;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(W - 122, H - 82);
  g.lineTo(W - 112, H - 72);
  g.lineTo(W - 96, H - 94);
  g.stroke();

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
