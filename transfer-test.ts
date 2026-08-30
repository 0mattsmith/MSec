// MSec -> MSec transfer: ids survive, re-imports are idempotent.
import { parseImport, detectFormat } from './src/lib/importers';
import { analyseImport } from './src/lib/dedupe';
import type { VaultItem } from './src/types';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const vaultA: VaultItem[] = [
  { id: 'aaaa-1111', type: 'login', title: 'GitHub', url: 'https://github.com', username: 'matt', password: 'pw1', isFavorite: false, createdAt: 100, updatedAt: 100 },
  { id: 'bbbb-2222', type: 'login', title: 'Bank', totpSecret: 'JBSWY3DPEHPK3PXP', isFavorite: false, createdAt: 100, updatedAt: 100 },
] as VaultItem[];

const transferFile = JSON.stringify({
  format: 'msec-vault-transfer', v: 1, exportedAt: new Date().toISOString(),
  items: vaultA, folders: [], maskedEmails: [], workspaces: [],
});

check(detectFormat(transferFile) === 'msec-transfer', `transfer file recognised (${detectFormat(transferFile)})`);
const parsed = parseImport(transferFile);
check(parsed.ok === true, 'parses');
check((parsed.items?.[0] as any).id === 'aaaa-1111', `id preserved through import (${(parsed.items?.[0] as any).id})`);
check(parsed.formatLabel === 'MSec transfer file', `labelled for the user: "${parsed.formatLabel}"`);

// Device B is empty -> everything new
const emptyB = analyseImport(parsed.items as any[], []);
check(emptyB.newCount === 2, `fresh device: ${emptyB.newCount} new`);

// Import the same file again on a device that already has it -> all duplicates
const again = analyseImport(parsed.items as any[], vaultA);
check(again.duplicateCount === 2 && again.newCount === 0, `re-import is idempotent: ${again.duplicateCount} duplicates, ${again.newCount} new`);

// Renaming an entry on device B: id still matches, so it's "similar" not a new copy
const renamed = vaultA.map(i => i.id === 'aaaa-1111' ? { ...i, title: 'GitHub (work)' } : i);
const afterRename = analyseImport(parsed.items as any[], renamed as VaultItem[]);
check(afterRename.newCount === 0, 'renamed entry is not re-added as new');
check(afterRename.similarCount === 1, `renamed entry flagged as similar (${afterRename.similarCount})`);

// A plain (non-transfer) MSec export has no ids -> falls back to heuristics
const plainExport = JSON.stringify({ items: vaultA.map(({ id, ...rest }) => rest), folders: [] });
check(detectFormat(plainExport) === 'msec-json', 'plain export detected separately from transfer');
const plainAnalysis = analyseImport(parseImport(plainExport).items as any[], vaultA);
check(plainAnalysis.duplicateCount === 2, `plain export still deduped by heuristics (${plainAnalysis.duplicateCount})`);

// Merge semantics: newer copy wins
const byId = new Map(vaultA.map(i => [i.id, i]));
const incoming = [{ ...vaultA[0], password: 'newer', updatedAt: 999 }] as VaultItem[];
let added = 0, updated = 0;
for (const item of incoming) {
  const mine = byId.get(item.id);
  if (mine) { if (item.updatedAt > mine.updatedAt) { byId.set(item.id, item); updated++; } }
  else { byId.set(item.id, item); added++; }
}
check(added === 0 && updated === 1, `merge: ${added} added, ${updated} updated`);
check([...byId.values()].length === 2, 'merge did not create a duplicate row');
check((byId.get('aaaa-1111') as any).password === 'newer', 'newer edit won the merge');

// Older incoming copy must NOT clobber a newer local edit
const byId2 = new Map<string, VaultItem>(vaultA.map(i => [i.id, { ...i, password: 'local-newer', updatedAt: 500 }]));
const stale = { ...vaultA[0], password: 'stale', updatedAt: 200 } as VaultItem;
const mine2 = byId2.get(stale.id)!;
if (stale.updatedAt > mine2.updatedAt) byId2.set(stale.id, stale);
check((byId2.get('aaaa-1111') as any).password === 'local-newer', 'stale copy does not overwrite a newer local edit');

console.log(fail ? `\n${fail} FAILED` : '\nMSec-to-MSec transfer verified.');
process.exit(fail?1:0);
