// Progress photos: the pure parts (the browser parts are covered by the screen checks). Run: node tests/photos.mjs
import { fitSize } from '../js/photos.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(eq(fitSize(4000, 3000), { w: 1280, h: 960 }), 'a big landscape photo shrinks to 1280 wide');
ok(eq(fitSize(3000, 4000), { w: 960, h: 1280 }), 'a big portrait photo shrinks to 1280 tall');
ok(eq(fitSize(800, 600), { w: 800, h: 600 }), 'a small photo is never blown up');
ok(eq(fitSize(10000, 10), { w: 1280, h: 1 }), 'a strip never ends up 0 pixels');

console.log(fail ? `\n${fail} failed` : '\nAll photo tests passed');
process.exit(fail ? 1 : 0);
