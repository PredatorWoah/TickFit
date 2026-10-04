// theme-boot.js
// A tiny classic script loaded in <head> BEFORE the page paints, so people who chose the
// light theme never see a dark flash. app.js does the same job later when settings change.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('tickfit:v1') || '{}');
    var pref = (s.settings && s.settings.theme) || 'dark';
    var light = pref === 'light' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  } catch (e) {
    /* storage blocked: keep the default dark theme */
  }
})();
