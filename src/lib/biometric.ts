/*
 * Biometric unlock — Android fingerprint/face, Windows Hello, Touch ID.
 *
 * Biometrics cannot reproduce your master password, so we use WebAuthn's PRF
 * extension: the authenticator deterministically derives a secret that only it
 * can produce, and only after a successful biometric check. We use that secret
 * to encrypt (wrap) the vault key. Result:
 *
 *   - the wrapped key on disk is useless without the authenticator
 *   - the authenticator's secret is useless without the wrapped key
 *   - neither the OS nor MSec ever sees the master password again
 *
 * If PRF isn't supported we refuse to enrol rather than fall back to something
 * weaker like storing the key in plain localStorage behind a "user present"
 * check — that would put your whole vault one disk-read away from exposure.
 */

import { importVaultKey, verifyVaultKey, type KdfConfig } from './crypto';

const LS_BIO = 'msec_bio';
const RP_NAME = 'MSec';
const IV_BYTES = 12;
// Fixed salt: PRF output must be reproducible across sessions for this vault.
const PRF_SALT = new TextEncoder().encode('msec-biometric-unlock-v1');

export interface BiometricResult {
  ok: boolean;
  key?: CryptoKey;
  error?: string;
}

interface BiometricRecord {
  v: 1;
  credentialId: string; // base64
  wrappedKey: string; // base64(iv || ciphertext) of the raw vault key
  label?: string;
  createdAt: number;
}

// ---------- helpers ----------

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

export function readBiometricRecord(): BiometricRecord | null {
  try {
    const raw = localStorage.getItem(LS_BIO);
    return raw ? (JSON.parse(raw) as BiometricRecord) : null;
  } catch {
    return null;
  }
}

export function biometricEnrolled(): boolean {
  return !!readBiometricRecord();
}

export function disableBiometric(): void {
  localStorage.removeItem(LS_BIO);
}

/** Is a platform authenticator (fingerprint / face / Hello) present? */
export async function biometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Turn a PRF output into an AES-GCM wrapping key. */
async function wrappingKeyFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  // HKDF gives a clean domain-separated key even if the PRF output is reused.
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: PRF_SALT as BufferSource },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Enrol this device's biometrics. Requires the raw vault key, which the caller
 * obtains by asking for the master password again — deliberate re-authentication
 * before granting a new way in.
 */
export async function enrolBiometric(rawVaultKey: Uint8Array, accountLabel: string): Promise<BiometricResult> {
  if (!(await biometricAvailable())) {
    return { ok: false, error: 'No fingerprint, face or Windows Hello sensor is available on this device.' };
  }

  try {
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: RP_NAME, id: window.location.hostname },
        user: { id: userId, name: accountLabel || 'MSec vault', displayName: accountLabel || 'MSec vault' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!cred) return { ok: false, error: 'Enrolment was cancelled.' };

    const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
    if (!ext.prf?.enabled) {
      return {
        ok: false,
        error: 'This device or browser does not support the WebAuthn PRF extension, which MSec needs to protect your vault key. Try Chrome/Edge on Windows or Android.',
      };
    }

    // Some authenticators only return PRF results on assertion, not creation.
    let prfOutput = ext.prf.results?.first;
    if (!prfOutput) {
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: cred.rawId }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      const aExt = assertion?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined;
      prfOutput = aExt?.prf?.results?.first;
    }
    if (!prfOutput) return { ok: false, error: 'The authenticator did not return a PRF secret, so biometric unlock cannot be enabled.' };

    const wrapKey = await wrappingKeyFromPrf(prfOutput);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, rawVaultKey as BufferSource);
    const blob = new Uint8Array(IV_BYTES + ct.byteLength);
    blob.set(iv, 0);
    blob.set(new Uint8Array(ct), IV_BYTES);

    const record: BiometricRecord = {
      v: 1,
      credentialId: toB64(cred.rawId),
      wrappedKey: toB64(blob),
      label: accountLabel,
      createdAt: Date.now(),
    };
    localStorage.setItem(LS_BIO, JSON.stringify(record));
    return { ok: true };
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') return { ok: false, error: 'Enrolment was cancelled or timed out.' };
    return { ok: false, error: e?.message || 'Biometric enrolment failed.' };
  }
}

/**
 * Unlock using biometrics. Returns the vault key, or an error message.
 */
export async function unlockWithBiometric(config: KdfConfig): Promise<BiometricResult> {
  const record = readBiometricRecord();
  if (!record) return { ok: false, error: 'Biometric unlock is not set up on this device.' };

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64(record.credentialId) as BufferSource }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return { ok: false, error: 'Biometric check was cancelled.' };

    const ext = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
    const prfOutput = ext.prf?.results?.first;
    if (!prfOutput) return { ok: false, error: 'The authenticator did not return the expected secret. Use your master password.' };

    const wrapKey = await wrappingKeyFromPrf(prfOutput);
    const blob = fromB64(record.wrappedKey);
    const iv = blob.slice(0, IV_BYTES);
    const ct = blob.slice(IV_BYTES);

    let rawKey: ArrayBuffer;
    try {
      rawKey = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, wrapKey, ct as BufferSource);
    } catch {
      return { ok: false, error: 'Stored key could not be unwrapped. Unlock with your master password and re-enable biometrics.' };
    }

    const key = await importVaultKey(new Uint8Array(rawKey));
    if (!(await verifyVaultKey(key, config))) {
      return { ok: false, error: 'The unwrapped key does not match this vault. Re-enable biometrics after unlocking.' };
    }
    return { ok: true, key };
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') return { ok: false, error: 'Biometric check was cancelled or timed out.' };
    return { ok: false, error: e?.message || 'Biometric unlock failed.' };
  }
}
