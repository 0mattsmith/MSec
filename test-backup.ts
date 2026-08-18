// Backup round-trip, wrong-password rejection, and tamper detection.
import { createKdfConfig } from './src/lib/crypto';
import { createBackup, restoreBackup, inspectBackup } from './src/lib/backup';

async function main() {
  const password = 'family master password';
  const { config, key } = await createKdfConfig(password);
  const vault = {
    items: [{ id: '1', title: 'Bank', password: 'super-secret' }, { id: '2', title: 'Email' }],
    folders: [{ id: 'f1', name: 'Personal' }],
    maskedEmails: [],
    workspaces: [{ id: 'w1', name: 'Home', widgets: [] }],
  };

  const file = await createBackup(key, config, vault as any, '0.1.4');
  if (file.includes('super-secret') || file.includes('Bank')) throw new Error('FAIL: plaintext leaked into backup');
  console.log('PASS: backup file contains no plaintext');

  const meta = inspectBackup(file);
  if (!meta.ok || meta.file?.itemCount !== 2) throw new Error('FAIL: inspect gave wrong metadata');
  console.log('PASS: backup inspectable without the password (2 items, no decryption)');

  const restored = await restoreBackup(file, password);
  if (!restored.ok) throw new Error('FAIL: correct password rejected: ' + restored.error);
  if ((restored.payload!.items[0] as any).password !== 'super-secret') throw new Error('FAIL: data mismatch');
  if (restored.payload!.workspaces?.length !== 1) throw new Error('FAIL: dashboard workspaces lost');
  console.log('PASS: restores items, folders and dashboard workspaces intact');

  const wrong = await restoreBackup(file, 'not the password');
  if (wrong.ok) throw new Error('FAIL: wrong password accepted');
  console.log('PASS: wrong master password rejected —', wrong.error?.slice(0, 45) + '…');

  // Tamper with the ciphertext
  const parsed = JSON.parse(file);
  parsed.payload = parsed.payload.slice(0, -8) + 'AAAAAAA=';
  const tampered = await restoreBackup(JSON.stringify(parsed), password);
  if (tampered.ok) throw new Error('FAIL: tampered backup restored');
  console.log('PASS: altered backup refused —', tampered.error?.slice(0, 45) + '…');

  const notBackup = await restoreBackup('{"hello":"world"}', password);
  if (notBackup.ok) throw new Error('FAIL: junk file accepted');
  console.log('PASS: non-backup file rejected cleanly');
  console.log('\nEncrypted backup verified.');
}
main().catch(e => { console.error(e); process.exit(1); });
