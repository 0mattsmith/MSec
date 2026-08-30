import { analyseImport, fingerprints, normaliseHost, normaliseSecret } from './src/lib/dedupe';
import type { VaultItem } from './src/types';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const item = (o: Partial<VaultItem>): VaultItem => ({
  id: Math.random().toString(36), type: 'login', title: 'x', isFavorite: false,
  createdAt: 0, updatedAt: 0, ...o,
} as VaultItem);

// --- normalisation ---
check(normaliseHost('https://www.GitHub.com/login') === 'github.com', `host normalised (${normaliseHost('https://www.GitHub.com/login')})`);
check(normaliseHost('github.com:443') === 'github.com', 'port stripped');
check(normaliseSecret('jbsw y3dp ehpk3pxp==') === 'JBSWY3DPEHPK3PXP', `secret normalised (${normaliseSecret('jbsw y3dp ehpk3pxp==')})`);

// --- vault to compare against ---
const vault: VaultItem[] = [
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'pw1' }),
  item({ title: 'Bank 2FA', totpSecret: 'JBSWY3DPEHPK3PXP' }),
  item({ title: 'Old Reddit', url: 'https://reddit.com', username: 'matt', password: 'oldpw' }),
  item({ title: 'Deleted thing', url: 'https://gone.com', username: 'matt', password: 'x', deletedAt: Date.now() }),
  item({ title: 'Visa', type: 'card', cardNumber: '4111 1111 1111 1111' }),
  item({ title: 'Imported', externalId: 'bitwarden:abc-123', url: 'https://ext.com', username: 'u' }),
];

// --- incoming batch ---
const incoming = [
  { type: 'login', title: 'GitHub', url: 'http://www.github.com/', username: 'MATT', password: 'pw1' },   // exact dupe (url + case variants)
  { type: 'login', title: 'Old Reddit', url: 'https://reddit.com', username: 'matt', password: 'NEWpw' }, // similar (password differs)
  { type: 'login', title: 'Fresh Site', url: 'https://fresh.com', username: 'matt', password: 'p' },        // new
  { type: 'login', title: 'Bank 2FA', totpSecret: 'jbswy3dpehpk3pxp' },                                      // dupe: same secret, same title
  { type: 'login', title: 'Bank Renamed', totpSecret: 'JBSWY3DPEHPK3PXP=' },                                 // similar: title differs
  { type: 'login', title: 'Gone', url: 'https://gone.com', username: 'matt', password: 'x' },                // trashed -> treat as new
  { type: 'card', title: 'Visa', cardNumber: '4111111111111111' },                                          // dupe: identical
  { type: 'login', title: 'Ext', externalId: 'bitwarden:abc-123', url: 'https://other.com', username: 'z' }, // similar: matched by id but fields differ
  { type: 'login', title: 'Fresh Site', url: 'https://fresh.com', username: 'matt', password: 'p' },         // dupe *within the file*
] as any[];

const result = analyseImport(incoming, vault);
const kinds = result.entries.map(e => e.kind);
console.log('  kinds:', kinds.join(', '));

check(kinds[0] === 'duplicate', 'every field identical (url/case variants) -> duplicate');
check(kinds[1] === 'similar', 'same login, different password -> similar (NOT duplicate)');
check(kinds[2] === 'new', 'unseen entry -> new');
check(kinds[3] === 'duplicate', 'same secret and title -> duplicate');
check(kinds[4] === 'similar', 'same secret but different name -> similar, kept');
check(kinds[5] === 'new', 'entry matching only a TRASHED item -> new');
check(kinds[6] === 'duplicate', 'identical card -> duplicate');
check(kinds[7] === 'similar', 'matched by externalId but fields differ -> similar');
check(kinds[8] === 'duplicate', 'second identical copy inside the same file -> duplicate');

check(result.newCount === 2 && result.duplicateCount === 4 && result.similarCount === 3,
  `counts: ${result.newCount} new, ${result.duplicateCount} identical, ${result.similarCount} similar`);

// Only exact duplicates are unticked; similar entries stay in
check(result.entries.filter(e => e.selected).length === 5, `new + similar pre-selected (${result.entries.filter(e => e.selected).length})`);
check(result.entries[1].differences?.includes('password') === true, `differences listed: ${result.entries[1].differences}`);
check(result.entries[4].differences?.includes('name') === true, `title difference detected: ${result.entries[4].differences}`);
check(!!result.entries[1].existing, 'similar entry carries the existing item for comparison');

// A pure-TOTP QR import against a vault that already has it
const qr = [{ type: 'login', title: 'Bank', totpSecret: 'JBSWY3DPEHPK3PXP' }] as any[];
check(analyseImport(qr, vault).similarCount === 1, 'QR already in vault flagged (title differs from stored entry)');
check(analyseImport([{ type: 'login', title: 'Bank 2FA', totpSecret: 'JBSWY3DPEHPK3PXP' }] as any, vault).duplicateCount === 1, 'QR identical to stored entry -> duplicate');
check(analyseImport([{ type: 'login', title: 'New2FA', totpSecret: 'GEZDGNBVGY' }] as any, vault).newCount === 1, 'unseen QR code -> new');

console.log(fail ? `\n${fail} FAILED` : '\nDuplicate detection verified.');
process.exit(fail?1:0);
