// Crypto round-trip test for MSec — run with: npm run test:crypto
import { createKdfConfig, unlockVaultKey, encryptJson, decryptJson, encryptString, decryptString } from './src/lib/crypto';

async function main() {
  const password = 'correct horse battery staple';

  // 1. Create config + key
  const { config, key } = await createKdfConfig(password);
  console.log('KDF config:', { ...config, verifier: config.verifier.slice(0, 20) + '…' });
  if (config.iterations < 600_000) throw new Error('iterations too low');

  // 2. Unlock with correct password
  const key2 = await unlockVaultKey(password, config);
  if (!key2) throw new Error('FAIL: correct password rejected');
  console.log('PASS: correct password accepted');

  // 3. Wrong password rejected
  const bad = await unlockVaultKey('wrong-password', config);
  if (bad !== null) throw new Error('FAIL: wrong password accepted');
  console.log('PASS: wrong password rejected');

  // 4. JSON round-trip with the re-derived key
  const vault = { items: [{ id: '1', title: 'Gmail', password: 's3cret!' }], folders: [] };
  const blob = await encryptJson(key, vault);
  if (blob.includes('s3cret') || blob.includes('Gmail')) throw new Error('FAIL: plaintext leaked in blob');
  const back = await decryptJson<typeof vault>(key2, blob);
  if (JSON.stringify(back) !== JSON.stringify(vault)) throw new Error('FAIL: round-trip mismatch');
  console.log('PASS: encrypt/decrypt round-trip (cross-key: original encrypt, re-derived decrypt)');

  // 5. Tamper detection
  const tampered = blob.slice(0, -8) + 'AAAAAAA=';
  let threw = false;
  try { await decryptString(key, tampered); } catch { threw = true; }
  if (!threw) throw new Error('FAIL: tampered blob decrypted');
  console.log('PASS: tampered ciphertext rejected (GCM auth)');

  // 6. Unique IVs
  const a = await encryptString(key, 'same');
  const b = await encryptString(key, 'same');
  if (a === b) throw new Error('FAIL: IV reuse');
  console.log('PASS: unique IV per encryption');

  console.log('\nAll crypto tests passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
