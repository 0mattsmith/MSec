/**
 * MSec crypto module — zero-knowledge vault encryption.
 *
 * Master password --PBKDF2-SHA256 (600k iters)--> AES-256-GCM vault key.
 * The key never leaves memory; only ciphertext touches localStorage/Firestore.
 * A "verifier" blob (known plaintext encrypted with the key) lets us check
 * the password on unlock without storing any hash of it.
 */

const KDF_ITERATIONS = 600_000; // OWASP 2023+ recommendation for PBKDF2-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFIER_PLAINTEXT = 'msec-verifier-v1';

export interface KdfConfig {
  v: 1;
  salt: string; // base64
  iterations: number;
  verifier: string; // base64(iv || ciphertext) of VERIFIER_PLAINTEXT
}

// ---------- base64 helpers ----------

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------- key derivation ----------

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['encrypt', 'decrypt'],
  );
}

// ---------- encrypt / decrypt ----------

export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), IV_BYTES);
  return toB64(out);
}

/** Throws (OperationError) on wrong key or tampered data. */
export async function decryptString(key: CryptoKey, blob: string): Promise<string> {
  const data = fromB64(blob);
  const iv = data.slice(0, IV_BYTES);
  const ct = data.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  return new TextDecoder().decode(pt);
}

export async function encryptJson(key: CryptoKey, data: unknown): Promise<string> {
  return encryptString(key, JSON.stringify(data));
}

export async function decryptJson<T>(key: CryptoKey, blob: string): Promise<T> {
  return JSON.parse(await decryptString(key, blob)) as T;
}

// ---------- vault key lifecycle ----------

/** Create a fresh KDF config + vault key for a new master password. */
export async function createKdfConfig(password: string): Promise<{ config: KdfConfig; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const verifier = await encryptString(key, VERIFIER_PLAINTEXT);
  return {
    config: { v: 1, salt: toB64(salt), iterations: KDF_ITERATIONS, verifier },
    key,
  };
}

/**
 * Derive the vault key from a password + stored config.
 * Returns null if the password is wrong (verifier fails to decrypt).
 */
export async function unlockVaultKey(password: string, config: KdfConfig): Promise<CryptoKey | null> {
  const key = await deriveKey(password, fromB64(config.salt), config.iterations);
  try {
    const check = await decryptString(key, config.verifier);
    return check === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    return null; // AES-GCM auth failure => wrong password
  }
}
