// fx.js
// Small bits of motion that make the screens feel alive: numbers that count up to their new value, and a burst
// of confetti when a day is finished. Both do nothing extra when the phone asks for reduced motion.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Show `text` in `el`. When both the old and the new text are whole numbers, count from one to the other
 * (quick, slowing at the end); anything else is set straight away.
 */
export function countTo(el, text, ms = 650) {
  text = String(text);
  const from = Number(el.dataset.n);
  const to = /^\d+$/.test(text) ? Number(text) : NaN;
  el.dataset.n = Number.isFinite(to) ? String(to) : '';
  cancelAnimationFrame(el._count || 0);
  if (!Number.isFinite(to) || !Number.isFinite(from) || el.dataset.n === '' || from === to || reduced() || el.textContent === '') {
    el.textContent = text;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) el._count = requestAnimationFrame(step);
  };
  el._count = requestAnimationFrame(step);
}

const COLOURS = ['var(--accent)', '#ff5a1f', '#00a884', '#2e5bff', '#ffd23f', '#ff6fa8'];

/** A short burst of confetti from a point on screen (default: the middle near the top). */
export function celebrate(x = innerWidth / 2, y = innerHeight * 0.32) {
  if (reduced() || typeof document === 'undefined') return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 150;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = COLOURS[i % COLOURS.length];
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7 - 40}px`);
    p.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.animationDelay = `${Math.random() * 60}ms`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1400);
}
