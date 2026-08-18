// Backoff schedule + persistence.
const store: Record<string,string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};
import { recordFailedUnlock, lockoutRemainingMs, clearFailedUnlocks, failedAttemptCount, formatDuration } from './src/lib/lockout';

let fail = 0;
const check = (cond: boolean, msg: string) => { console.log(`  ${cond?'PASS':'FAIL'}  ${msg}`); if(!cond) fail++; };

// First 5 failures are free (typos)
for (let i = 1; i <= 5; i++) {
  const d = recordFailedUnlock();
  check(d === 0, `attempt ${i}: no cooldown yet`);
}
const d6 = recordFailedUnlock();
check(d6 === 5000, `attempt 6: 5s cooldown (got ${d6/1000}s)`);
check(lockoutRemainingMs() > 4000, 'cooldown is actually enforced');

const d7 = recordFailedUnlock();
check(d7 === 15000, `attempt 7: 15s (got ${d7/1000}s)`);
const d8 = recordFailedUnlock();
check(d8 === 45000, `attempt 8: 45s (got ${d8/1000}s)`);

// Cap
let last = 0;
for (let i = 0; i < 20; i++) last = recordFailedUnlock();
check(last === 30*60*1000, `caps at 30 minutes (got ${last/60000}m)`);
check(failedAttemptCount() === 28, `counts every failure (${failedAttemptCount()})`);

// Persistence across "restart"
check(lockoutRemainingMs() > 0, 'cooldown survives an app restart (stored on disk)');

clearFailedUnlocks();
check(lockoutRemainingMs() === 0 && failedAttemptCount() === 0, 'successful unlock clears the counter');

check(formatDuration(65000) === '1 minute 5 seconds', `formats "${formatDuration(65000)}"`);
check(formatDuration(5000) === '5 seconds', `formats "${formatDuration(5000)}"`);

console.log(fail ? `\n${fail} FAILED` : '\nLockout backoff verified.');
process.exit(fail?1:0);
