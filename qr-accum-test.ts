// Models the accumulate/dedupe logic the scanner uses across several QRs.
import { parseQrPayload } from './src/lib/otpimport';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

// Mirror of QrImport's state handling
const seen = new Set<string>();
let found: any[] = [];
let duplicates = 0;
function handlePayload(payload: string): number {
  const codes = parseQrPayload(payload);
  if (codes.length === 0) return 0;
  const fresh = codes.filter(c => !seen.has(c.secret));
  duplicates += codes.length - fresh.length;
  if (fresh.length === 0) return 0;
  fresh.forEach(c => seen.add(c.secret));
  found = [...found, ...fresh];
  return fresh.length;
}

// A multi-part export: three separate QR codes
const part1 = 'otpauth://totp/Acme:one?secret=GEZDGNBVGY3TQOJQ&issuer=Acme';
const part2 = 'otpauth://totp/Beta:two?secret=MZXW6YTBOI======&issuer=Beta';
const part3 = 'otpauth://totp/Gamma:three?secret=JBSWY3DPEHPK3PXP&issuer=Gamma';

check(handlePayload(part1) === 1, 'QR 1 adds 1 code');
check(found.length === 1, `after QR 1: ${found.length} total`);
check(handlePayload(part2) === 1, 'QR 2 adds 1 code');
check(found.length === 2, `after QR 2: ${found.length} total — accumulates, does not replace`);
check(handlePayload(part3) === 1, 'QR 3 adds 1 code');
check(found.length === 3, `after QR 3: ${found.length} total`);

// Re-reading the same code (camera lingering on it) must not duplicate
check(handlePayload(part2) === 0, 're-scanning QR 2 adds nothing');
check(found.length === 3 && duplicates === 1, `still 3 codes, 1 duplicate counted (${found.length}/${duplicates})`);

// Non-authenticator QR shouldn't disturb the collection
check(handlePayload('https://example.com') === 0, 'unrelated QR ignored');
check(found.length === 3, 'collection untouched by unrelated QR');

// Removing one code frees its secret to be re-scanned
const removed = found[1].secret;
seen.delete(removed);
found = found.filter(c => c.secret !== removed);
check(found.length === 2, 'removal drops the code');
check(handlePayload(part2) === 1, 'a removed code can be scanned again');
check(found.length === 3, `back to ${found.length} codes`);

const titles = found.map(f => f.title).sort().join(',');
check(titles === 'Acme,Beta,Gamma', `all three issuers present (${titles})`);

console.log(fail ? `\n${fail} FAILED` : '\nMulti-QR accumulation verified.');
process.exit(fail?1:0);
