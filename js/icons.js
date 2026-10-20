// icons.js
// Small line icons drawn as inline SVG, so they look the same on every phone and take the
// colour of the surrounding text (currentColor). Usage: icon('check', 22)

const PATHS = {
  today: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  progress: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  plans: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>',
  more: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  library: '<path d="M5 4h4v16H5zM10 4h4v16h-4z"/><path d="M15.5 5.5l3.8-1 3.2 15.2-3.8 1z"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  paste: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4h6v1M9 11h6M9 15h6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.4"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  barcode: '<path d="M4 6v12M7.5 6v12M10 6v12M13.5 6v12M17 6v12M20 6v12"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a2 2 0 0 0 2 4M16 6h3a2 2 0 0 1-2 4M12 13v4M9 20h6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  meal: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 1.5-3 4-3 7 0 2 1 3 3 3v8"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 9.5a4.5 4 0 0 1 7 0M12 9.5l1.6-1.8"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.5"/><path d="M20 15l-4.5-4.5L6 20"/>',
  compare: '<rect x="3.5" y="5" width="7.5" height="14" rx="2"/><rect x="13" y="5" width="7.5" height="14" rx="2"/>',
};

export function icon(name, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  svg.innerHTML = PATHS[name] || ''; // the paths above are constants in this file, never user text
  return svg;
}
