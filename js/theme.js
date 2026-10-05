// theme.js
// Dark is the default. "auto" follows the phone's own setting.
// (js/theme-boot.js does the same thing before first paint, to avoid a flash.)

import { isNative, nativePlugin } from './platform.js';

const COLORS = { dark: '#0a0d12', light: '#f2f4f7' }; // matches --bg, used for the phone's browser bar

export function resolveTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export function applyTheme(pref) {
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[theme]);
  // Android app: light icons on the dark theme, dark icons on the light theme (the status bar shows the page colour)
  if (isNative()) {
    const bars = nativePlugin('SystemBars');
    if (bars && bars.setStyle) Promise.resolve(bars.setStyle({ style: theme === 'light' ? 'LIGHT' : 'DARK' })).catch(() => {});
  }
}
