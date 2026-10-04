// theme.js
// Dark is the default. "auto" follows the phone's own setting.
// (js/theme-boot.js does the same thing before first paint, to avoid a flash.)

const COLORS = { dark: '#0e1116', light: '#f4f6f9' }; // matches --bg, used for the phone's browser bar

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
}
