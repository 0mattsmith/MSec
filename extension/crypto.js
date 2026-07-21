/*
 * MSec crypto (extension port) — identical scheme to the app's crypto.ts:
 * PBKDF2-SHA256 -> AES-256-GCM, verifier-based unlock. Zero-knowledge:
 * the master password and derived key never leave this device.
 */
const MSEC_VERIFIER_PLAINTEXT = 'msec-verifier-v1';
const MSEC_IV_BYTES = 12;

function msecToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function msecFromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function msecDeriveKeyRaw(password, saltB64, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: msecFromB64(saltB64), iterations },
    baseKey, 256);
  return new Uint8Array(bits);
}

async function msecImportKey(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function msecDecryptString(key, blob) {
  const data = msecFromB64(blob);
  const iv = data.slice(0, MSEC_IV_BYTES);
  const ct = data.slice(MSEC_IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function msecEncryptString(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(MSEC_IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const out = new Uint8Array(MSEC_IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), MSEC_IV_BYTES);
  return msecToB64(out);
}

/** Returns raw key bytes if the password is correct, else null. */
async function msecUnlock(password, kdfConfig) {
  const raw = await msecDeriveKeyRaw(password, kdfConfig.salt, kdfConfig.iterations);
  const key = await msecImportKey(raw);
  try {
    const check = await msecDecryptString(key, kdfConfig.verifier);
    return check === MSEC_VERIFIER_PLAINTEXT ? raw : null;
  } catch {
    return null;
  }
}
