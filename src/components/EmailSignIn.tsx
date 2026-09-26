import React, { useState } from 'react';
import { Mail, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useVault } from '../store/VaultContext';

/*
 * Email/password sign-in, used on both the lock screen and in Settings.
 *
 * Collapsed by default: Google is one click, this is three fields, and most
 * people only want it when they have a reason to — a non-Google address, or a
 * platform where the OAuth flow can't run.
 */
export function EmailSignIn({ compact = false }: { compact?: boolean }) {
  const { signInWithEmailPassword, signUpWithEmailPassword, sendPasswordReset } = useVault();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const result = mode === 'up'
      ? await signUpWithEmailPassword(email, password)
      : await signInWithEmailPassword(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Sign-in failed.');
      return;
    }
    setPassword('');
    if (result.verificationSent) {
      setNotice('Account created. A verification email is on its way — sync works either way.');
    }
  };

  const reset = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await sendPasswordReset(email);
    setBusy(false);
    if (result.ok) setNotice('Password reset email sent.');
    else setError(result.error || 'Could not send the reset email.');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 underline-offset-2 hover:underline dark:text-slate-400"
      >
        <Mail className="h-3.5 w-3.5" />
        Use an email address instead
      </button>
    );
  }

  const input =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
    'placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 ' +
    'focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-[#1A1F26] dark:text-white ' +
    'dark:placeholder-slate-500';

  return (
    <form onSubmit={submit} className={`w-full space-y-2 ${compact ? 'max-w-sm' : ''}`}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@proton.me"
        autoComplete="username"
        required
        className={input}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === 'up' ? 'Choose an account password' : 'Account password'}
        autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
        required
        className={input}
      />

      {/*
        Stated up front rather than only enforced after the fact, so it reads as
        a design decision instead of a rejection.
      */}
      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
        This is <span className="font-semibold">not</span> your master password. Signing in sends it
        to Google; your master password never leaves this device. MSec will refuse them if they
        match.
      </p>

      {error && (
        <p className="flex items-start rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mr-1.5 mt-px h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <p className="flex items-start rounded-lg bg-emerald-50 p-2 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="mr-1.5 mt-px h-3.5 w-3.5 flex-shrink-0" />
          <span>{notice}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {mode === 'up' ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(''); setNotice(''); }}
          className="text-xs text-gray-500 underline-offset-2 hover:underline dark:text-slate-400"
        >
          {mode === 'up' ? 'I already have an account' : 'Create an account'}
        </button>
      </div>

      {mode === 'in' && (
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="text-[11px] text-gray-500 underline-offset-2 hover:underline disabled:opacity-60 dark:text-slate-400"
        >
          Forgot the account password?
        </button>
      )}
    </form>
  );
}
