// Verifies the key-wrapping half of biometric unlock (the PRF secret itself
// needs real hardware, so we substitute a fixed 32-byte secret here).
import { createKdfConfig, deriveRawVaultKey, importVaultKey, verifyVaultKey, encryptJson, decryptJson } from './src/lib/crypto';

const IV = 12;
async function wrapKeyFrom(secret: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('msec-biometric-unlock-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function main() {
  const password = 'a strong master password';
  const { config, key } = await createKdfConfig(password);
  const secret = await encryptJson(key, { note: 'a secret item' });

  // Enrol: get raw key, wrap under the authenticator-derived secret
  const raw = await deriveRawVaultKey(password, config);
  if (!raw) throw new Error('FAIL: correct password rejected');
  console.log('PASS: raw vault key derived for enrolment');

  const prf = crypto.getRandomValues(new Uint8Array(32));
  const wk = await wrapKeyFrom(prf);
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wk, raw));

  // Unlock: same PRF secret unwraps
  const wk2 = await wrapKeyFrom(prf);
  const unwrapped = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wk2, ct));
  const vaultKey = await importVaultKey(unwrapped);
  if (!(await verifyVaultKey(vaultKey, config))) throw new Error('FAIL: unwrapped key failed verifier');
  console.log('PASS: unwrapped key verified against the vault');

  const back = await decryptJson<any>(vaultKey, secret);
  if (back.note !== 'a secret item') throw new Error('FAIL: cannot decrypt vault data');
  console.log('PASS: biometric-unwrapped key decrypts real vault data');

  // A different authenticator secret must fail
  const wrongPrf = crypto.getRandomValues(new Uint8Array(32));
  let threw = false;
  try { await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await wrapKeyFrom(wrongPrf), ct); } catch { threw = true; }
  if (!threw) throw new Error('FAIL: wrong authenticator secret unwrapped the key');
  console.log('PASS: a different authenticator cannot unwrap the key');

  // Wrong master password never yields raw key
  if (await deriveRawVaultKey('wrong password', config) !== null) throw new Error('FAIL: wrong password enrolled');
  console.log('PASS: enrolment refuses an incorrect master password');
  console.log('\nBiometric key-wrapping verified.');
}
main().catch(e => { console.error(e); process.exit(1); });
