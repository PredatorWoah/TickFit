// Run the parser tests in Node:  node tests/run.mjs
import { parsePlanText } from '../js/parser.js';
import { runCases } from './cases.js';

const results = runCases(parsePlanText);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '\n      ' + r.why}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
