/*
 * Folder ordering.
 *
 * The property worth protecting is that sorting is a view, not an edit: only
 * "manual" reads position, and nothing here writes it. Switch to A–Z, switch
 * back, and the arrangement you built by hand is still there.
 */
import { sortFolders, reorderedIds } from './src/lib/foldersort';
import type { VaultFolder, VaultItem } from './src/types';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const f = (over: Partial<VaultFolder>): VaultFolder =>
  ({ id: over.name!.toLowerCase(), name: 'X', createdAt: 0, ...over } as VaultFolder);
const names = (list: VaultFolder[]) => list.map((x) => x.name).join(',');

const folders = [
  f({ name: 'Banking', createdAt: 300, position: 2 }),
  f({ name: 'Archive', createdAt: 100, position: 0 }),
  f({ name: 'Work',    createdAt: 200, position: 1 }),
];

// --- Views ---
check(names(sortFolders(folders, 'az')) === 'Archive,Banking,Work', 'A–Z');
check(names(sortFolders(folders, 'za')) === 'Work,Banking,Archive', 'Z–A');
check(names(sortFolders(folders, 'created')) === 'Archive,Work,Banking', 'date created');
check(names(sortFolders(folders, 'manual')) === 'Archive,Work,Banking', 'manual follows position');

// --- Sorting must not mutate the caller's array ---
const original = names(folders);
sortFolders(folders, 'za');
check(names(folders) === original, 'sorting leaves the input array untouched');

// --- Numeric-aware naming: "Folder 10" after "Folder 9", not before ---
check(
  names(sortFolders([f({ name: 'Folder 10' }), f({ name: 'Folder 9' }), f({ name: 'Folder 2' })], 'az'))
    === 'Folder 2,Folder 9,Folder 10',
  'names sort numerically, not lexically',
);

// --- Folders made before reordering existed have no position ---
const mixed = sortFolders([
  f({ name: 'NoPos', createdAt: 50 }),
  f({ name: 'Placed', createdAt: 900, position: 0 }),
], 'manual');
check(names(mixed) === 'Placed,NoPos',
  `explicitly placed folders come before unplaced ones (${names(mixed)})`);

// --- Recently updated, derived from the items inside ---
const item = (folderId: string, updatedAt: number, over: Partial<VaultItem> = {}): VaultItem =>
  ({ id: `i${updatedAt}`, type: 'login', title: 't', isFavorite: false,
     createdAt: updatedAt, updatedAt, folderId, ...over } as VaultItem);

const byActivity = sortFolders(folders, 'modified', [
  item('archive', 10), item('work', 900), item('banking', 500),
]);
check(names(byActivity) === 'Work,Banking,Archive', `recently updated (${names(byActivity)})`);

// A trashed item is not activity.
const trashedOnly = sortFolders(folders, 'modified', [
  item('archive', 999, { deletedAt: Date.now() }), item('work', 5),
]);
check(trashedOnly[0].name === 'Work',
  `a trashed item doesn't make its folder look recent (${names(trashedOnly)})`);

// Empty folders fall to the bottom in a stable order rather than shuffling.
const someEmpty = sortFolders(folders, 'modified', [item('work', 900)]);
check(someEmpty[0].name === 'Work', 'the folder with activity leads');
check(names(someEmpty) === 'Work,Archive,Banking',
  `empty folders keep creation order behind it (${names(someEmpty)})`);

// --- Reordering ---
const ordered = sortFolders(folders, 'manual'); // Archive, Work, Banking
check(reorderedIds(ordered, 'banking', 'archive').join(',') === 'banking,archive,work',
  'dragging the last folder onto the first puts it first');
check(reorderedIds(ordered, 'archive', 'banking').join(',') === 'work,banking,archive',
  'dragging the first onto the last puts it last');
check(reorderedIds(ordered, 'work', 'work').join(',') === 'archive,work,banking',
  'dropping a folder on itself changes nothing');
check(reorderedIds(ordered, 'nope', 'archive').join(',') === 'archive,work,banking',
  'an unknown id is ignored rather than corrupting the order');
check(reorderedIds([], 'a', 'b').length === 0, 'an empty list is handled');

console.log(fail ? `\n${fail} FAILED` : '\nFolder ordering verified.');
process.exit(fail?1:0);
