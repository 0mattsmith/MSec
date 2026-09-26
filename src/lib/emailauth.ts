/*
 * Email/password sign-in for Firebase.
 *
 * Useful for two reasons. It lets you use any email address rather than a
 * Google account, and it authenticates with a direct call to Google's identity
 * API — no popup, no OAuth client, no deep link, and no dependence on the
 * origin being in Firebase's authorised-domain list. That makes it the one
 * sign-in method that works identically on the web, in the desktop and Android
 * builds, and on a self-hosted instance reached at an IP address.
 *
 * ------------------------------------------------------------------
 * The account password must never be the master password.
 * ------------------------------------------------------------------
 *
 * Firebase authenticates by sending the password to Google. That is entirely
 * normal for an account password, and entirely fatal for the master password:
 * the whole premise of MSec is that the key never leaves the device, and typing
 * it into a form that POSTs to identitytoolkit.googleapis.com ends that in one
 * move. Google would hold the password that decrypts the vault it is storing.
 *
 * Reusing a password is the most natural thing in the world, so this is
 * enforced rather than advised: any candidate is tried against the vault's own
 * verifier first, and if it unlocks the vault it is refused.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from './firebase';
import { unlockVaultKey, type KdfConfig } from './crypto';

export interface EmailAuthResult {
  ok: boolean;
  error?: string;
  /** Set when an account was created and a verification mail went out. */
  verificationSent?: boolean;
}

export const MASTER_PASSWORD_REUSE =
  'That is your master password. It cannot also be your account password: ' +
  'signing in sends the password to Google, and your master password is the one ' +
  'thing that must never leave this device. Choose something different — a ' +
  'generated password is ideal, since you never need to type it from memory.';

/**
 * Would this password unlock the vault? If so it is the master password,
 * whatever the user believes they typed.
 *
 * Returns false when there is no vault yet — nothing to collide with — and on
 * any error, because a failure to check must not block sign-in outright.
 */
export async function isMasterPassword(candidate: string, kdf: KdfConfig | null): Promise<boolean> {
  if (!kdf || !candidate) return false;
  try {
    return (await unlockVaultKey(candidate, kdf)) !== null;
  } catch {
    return false;
  }
}

/** Firebase's codes, in words that say what to do about them. */
export function friendlyEmailError(e: any): string {
  switch (e?.code) {
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that address. Sign in instead, or reset the password.';
    case 'auth/weak-password':
      return 'Firebase requires at least 6 characters. Use considerably more than that.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      // Firebase deliberately conflates these so an attacker can't enumerate
      // accounts. Repeating that distinction here would undo it.
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Firebase has paused sign-in for this account for a while.';
    case 'auth/network-request-failed':
      return 'Could not reach Google. Check this device’s connection.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in isn’t enabled on this Firebase project. Turn it on under Authentication → Sign-in method.';
    case 'auth/user-disabled':
      return 'That account has been disabled in the Firebase console.';
    default:
      return e?.message ? String(e.message) : 'Sign-in failed.';
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  kdf: KdfConfig | null,
): Promise<EmailAuthResult> {
  if (await isMasterPassword(password, kdf)) {
    return { ok: false, error: MASTER_PASSWORD_REUSE };
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    let verificationSent = false;
    try {
      await sendEmailVerification(cred.user);
      verificationSent = true;
    } catch {
      // Not fatal: the Firestore rules gate on being signed in, not on a
      // verified address, so sync works either way.
    }
    return { ok: true, verificationSent };
  } catch (e: any) {
    return { ok: false, error: friendlyEmailError(e) };
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
  kdf: KdfConfig | null,
): Promise<EmailAuthResult> {
  // Checked on sign-in too, not just sign-up: an account created before this
  // guard existed could still be using the master password.
  if (await isMasterPassword(password, kdf)) {
    return { ok: false, error: MASTER_PASSWORD_REUSE };
  }
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: friendlyEmailError(e) };
  }
}

export async function resetEmailPassword(email: string): Promise<EmailAuthResult> {
  if (!email.trim()) return { ok: false, error: 'Enter your email address first.' };
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: friendlyEmailError(e) };
  }
}
