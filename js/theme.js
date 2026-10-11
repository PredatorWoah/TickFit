// theme.js
// Two looks ("styles") and two themes, switched any time in More:
//   * style: 'pulse' (dark and sporty, orange) or 'bento' (bright blocks with bold outlines)
//   * theme: 'dark', 'light' or 'auto' (follows the phone)
// Each style has a natural theme (Pulse dark, Bento light) used until the person picks a theme themselves.
// (js/theme-boot.js does the same thing before first paint, to avoid a flash.)

import { isNative, nativePlugin } from './platform.js';

export const STYLES = ['pulse', 'bento'];

// matches --bg for each look, used for the phone's browser bar
const COLORS = { pulse: { dark: '#07090d', light: '#f4f2ee' }, bento: { dark: '#16140f', light: '#fff4dc' } };

export const resolveStyle = (style) => (STYLES.includes(style) ? style : 'pulse');

export function resolveTheme(pref, style) {
  const p = pref || (resolveStyle(style) === 'bento' ? 'light' : 'dark');
  if (p === 'light') return 'light';
  if (p === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

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
