/*
 * Vault-wide duplicate scanning.
 *
 * The behaviour worth protecting here is restraint: a password manager that
 * cries duplicate at every pair of entries for the same site trains you to
 * ignore it, and two logins on one domain are usually two real accounts. So
 * "identical" and "similar" stay distinct, and nothing is grouped on
 * similarity of name alone.
 */
import { findDuplicateGroups } from './src/lib/dedupe';
import type { VaultItem } from './src/types';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

let n = 0;
const item = (over: Partial<VaultItem> = {}): VaultItem => ({
  id: `id-${++n}`, type: 'login', title: 'Untitled', isFavorite: false,
  createdAt: n, updatedAt: n, ...over,
} as VaultItem);

// --- Exact copies ---
const exact = findDuplicateGroups([
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'pw' }),
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'pw' }),
]);
check(exact.length === 1, `one group for an exact copy (${exact.length})`);
check(exact[0]?.items.length === 2, 'both entries in the group');
check(exact[0]?.identical === true, 'flagged identical');
check(exact[0]?.differences.length === 0, 'nothing listed as differing');

// --- Same account, different password: similar, not identical ---
const similar = findDuplicateGroups([
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'old' }),
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'new' }),
]);
check(similar[0]?.identical === false, 'differing password makes it similar, not identical');
check(similar[0]?.differences.includes('password') === true,
  `the differing field is named (${similar[0]?.differences})`);

// --- Two real accounts on one site must NOT be grouped ---
const twoAccounts = findDuplicateGroups([
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'a' }),
  item({ title: 'GitHub work', url: 'https://github.com', username: 'matt-work', password: 'b' }),
]);
check(twoAccounts.length === 0,
  `different usernames on one site are left alone (${twoAccounts.length} groups)`);

// --- Same 2FA secret is a duplicate however it's labelled ---
const totp = findDuplicateGroups([
  item({ title: 'Gmail', totpSecret: 'JBSWY3DPEHPK3PXP' }),
  item({ title: 'Google Mail', totpSecret: 'jbswy3dpehpk3pxp' }),
]);
check(totp.length === 1, 'same 2FA secret groups despite different titles and case');
check(/2FA/.test(totp[0]?.reason || ''), `reason names the 2FA secret (${totp[0]?.reason})`);

// --- Grouping is transitive ---
// A~B by 2FA secret, B~C by site+username: one problem, not two pairs.
const chain = findDuplicateGroups([
  item({ title: 'A', url: 'https://x.com', username: 'me', totpSecret: 'JBSWY3DPEHPK3PXP' }),
  item({ title: 'B', url: 'https://x.com', username: 'me', totpSecret: 'JBSWY3DPEHPK3PXP' }),
  item({ title: 'C', url: 'https://x.com', username: 'me' }),
]);
check(chain.length === 1, `transitively linked entries form one group (${chain.length})`);
check(chain[0]?.items.length === 3, `all three are in it (${chain[0]?.items.length})`);

// --- Trashed entries are not duplicates ---
const trashed = findDuplicateGroups([
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'pw' }),
  item({ title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'pw', deletedAt: Date.now() }),
]);
check(trashed.length === 0, 'an entry in the trash does not count as a duplicate');

// --- A clean vault reports nothing ---
check(findDuplicateGroups([
  item({ title: 'A', url: 'https://a.com', username: 'me' }),
  item({ title: 'B', url: 'https://b.com', username: 'me' }),
  item({ title: 'C', type: 'note', notes: 'hello' }),
]).length === 0, 'unrelated entries produce no groups');
check(findDuplicateGroups([]).length === 0, 'an empty vault is handled');
check(findDuplicateGroups([item({ title: 'Only one' })]).length === 0, 'a single entry is not a group');

// --- Ordering: exact copies first, since those are safe to clear ---
const mixed = findDuplicateGroups([
  item({ title: 'Sim', url: 'https://s.com', username: 'u', password: 'one' }),
  item({ title: 'Sim', url: 'https://s.com', username: 'u', password: 'two' }),
  item({ title: 'Dup', url: 'https://d.com', username: 'u', password: 'same' }),
  item({ title: 'Dup', url: 'https://d.com', username: 'u', password: 'same' }),
]);
check(mixed.length === 2, `two separate groups (${mixed.length})`);
check(mixed[0]?.identical === true, 'identical group is listed first');

// --- Oldest first within a group, so "keep the original" is the obvious read ---
check(exact[0]?.items[0].createdAt <= exact[0]?.items[1].createdAt,
  'group members are ordered oldest first');

console.log(fail ? `\n${fail} FAILED` : '\nDuplicate scanning verified.');
process.exit(fail?1:0);
