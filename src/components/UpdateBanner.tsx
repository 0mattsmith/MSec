import React, { useEffect, useState } from 'react';
import { Download, X, ArrowUpCircle } from 'lucide-react';
import {
  checkForUpdate, applyUpdate, skipVersion, detectPlatform,
  updateActionLabel, type UpdateInfo,
} from '../lib/updater';

/**
 * Slim bar pinned to the bottom of the screen when a newer release exists.
 * Shown on the lock screen too, so updates aren't gated behind unlocking.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((u) => { if (!cancelled) setInfo(u); });
    return () => { cancelled = true; };
  }, []);

  if (!info || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-indigo-500/30 dark:bg-[#1A1F26]/95">
        <ArrowUpCircle className="h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
            MSec {info.version} is available
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-slate-400">
            {platform === 'android'
              ? 'Download the new APK to update'
              : platform === 'web'
                ? 'Reload to get the latest version'
                : 'Open the release to get the installer'}
          </p>
        </div>
        <button
          onClick={async () => { setBusy(true); await applyUpdate(info, platform); setBusy(false); }}
          disabled={busy}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          {updateActionLabel(platform)}
        </button>
        <button
          onClick={() => { skipVersion(info.version); setDismissed(true); }}
          title="Skip this version"
          className="flex-shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
