/*
 * The master-password reuse guard.
 *
 * Firebase authenticates by POSTing the password to Google. That is fine for an
 * account password and fatal for the master password: Google would end up
 * holding the key to the vault it is storing, and MSec would be zero-knowledge
 * in name only. Reusing a password is the most natural thing a person can do,
 * so this is enforced in code, and the enforcement is worth a test.
 */
import { createKdfConfig } from './src/lib/crypto';
import { isMasterPassword } from './src/lib/emailauth';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const MASTER = 'correct horse battery staple';
const { config } = await createKdfConfig(MASTER);

// --- The case that matters ---
check(await isMasterPassword(MASTER, config) === true,
  'the master password is recognised and would be refused');

// --- Must not block legitimate account passwords ---
check(await isMasterPassword('a completely different password', config) === false,
  'an unrelated password is allowed through');
check(await isMasterPassword(MASTER + '!', config) === false,
  'a near-miss is allowed (only an exact match is the master password)');
check(await isMasterPassword(MASTER.toUpperCase(), config) === false,
  'case differences are allowed through');

// --- Degenerate input must not throw or produce a false positive ---
check(await isMasterPassword('', config) === false, 'empty candidate is not a match');
check(await isMasterPassword(MASTER, null) === false,
  'no vault yet means nothing to collide with');
check(await isMasterPassword('x', { v: 1, salt: 'not-base64!!', iterations: 600000, verifier: 'junk' } as any) === false,
  'a corrupt KDF config fails closed rather than throwing');

// --- A second vault has its own salt, so the same password verifies only against its own ---
const { config: other } = await createKdfConfig(MASTER);
check(other.salt !== config.salt, 'each vault gets a distinct salt');
check(await isMasterPassword(MASTER, other) === true,
  'the guard follows the vault it is given, not a cached key');

console.log(fail ? `\n${fail} FAILED` : '\nMaster-password reuse guard verified.');
process.exit(fail?1:0);
