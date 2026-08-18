/*
 * Encrypted vault backup (.msecvault).
 *
 * The file carries the vault's key-derivation settings alongside the
 * ciphertext, so it can be restored on any device with just the master
 * password that was in use when it was made. It is safe to store in cloud
 * storage or email to yourself: without that password it is meaningless.
 *
 * There is deliberately no recovery path. A backup you cannot decrypt is not
 * a backup, so the file records which master password era it belongs to via
 * the verifier — restore fails cleanly rather than producing garbage.
 */

import {
  encryptJson, decryptJson, unlockVaultKey, type KdfConfig,
} from './crypto';

export const BACKUP_EXTENSION = '.msecvault';
const BACKUP_FORMAT = 'msec-vault-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  v: 1;
  createdAt: string;
  appVersion: string;
  itemCount: number; // for display before decrypting; reveals nothing sensitive
  kdf: KdfConfig;
  payload: string; // AES-GCM encrypted vault contents
}

export interface VaultPayload {
  items: unknown[];
  folders: unknown[];
  maskedEmails: unknown[];
  workspaces?: unknown[];
}

/** Build a backup file from the unlocked vault. */
export async function createBackup(
  key: CryptoKey,
  kdf: KdfConfig,
  payload: VaultPayload,
  appVersion: string,
): Promise<string> {
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    v: 1,
    createdAt: new Date().toISOString(),
    appVersion,
    itemCount: payload.items?.length ?? 0,
    kdf,
    payload: await encryptJson(key, payload),
  };
  return JSON.stringify(file, null, 2);
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  payload?: VaultPayload;
  kdf?: KdfConfig;
  createdAt?: string;
}

/** Parse a backup without decrypting — used to show details before restoring. */
export function inspectBackup(text: string): { ok: boolean; error?: string; file?: BackupFile } {
  try {
    const file = JSON.parse(text) as BackupFile;
    if (file?.format !== BACKUP_FORMAT) {
      return { ok: false, error: 'That file is not an MSec backup.' };
    }
    if (!file.kdf?.salt || !file.kdf?.verifier || !file.payload) {
      return { ok: false, error: 'The backup file is incomplete or corrupt.' };
    }
    return { ok: true, file };
  } catch {
    return { ok: false, error: 'The backup file could not be read.' };
  }
}

/** Decrypt a backup with the master password it was created under. */
export async function restoreBackup(text: string, masterPassword: string): Promise<RestoreResult> {
  const parsed = inspectBackup(text);
  if (!parsed.ok || !parsed.file) return { ok: false, error: parsed.error };

  const { kdf, payload } = parsed.file;
  const key = await unlockVaultKey(masterPassword, kdf);
  if (!key) {
    return {
      ok: false,
      error: 'That master password does not match this backup. Use the password that was set when the backup was made.',
    };
  }

  try {
    const data = await decryptJson<VaultPayload>(key, payload);
    return {
      ok: true,
      payload: {
        items: data.items ?? [],
        folders: data.folders ?? [],
        maskedEmails: data.maskedEmails ?? [],
        workspaces: data.workspaces ?? [],
      },
      kdf,
      createdAt: parsed.file.createdAt,
    };
  } catch {
    return { ok: false, error: 'The backup could not be decrypted — the file may have been altered.' };
  }
}

/** Trigger a browser download of the given text. */
export function downloadFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `MSec-backup-${d}${BACKUP_EXTENSION}`;
}
