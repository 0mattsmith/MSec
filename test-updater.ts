import { compareVersions } from './src/lib/updater';
const cases: [string,string,string][] = [
  ['0.1.2','0.1.1','newer'], ['v0.2.0','0.1.9','newer'], ['1.0.0','0.9.9','newer'],
  ['0.1.1','0.1.1','same'],  ['0.1.0','0.1.1','older'],  ['0.1.2','0.2.0','older'],
  ['0.1.10','0.1.9','newer'], ['v1.2.3','v1.2.3','same'],
];
let fail = 0;
for (const [a,b,expect] of cases) {
  const r = compareVersions(a,b);
  const got = r > 0 ? 'newer' : r < 0 ? 'older' : 'same';
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${a} vs ${b} -> ${got} (expected ${expect})`);
}
console.log(fail ? `\n${fail} FAILED` : '\nAll version comparisons correct.');
process.exit(fail?1:0);
