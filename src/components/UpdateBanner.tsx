import React, { useEffect, useState } from 'react';
import { Download, X, ArrowUpCircle, AlertTriangle } from 'lucide-react';
import {
  checkForUpdate, applyUpdate, skipVersion, detectPlatform,
  updateActionLabel, type UpdateInfo,
} from '../lib/updater';

/*
 * Slim bar shown when a newer release exists — including on the lock screen,
 * so updates aren't gated behind unlocking.
 *
 * Positioning matters here: sitting flush at bottom: 0 puts the button inside
 * Android's gesture-navigation strip, where the system swallows taps and the
 * button looks broken. The bar is lifted clear of the inset instead.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const platform = detectPlatform();

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((u) => { if (!cancelled) setInfo(u); });
    return () => { cancelled = true; };
  }, []);

  if (!info || dismissed) return null;

  const handleUpdate = async () => {
    setBusy(true);
    setError('');
    const problem = await applyUpdate(info, platform);
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    // The wrapper ignores pointer events so it can never block the UI beneath;
    // only the bar itself is interactive.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3"
      style={{ paddingBottom: 'calc(var(--msec-safe-bottom, 0px) + 0.75rem)' }}
    >
      <div className="pointer-events-auto w-full max-w-xl rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-indigo-500/30 dark:bg-[#1A1F26]/95">
        <div className="flex items-center gap-3">
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
            type="button"
            onClick={handleUpdate}
            disabled={busy}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-60"
            style={{ touchAction: 'manipulation' }}
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? 'Opening…' : updateActionLabel(platform)}
          </button>
          <button
            type="button"
            onClick={() => { skipVersion(info.version); setDismissed(true); }}
            title="Skip this version"
            aria-label="Skip this version"
            className="flex-shrink-0 rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            style={{ touchAction: 'manipulation' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mt-2 flex items-start rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mr-1.5 mt-px h-3.5 w-3.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}
