// Simulates: device A creates vault -> publishes KDF -> device B adopts it
import { createKdfConfig, unlockVaultKey, encryptJson, decryptJson } from './src/lib/crypto';

async function main() {
  const password = 'family shared master pw';

  // Device A: create vault, encrypt an item, publish KDF config (what Firestore stores)
  const { config, key: keyA } = await createKdfConfig(password);
  const published = { v: 1 as const, salt: config.salt, iterations: config.iterations, verifier: config.verifier };
  const blob = await encryptJson(keyA, { id: '1', title: 'Bank', password: 'p@ss' });

  // Device B (fresh install, no localStorage): adopts published config
  const keyB = await unlockVaultKey(password, published);
  if (!keyB) throw new Error('FAIL: device B rejected the correct master password');
  const item = await decryptJson<any>(keyB, blob);
  if (item.password !== 'p@ss') throw new Error('FAIL: device B decrypted wrong data');
  console.log('PASS: fresh device decrypts vault synced from another device');

  // Wrong password on device B still rejected
  if (await unlockVaultKey('wrong', published) !== null) throw new Error('FAIL: wrong password accepted');
  console.log('PASS: wrong master password still rejected on restore');

  // Regression: old behaviour (generating a new salt) must NOT decrypt
  const { key: keyBad } = await createKdfConfig(password);
  let failed = false;
  try { await decryptJson(keyBad, blob); } catch { failed = true; }
  if (!failed) throw new Error('FAIL: independent salt decrypted - test invalid');
  console.log('PASS: confirms the old bug (new salt) could not decrypt - fix is necessary');
  console.log('\nMulti-device restore verified.');
}
main().catch(e => { console.error(e); process.exit(1); });
