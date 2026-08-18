import React, { useState } from 'react';
import { useVault } from '../store/VaultContext';
import { Lock, Fingerprint, Key, Eye, EyeOff, Cloud, ShieldAlert, Check } from 'lucide-react';
import { checkPasswordStrength } from '../lib/utils';

const INPUT_CLASS =
  'w-full rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ' +
  'dark:border-slate-700 dark:bg-[#1A1F26] dark:text-white dark:placeholder-slate-500 ' +
  'dark:focus:border-indigo-400 transition-colors';

export function LockScreen() {
  const {
    unlock, unlockWithBiometric, masterPasswordSet, setMasterPassword,
    signInWithGoogle, currentUser, remoteVaultAvailable,
  } = useVault();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Creating a brand-new vault (not unlocking, not restoring from cloud).
  const isCreating = !masterPasswordSet && !remoteVaultAvailable;
  const strength = isCreating && password ? checkPasswordStrength(password) : null;
  const mismatch = isCreating && confirm.length > 0 && password !== confirm;
  const canCreate = isCreating && password.length >= 8 && password === confirm && acknowledged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');

    if (isCreating) {
      if (password.length < 8) { setError('Use at least 8 characters.'); return; }
      if (password !== confirm) { setError('The two passwords do not match.'); return; }
      if (!acknowledged) { setError('Please confirm you understand it cannot be recovered.'); return; }
    }

    setBusy(true);
    try {
      if (isCreating) {
        await setMasterPassword(password);
      } else {
        const success = await unlock(password);
        if (!success) {
          setError('Incorrect master password');
          setTimeout(() => setError(''), 3000);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const heading = isCreating ? 'Welcome to MSec' : remoteVaultAvailable ? 'Restore your vault' : 'Unlock MSec';
  const subheading = remoteVaultAvailable
    ? 'We found an existing vault for this account. Enter the master password you use on your other devices.'
    : isCreating
      ? 'Choose a master password. It encrypts everything in your vault — and only you will ever know it.'
      : 'Enter your master password to access your vault.';

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gray-50 p-4 dark:bg-[#0F1115] transition-colors">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-2xl shadow-indigo-500/5 dark:border-slate-800 dark:bg-[#15191F]">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
            {isCreating ? <Key className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{heading}</h1>
          <p className="text-center text-sm text-gray-500 dark:text-slate-400">{subheading}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master password"
                autoFocus
                autoComplete={isCreating ? 'new-password' : 'current-password'}
                className={`${INPUT_CLASS} pr-12 ${error && !isCreating ? 'border-red-500 ring-2 ring-red-500/40' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Strength meter — only while choosing a new password */}
            {strength && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Strength: <span className="font-semibold">{strength.label}</span>
                  {password.length < 8 && ' — use at least 8 characters'}
                </p>
              </div>
            )}
          </div>

          {isCreating && (
            <>
              <div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm master password"
                  autoComplete="new-password"
                  className={`${INPUT_CLASS} ${mismatch ? 'border-red-500 ring-2 ring-red-500/40' : ''}`}
                />
                {mismatch && (
                  <p className="mt-1 text-xs font-medium text-red-500">Passwords don't match</p>
                )}
                {!mismatch && confirm.length > 0 && password === confirm && (
                  <p className="mt-1 flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="mr-1 h-3 w-3" /> Passwords match
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-start space-x-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-indigo-600"
                />
                <span className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
                  I understand that MSec cannot recover this password. If I forget it, my vault
                  cannot be unlocked by anyone — including me.
                </span>
              </label>
            </>
          )}

          {error && (
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || (isCreating && !canCreate)}
            className="w-full rounded-md bg-indigo-600 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Encrypting…' : isCreating ? 'Create vault' : 'Unlock vault'}
          </button>
        </form>

        {isCreating && !currentUser && (
          <div className="mt-8 flex flex-col items-center space-y-3 border-t border-gray-100 pt-6 dark:border-slate-800">
            <p className="text-center text-xs text-gray-500 dark:text-slate-400">
              Already use MSec on another device?
            </p>
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="flex items-center space-x-2 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              <Cloud className="h-4 w-4 opacity-70" />
              <span>Sign in to restore your vault</span>
            </button>
          </div>
        )}

        {!isCreating && (
          <div className="mt-8 flex flex-col items-center space-y-4 border-t border-gray-100 pt-6 dark:border-slate-800">
            <button
              type="button"
              onClick={() => unlockWithBiometric()}
              className="flex items-center space-x-2 rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800/50"
            >
              <Fingerprint className="h-5 w-5 opacity-50" />
              <span>Use biometric</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
