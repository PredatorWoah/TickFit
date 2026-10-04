// Tests for the rest time parser. Run: node tests/timer.mjs
import { parseRestSeconds, formatClock } from '../js/timer.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${got} want ${want}`}`);
};

eq('90s', parseRestSeconds('90s'), 90);
eq('90 sec', parseRestSeconds('90 sec'), 90);
eq('90 seconds', parseRestSeconds('90 seconds'), 90);
eq('2 min', parseRestSeconds('2 min'), 120);
eq('2 minutes', parseRestSeconds('2 minutes'), 120);
eq('1.5 min', parseRestSeconds('1.5 min'), 90);
eq('1:30', parseRestSeconds('1:30'), 90);
eq('60 to 90s takes the longer', parseRestSeconds('60 to 90s'), 90);
eq('60-90 sec', parseRestSeconds('60-90 sec'), 90);
eq('1-2 min', parseRestSeconds('1-2 min'), 120);
eq('1 min 30 sec', parseRestSeconds('1 min 30 sec'), 90);
eq('bare 90 means seconds', parseRestSeconds('90'), 90);
eq('bare 2 means minutes', parseRestSeconds('2'), 120);
eq('uppercase 60S', parseRestSeconds('60S'), 60);
eq('with a word: rest 45s', parseRestSeconds('rest 45s'), 45);
eq('empty', parseRestSeconds(''), null);
eq('words only', parseRestSeconds('as needed'), null);
eq('undefined', parseRestSeconds(undefined), null);
eq('zero', parseRestSeconds('0s'), null);
eq('clock 75 -> 1:15', formatClock(75), '1:15');
eq('clock rounds up', formatClock(59.2), '1:00');
eq('clock never negative', formatClock(-3), '0:00');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
