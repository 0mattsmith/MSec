/*
 * Brute-force resistance for the unlock screen.
 *
 * PBKDF2 at 600k iterations already makes guessing slow, but that only helps
 * against someone attacking the encrypted blob offline. Someone holding an
 * unlocked-but-locked device can still tap away at guesses, so after a few
 * failures we impose a growing cooldown.
 *
 * The counter is stored on disk deliberately: clearing it by restarting the
 * app would make it pointless.
 */

const LS_ATTEMPTS = 'msec_failed_unlocks';
const FREE_ATTEMPTS = 5; // typos happen; don't punish the first few
const MAX_DELAY_MS = 30 * 60 * 1000; // half an hour

interface AttemptRecord {
  failures: number;
  lastFailureAt: number;
}

function read(): AttemptRecord {
  try {
    const raw = localStorage.getItem(LS_ATTEMPTS);
    if (!raw) return { failures: 0, lastFailureAt: 0 };
    const parsed = JSON.parse(raw) as AttemptRecord;
    return { failures: parsed.failures || 0, lastFailureAt: parsed.lastFailureAt || 0 };
  } catch {
    return { failures: 0, lastFailureAt: 0 };
  }
}

/** Cooldown after n failures: 5s, 15s, 45s, 2m, 7m … capped at 30m. */
function delayFor(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  const over = failures - FREE_ATTEMPTS;
  return Math.min(5000 * Math.pow(3, over - 1), MAX_DELAY_MS);
}

/** Milliseconds still to wait, or 0 if an attempt is allowed now. */
export function lockoutRemainingMs(): number {
  const { failures, lastFailureAt } = read();
  const wait = delayFor(failures);
  if (wait === 0) return 0;
  const elapsed = Date.now() - lastFailureAt;
  return Math.max(0, wait - elapsed);
}

export function recordFailedUnlock(): number {
  const rec = read();
  const updated: AttemptRecord = { failures: rec.failures + 1, lastFailureAt: Date.now() };
  localStorage.setItem(LS_ATTEMPTS, JSON.stringify(updated));
  return delayFor(updated.failures);
}

export function clearFailedUnlocks(): void {
  localStorage.removeItem(LS_ATTEMPTS);
}

export function failedAttemptCount(): number {
  return read().failures;
}

/** "1 minute 5 seconds" — for the countdown message. */
export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs} second${secs === 1 ? '' : 's'}`;
  if (secs === 0) return `${mins} minute${mins === 1 ? '' : 's'}`;
  return `${mins} minute${mins === 1 ? '' : 's'} ${secs} second${secs === 1 ? '' : 's'}`;
}
