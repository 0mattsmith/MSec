/*
 * Folder ordering for the sidebar.
 *
 * "Manual" is the only mode that persists anything — the rest are views, so
 * switching to A–Z and back to Manual returns your own arrangement rather than
 * having overwritten it. That matters because a hand-ordered sidebar is work
 * somebody did, and a sort button that silently destroys it is a trap.
 */

import type { VaultFolder, VaultItem } from '../types';

export type FolderSort = 'manual' | 'az' | 'za' | 'created' | 'modified';

export const FOLDER_SORT_LABELS: Record<FolderSort, string> = {
  manual: 'Custom order',
  az: 'Name (A–Z)',
  za: 'Name (Z–A)',
  created: 'Date created',
  modified: 'Recently updated',
};

/** Order the sort menu is offered in. */
export const FOLDER_SORT_ORDER: FolderSort[] = ['manual', 'az', 'za', 'created', 'modified'];

function byName(a: VaultFolder, b: VaultFolder): number {
  // Numeric so "Folder 10" sorts after "Folder 9", and locale-aware so
  // accented names land where a reader expects.
  return (a.name || '').localeCompare(b.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Most recent activity inside a folder. Folders have no updatedAt of their
 * own, so the newest item they hold stands in for it — which is what someone
 * means by "recently updated" anyway.
 */
function lastActivity(folder: VaultFolder, items: VaultItem[]): number {
  let newest = 0;
  for (const item of items) {
    if (item.folderId !== folder.id || item.deletedAt) continue;
    const stamp = item.updatedAt || item.createdAt || 0;
    if (stamp > newest) newest = stamp;
  }
  return newest;
}

export function sortFolders(
  folders: VaultFolder[],
  mode: FolderSort = 'manual',
  items: VaultItem[] = [],
): VaultFolder[] {
  const list = folders.slice();

  switch (mode) {
    case 'az':
      return list.sort(byName);
    case 'za':
      return list.sort((a, b) => byName(b, a));
    case 'created':
      return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case 'modified':
      // Empty folders have no activity, so they collect at the bottom in a
      // stable order rather than shuffling about.
      return list.sort((a, b) => {
        const diff = lastActivity(b, items) - lastActivity(a, items);
        return diff !== 0 ? diff : (a.createdAt || 0) - (b.createdAt || 0);
      });
    case 'manual':
    default:
      // Folders predating manual ordering have no position; they keep their
      // creation order and sit after anything explicitly placed.
      return list.sort((a, b) => {
        const pa = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
        const pb = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
        return pa !== pb ? pa - pb : (a.createdAt || 0) - (b.createdAt || 0);
      });
  }
}

/**
 * New order after dragging `draggedId` onto `targetId`.
 *
 * Returns ids, not folders: the caller persists positions, and keeping this
 * function free of side effects makes the reordering testable on its own.
 */
export function reorderedIds(
  ordered: VaultFolder[],
  draggedId: string,
  targetId: string,
): string[] {
  const ids = ordered.map((f) => f.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, draggedId);
  return ids;
}
