import React, { useState } from 'react';
import { Check, AlertTriangle, Copy, Plus, X } from 'lucide-react';
import type { ClassifiedItem, ImportAnalysis } from '../lib/dedupe';

/*
 * Review screen shown before anything is written to the vault.
 *
 * New items are ticked, duplicates and conflicts are not — but everything is
 * listed and everything is overridable. Importing a deliberate duplicate is a
 * legitimate choice; the job here is to make sure it's a choice rather than an
 * accident.
 */

interface Props<T> {
  analysis: ImportAnalysis<T>;
  sourceLabel: string;
  onConfirm: (items: T[]) => void;
  onCancel: () => void;
}

const KIND_STYLES: Record<string, { badge: string; label: string; icon: React.ReactNode }> = {
  new: {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    label: 'New',
    icon: <Plus className="h-3 w-3" />,
  },
  duplicate: {
    badge: 'bg-gray-100 text-gray-600 dark:bg-slate-700/60 dark:text-slate-300',
    label: 'Already have',
    icon: <Copy className="h-3 w-3" />,
  },
  similar: {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    label: 'Similar',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

export function ImportReview<T extends { title?: string; username?: string; url?: string; totpSecret?: string }>(
  { analysis, sourceLabel, onConfirm, onCancel }: Props<T>,
) {
  const [entries, setEntries] = useState<ClassifiedItem<T>[]>(analysis.entries);
  const [filter, setFilter] = useState<'all' | 'new' | 'duplicate' | 'similar'>(
    analysis.duplicateCount + analysis.similarCount > 0 ? 'all' : 'new',
  );

  const toggle = (index: number) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, selected: !e.selected } : e)));
  };

  const setAll = (kind: 'new' | 'duplicate' | 'similar', selected: boolean) => {
    setEntries((prev) => prev.map((e) => (e.kind === kind ? { ...e, selected } : e)));
  };

  const visible = entries
    .map((e, i) => ({ entry: e, index: i }))
    .filter(({ entry }) => filter === 'all' || entry.kind === filter);

  const selectedCount = entries.filter((e) => e.selected).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm safe-all">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1A1F26]">
        <div className="border-b border-gray-100 p-5 dark:border-slate-800">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Review import</h3>
            <button onClick={onCancel} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {sourceLabel} — {analysis.newCount} new
            {analysis.duplicateCount > 0 && `, ${analysis.duplicateCount} identical to entries you have`}
            {analysis.similarCount > 0 && `, ${analysis.similarCount} similar but not identical`}.
          </p>

          {(analysis.duplicateCount > 0 || analysis.similarCount > 0) && (
            <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600 dark:bg-slate-800/60 dark:text-slate-400">
              Only entries where <em>every</em> field matches are treated as duplicates and left
              unticked. Anything merely similar stays ticked — it's probably a separate account —
              but is listed so you can check.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {([
              ['all', `All ${entries.length}`],
              ['new', `New ${analysis.newCount}`],
              ['duplicate', `Duplicates ${analysis.duplicateCount}`],
              ['similar', `Similar ${analysis.similarCount}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  filter === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filter !== 'all' && filter !== 'new' && (
            <div className="mt-2 flex gap-2 text-xs">
              <button onClick={() => setAll(filter, true)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Select all
              </button>
              <button onClick={() => setAll(filter, false)} className="font-medium text-gray-500 hover:underline dark:text-slate-400">
                Deselect all
              </button>
            </div>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto p-3">
          {visible.length === 0 && (
            <li className="p-6 text-center text-sm text-gray-500 dark:text-slate-400">Nothing in this category.</li>
          )}
          {visible.map(({ entry, index }) => {
            const style = KIND_STYLES[entry.kind];
            const it = entry.item as any;
            return (
              <li key={index} className="mb-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-3 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked={entry.selected}
                    onChange={() => toggle(index)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-indigo-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {it.title || 'Untitled'}
                      </span>
                      <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>
                        {style.icon}{style.label}
                      </span>
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {[it.username, it.url].filter(Boolean).join(' · ')}
                      {it.totpSecret && (it.username || it.url ? ' · 2FA code' : '2FA code')}
                    </p>
                    {entry.reason && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{entry.reason}</p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2 border-t border-gray-100 p-4 dark:border-slate-800">
          <button
            onClick={() => onConfirm(entries.filter((e) => e.selected).map((e) => e.item))}
            disabled={selectedCount === 0}
            className="flex flex-1 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Check className="mr-2 h-4 w-4" />
            Import {selectedCount} item{selectedCount === 1 ? '' : 's'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
