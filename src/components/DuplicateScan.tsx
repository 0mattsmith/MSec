import React, { useMemo, useState } from 'react';
import { Copy, Trash2, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useVault } from '../store/VaultContext';
import { findDuplicateGroups } from '../lib/dedupe';

/*
 * Duplicate check for entries already in the vault.
 *
 * Deliberately not automatic cleanup. Two entries that differ only by password
 * are often an old credential and its replacement, and the one that looks
 * redundant can be the one you still need — so this surfaces and explains, and
 * the deleting is always a decision someone made.
 *
 * Removal is a move to the trash, never a permanent delete. Getting this wrong
 * should be recoverable.
 */
export function DuplicateScan() {
  const { items, updateItem, setSelectedItemId, setActiveCategory } = useVault();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [trashed, setTrashed] = useState<string[]>([]);

  // Recomputed from the live vault, so trashing one updates the rest.
  const groups = useMemo(() => findDuplicateGroups(items), [items]);

  if (groups.length === 0) {
    return (
      <p className="flex items-center text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="mr-2 h-4 w-4" />
        No duplicate or near-duplicate entries found.
      </p>
    );
  }

  const identicalCount = groups.filter((g) => g.identical).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-slate-300">
        {groups.length} group{groups.length === 1 ? '' : 's'} of entries look alike
        {identicalCount > 0 && (
          <> — {identicalCount} {identicalCount === 1 ? 'is an exact copy' : 'are exact copies'}</>
        )}.
      </p>

      <ul className="space-y-2">
        {groups.map((group, gi) => {
          const open = expanded[gi] ?? group.identical;
          return (
            <li
              key={gi}
              className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => setExpanded({ ...expanded, [gi]: !open })}
                className="flex w-full items-center gap-2 bg-gray-50 px-3 py-2 text-left dark:bg-[#121418]"
              >
                {open ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                  {group.items[0]?.title || 'Untitled'}
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-slate-400">
                    ×{group.items.length}
                  </span>
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    group.identical
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                  }`}
                >
                  {group.identical ? 'Exact copy' : 'Similar'}
                </span>
              </button>

              {open && (
                <div className="space-y-2 p-3">
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Grouped because they have the {group.reason}.
                    {!group.identical && group.differences.length > 0 && (
                      <> They differ by: <span className="font-medium">{group.differences.join(', ')}</span>.</>
                    )}
                  </p>

                  {!group.identical && (
                    <p className="flex items-start rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      <AlertTriangle className="mr-1.5 mt-px h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        These aren&rsquo;t identical, so check before removing one — an older
                        password you still need looks much like a redundant copy.
                      </span>
                    </p>
                  )}

                  <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                    {group.items.map((it, index) => (
                      <li key={it.id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-900 dark:text-white">
                            {it.title || 'Untitled'}
                            {index === 0 && (
                              <span className="ml-2 text-[10px] uppercase text-gray-400">oldest</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                            {[it.username, it.url].filter(Boolean).join(' · ') || 'no username or site'}
                            {it.createdAt ? ` · added ${new Date(it.createdAt).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setActiveCategory('all'); setSelectedItemId(it.id); }}
                          className="flex-shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          disabled={trashed.includes(it.id)}
                          onClick={() => {
                            // Soft delete: it lands in the trash, recoverable.
                            updateItem(it.id, { deletedAt: Date.now() });
                            setTrashed([...trashed, it.id]);
                          }}
                          className="flex flex-shrink-0 items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3 w-3" />
                          {trashed.includes(it.id) ? 'Trashed' : 'Trash'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="flex items-start text-[11px] text-gray-500 dark:text-slate-400">
        <Copy className="mr-1.5 mt-px h-3.5 w-3.5 flex-shrink-0" />
        <span>Removed entries go to the trash, so nothing is lost by mistake.</span>
      </p>
    </div>
  );
}
