/*
 * Sync reconciliation tests.
 *
 * The first case is the regression: before mergeSync existed, signing in
 * against an empty remote replaced local items with [], and the persistence
 * effect then encrypted that emptiness over the stored vault. Every entry gone,
 * silently, on a perfectly ordinary action — which is what migrating to a new
 * Firebase project would have been.
 */
import { mergeSync } from './src/lib/syncmerge';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const item = (id: string, updatedAt: number, extra: any = {}) =>
  ({ id, updatedAt, title: id, ...extra });

// --- The regression: empty remote must not wipe a populated vault ---
const local = [item('a', 100), item('b', 100), item('c', 100)];
const fresh = mergeSync(local, []);
check(fresh.merged.length === 3, `empty remote keeps all local entries (${fresh.merged.length} of 3)`);
check(fresh.toUpload.length === 3, `and queues every one for upload (${fresh.toUpload.length})`);
check(fresh.merged.map((i) => i.id).sort().join() === 'a,b,c', 'no entry lost or renamed');

// --- Empty local, populated remote: a genuinely new device ---
const newDevice = mergeSync([], [item('a', 100), item('b', 100)]);
check(newDevice.merged.length === 2, 'new device adopts the remote vault');
check(newDevice.toUpload.length === 0, 'and uploads nothing back');

// --- Newest edit wins, both directions ---
const localNewer = mergeSync([item('a', 500, { title: 'local' })], [item('a', 200, { title: 'remote' })]);
check(localNewer.merged.length === 1, 'no duplicate when both sides have the entry');
check((localNewer.merged[0] as any).title === 'local', 'newer local edit wins');
check(localNewer.toUpload.length === 1, 'and is queued to correct the remote');

const remoteNewer = mergeSync([item('a', 200, { title: 'local' })], [item('a', 500, { title: 'remote' })]);
check((remoteNewer.merged[0] as any).title === 'remote', 'newer remote edit wins');
check(remoteNewer.toUpload.length === 0, 'and is not uploaded back over itself');

const same = mergeSync([item('a', 300)], [item('a', 300)]);
check(same.merged.length === 1 && same.toUpload.length === 0, 'identical timestamps upload nothing');

// --- Deletions must not come back from the dead ---
// MSec deletes softly, so a removed entry travels as a tombstone. If a merge
// dropped tombstones, every sign-in would resurrect deleted passwords.
const tombstone = mergeSync(
  [item('a', 900, { deletedAt: 900 })],
  [item('a', 400, { deletedAt: null })],
);
check((tombstone.merged[0] as any).deletedAt === 900, 'newer deletion survives the merge');
check(tombstone.toUpload.length === 1, 'and propagates to the remote');

const undelete = mergeSync(
  [item('a', 400, { deletedAt: 400 })],
  [item('a', 900, { deletedAt: null })],
);
check((undelete.merged[0] as any).deletedAt === null, 'a newer restore also wins');

// --- Both sides hold different entries ---
const both = mergeSync([item('a', 100), item('b', 100)], [item('c', 100), item('d', 100)]);
check(both.merged.length === 4, `disjoint sets union (${both.merged.length} of 4)`);
check(both.toUpload.length === 2, 'only the local-only pair is uploaded');

// --- Malformed input must not take the vault with it ---
const missingStamp = mergeSync([{ id: 'a' } as any], [item('a', 500, { title: 'remote' })]);
check((missingStamp.merged[0] as any).title === 'remote', 'entry with no updatedAt loses to a stamped one');
const junk = mergeSync([item('a', 100), null as any, { title: 'no id' } as any], []);
check(junk.merged.length === 1, `entries without an id are skipped, not crashed on (${junk.merged.length})`);

// --- Folders: no updatedAt at all, so ties go to the remote ---
const folders = mergeSync(
  [{ id: 'f1', name: 'Local', createdAt: 1 } as any],
  [{ id: 'f2', name: 'Remote', createdAt: 1 } as any],
);
check(folders.merged.length === 2, 'local-only folders are kept');
check(folders.toUpload.length === 1, 'and queued for upload');

// --- Host classification: decides whether WebAuthn / Firebase auth can work ---
import { isIpHost } from './src/lib/biometric';
for (const h of ['192.168.1.50', '10.0.0.136', '127.0.0.1', '[fe80::1]']) {
  check(isIpHost(h) === true, `IP host recognised: ${h}`);
}
for (const h of ['msec.local', 'localhost', 'msec.tail1234.ts.net', '0mattsmith.github.io', '']) {
  check(isIpHost(h) === false, `hostname not mistaken for an IP: ${h || '(empty)'}`);
}

console.log(fail ? `\n${fail} FAILED` : '\nSync reconciliation verified.');
process.exit(fail?1:0);
