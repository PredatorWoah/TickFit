// theme-boot.js
// A tiny classic script loaded in <head> BEFORE the page paints, so nobody sees a flash of the wrong look.
// It sets two things on <html>: data-style (the look: Pulse or Bento) and data-theme (dark or light).
// js/theme.js does the same job later when settings change.
(function () {
  var root = document.documentElement;
  try {
    var s = JSON.parse(localStorage.getItem('tickfit:v1') || '{}').settings || {};
    var style = s.style === 'bento' ? 'bento' : 'pulse';
    // Each look has its own natural theme: Pulse is dark, Bento is light, until the person picks one.
    var pref = s.theme || (style === 'bento' ? 'light' : 'dark');
    var light = pref === 'light' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
    root.setAttribute('data-style', style);
    root.setAttribute('data-theme', light ? 'light' : 'dark');
  } catch (e) {
    root.setAttribute('data-style', 'pulse'); // storage blocked: the default look
  }
})();
