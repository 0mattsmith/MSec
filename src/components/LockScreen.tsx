import React, { useState } from 'react';
import { useVault } from '../store/VaultContext';
import { Lock, Fingerprint, Key, Eye, EyeOff } from 'lucide-react';

export function LockScreen() {
  const { unlock, unlockWithBiometric, masterPasswordSet, setMasterPassword } = useVault();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (!masterPasswordSet) {
        await setMasterPassword(password);
      } else {
        const success = await unlock(password);
        if (!success) {
          setError(true);
          setTimeout(() => setError(false), 2000);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 dark:bg-[#0F1115] transition-colors">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl shadow-indigo-500/5 dark:bg-[#15191F] border border-gray-100 dark:border-slate-800">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
            {masterPasswordSet ? <Lock className="h-8 w-8" /> : <Key className="h-8 w-8" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {masterPasswordSet ? 'Unlock MSec' : 'Welcome to MSec'}
          </h1>
          <p className="text-center text-sm text-gray-500 dark:text-slate-400">
            {masterPasswordSet 
              ? 'Enter your master password to access your vault.' 
              : 'Create a master password. This is the only way to access your data.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master Password"
                className={`w-full rounded-md border bg-gray-50 px-4 py-3 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-[#1A1F26] dark:text-white dark:focus:border-indigo-400 ${
                  error ? 'border-red-500 ring-1 ring-red-500 text-red-500' : ''
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-red-500">Incorrect master password</p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-indigo-600 py-3 font-bold text-sm uppercase tracking-wider text-white transition-all hover:bg-indigo-500 active:scale-95 shadow-lg shadow-indigo-500/20 disabled:opacity-60 disabled:cursor-wait"
          >
            {busy ? 'Decrypting…' : masterPasswordSet ? 'Unlock Vault' : 'Create Vault'}
          </button>
        </form>

        {masterPasswordSet && (
          <div className="mt-8 flex flex-col items-center space-y-4 border-t border-gray-100 pt-6 dark:border-slate-800">
            <button type="button" onClick={() => unlockWithBiometric()} className="flex items-center space-x-2 rounded-md py-2 px-4 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800/50">
              <Fingerprint className="h-5 w-5 opacity-50" />
              <span>Use Biometric</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
