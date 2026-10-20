// theme.js
// Three looks ("styles") and two themes, switched any time in More:
//   * style: 'arena' (the default: a scoreboard, dark navy and yellow), 'deck' (one big card at a time,
//     bold colour blocks) or 'bento' (soft pastel tiles in a grid)
//   * theme: 'dark', 'light' or 'auto' (follows the phone)
// Each style has a natural theme (Arena dark, Deck and Bento light) used until the person picks a theme.
// Each look also lays some screens out its own way (home.js, workout.js, timer.js ask lookOf()).
// (js/theme-boot.js does the same thing before first paint, to avoid a flash.)

import { isNative, nativePlugin } from './platform.js';

export const STYLES = ['arena', 'deck', 'bento'];

// matches --bg for each look, used for the phone's browser bar
const COLORS = { arena: { dark: '#0a0e18', light: '#eef1f6' }, deck: { dark: '#0d0e11', light: '#e9ecf1' }, bento: { dark: '#141414', light: '#f4f4f0' } };

/** The look for a saved setting. 'pulse' was the default look before 2.0, so it becomes Arena. */
export const resolveStyle = (style) => (STYLES.includes(style) ? style : 'arena');

export const naturalTheme = (style) => (resolveStyle(style) === 'arena' ? 'dark' : 'light');

export function resolveTheme(pref, style) {
  const p = pref || naturalTheme(style);
  if (p === 'light') return 'light';
  if (p === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

/** The look on screen right now. */
export const lookOf = () => resolveStyle(document.documentElement.getAttribute('data-style'));

/** Apply the look and theme from settings ({ style, theme }). */
export function applyTheme(settings = {}) {
  const style = resolveStyle(settings.style);
  const theme = resolveTheme(settings.theme, style);
  const root = document.documentElement;
  root.setAttribute('data-style', style);
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[style][theme]);
  // Android app: light icons on a dark page, dark icons on a light page (the status bar shows the page colour)
  if (isNative()) {
    const bars = nativePlugin('SystemBars');
    if (bars && bars.setStyle) Promise.resolve(bars.setStyle({ style: theme === 'light' ? 'LIGHT' : 'DARK' })).catch(() => {});
  }
}
