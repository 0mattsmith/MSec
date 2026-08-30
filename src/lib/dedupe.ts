/*
 * Spotting things you already have, before importing them again.
 *
 * There is no universal ID for a credential, so identity is worked out per
 * type, strongest signal first:
 *
 *   1. MSec UUID   — for vaults transferred between MSec instances the item
 *                    keeps its own id, so a re-import is recognised exactly,
 *                    however the entry has since been renamed or edited.
 *   2. externalId  — the ID the exporting app used. If we've seen it before,
 *                    this is definitively the same record.
 *   3. TOTP secret — the shared secret *is* the account. Two entries with the
 *                    same secret generate identical codes, so they are the
 *                    same second factor whatever they're called.
 *   4. domain + username — the practical identity of a login. Subdomains and
 *                    "www." are ignored so github.com and www.github.com match.
 *   5. card number, or note title — for non-login types.
 *
 * "Duplicate" is deliberately strict: every meaningful field must match. Near
 * misses are reported as "similar" and stay ticked, because two entries for the
 * same site are usually two real accounts, not a mistake — and quietly skipping
 * a genuine entry is far worse than importing one you can delete in a second.
 * Nothing is ever dropped or overwritten without the user choosing it.
 */

import type { VaultItem } from '../types';

export type MatchKind = 'new' | 'duplicate' | 'similar';

export interface ClassifiedItem<T> {
  item: T;
  kind: MatchKind;
  existing?: VaultItem;
  reason?: string;
  /** Which fields differ from the existing item (for 'similar'). */
  differences?: string[];
  /** Pre-ticked in the review UI: everything except exact duplicates. */
  selected: boolean;
}

export interface ImportAnalysis<T> {
  entries: ClassifiedItem<T>[];
  newCount: number;
  duplicateCount: number;
  similarCount: number;
}

/** Strip protocol, "www.", path and port so URL variants compare equal. */
export function normaliseHost(url?: string): string {
  if (!url) return '';
  let host = url.trim().toLowerCase();
  try {
    host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
  } catch {
    host = host.replace(/^https?:\/\//, '').split('/')[0];
  }
  return host.replace(/^www\./, '').replace(/:\d+$/, '');
}

/** Base32 secrets vary in padding and case but mean the same thing. */
export function normaliseSecret(secret?: string): string {
  return (secret || '').replace(/[\s=]/g, '').toUpperCase();
}

/**
 * Identity keys for an item — several, because a match on any one of them
 * means we're probably looking at the same thing.
 */
export function fingerprints(item: Partial<VaultItem> & { externalId?: string }): string[] {
  const keys: string[] = [];

  // An MSec id travels with the item between instances, so it is the most
  // reliable signal we have — better than any heuristic.
  if (item.id) keys.push(`uuid:${item.id}`);
  if (item.externalId) keys.push(`ext:${item.externalId}`);

  const secret = normaliseSecret(item.totpSecret);
  if (secret) keys.push(`totp:${secret}`);

  const host = normaliseHost(item.url);
  const user = (item.username || item.email || '').trim().toLowerCase();
  if (host && user) keys.push(`login:${host}|${user}`);
  else if (host) keys.push(`login:${host}|`);
  else if (user && item.title) keys.push(`login:${item.title.trim().toLowerCase()}|${user}`);

  if (item.cardNumber) {
    const digits = item.cardNumber.replace(/\D/g, '');
    if (digits.length >= 4) keys.push(`card:${digits.slice(-4)}`);
  }

  if (item.type === 'note' && item.title) keys.push(`note:${item.title.trim().toLowerCase()}`);

  return keys;
}

/** Fields that make one entry meaningfully different from another. */
const COMPARED_FIELDS: (keyof VaultItem)[] = [
  'title', 'username', 'email', 'password', 'url', 'notes', 'totpSecret', 'type',
  'app', 'cardNumber', 'cardExpiry', 'cardCvv', 'cardPin', 'cardholderName',
  'bankName', 'cardIssuer', 'cardSortCode', 'cardAccount',
  'firstName', 'lastName', 'phone', 'address',
];

const FIELD_LABELS: Partial<Record<keyof VaultItem, string>> = {
  title: 'name', username: 'username', email: 'email', password: 'password',
  url: 'website', notes: 'notes', totpSecret: '2FA secret', type: 'item type',
  cardNumber: 'card number', cardExpiry: 'expiry', cardCvv: 'CVV',
  cardholderName: 'cardholder', phone: 'phone', address: 'address',
};

function fieldValue(item: Partial<VaultItem>, field: keyof VaultItem): string {
  const raw = (item as any)[field];
  if (raw === undefined || raw === null) return '';
  const value = String(raw).trim();
  // Compare these case-insensitively; a password's case is significant.
  if (field === 'url') return normaliseHost(value);
  if (field === 'username' || field === 'email') return value.toLowerCase();
  if (field === 'totpSecret') return normaliseSecret(value);
  if (field === 'cardNumber') return value.replace(/\D/g, '');
  return value;
}

/** Every compared field identical? */
function listDifferences(incoming: Partial<VaultItem>, existing: VaultItem): string[] {
  const diffs: string[] = [];
  for (const field of COMPARED_FIELDS) {
    if (fieldValue(incoming, field) !== fieldValue(existing, field)) {
      diffs.push(FIELD_LABELS[field] || String(field));
    }
  }
  return diffs;
}

/**
 * Compare a batch of incoming items against the vault (and against each
 * other, so a file containing the same entry twice is caught too).
 */
export function analyseImport<T extends Partial<VaultItem> & { externalId?: string }>(
  incoming: T[],
  existingItems: VaultItem[],
): ImportAnalysis<T> {
  // Index the vault by every fingerprint each item answers to.
  const index = new Map<string, VaultItem>();
  for (const item of existingItems) {
    if (item.deletedAt) continue; // trashed items shouldn't block a re-import
    for (const key of fingerprints(item)) {
      if (!index.has(key)) index.set(key, item);
    }
  }

  const entries: ClassifiedItem<T>[] = [];
  let newCount = 0;
  let duplicateCount = 0;
  let similarCount = 0;

  for (const candidate of incoming) {
    const keys = fingerprints(candidate);
    let match: VaultItem | undefined;
    for (const key of keys) {
      const hit = index.get(key);
      if (hit) { match = hit; break; }
    }

    if (!match) {
      entries.push({ item: candidate, kind: 'new', selected: true });
      newCount++;
      // Register it so a second copy inside the same file is caught as well.
      const placeholder = { ...(candidate as any), id: `pending-${entries.length}` } as VaultItem;
      for (const key of keys) if (!index.has(key)) index.set(key, placeholder);
      continue;
    }

    const differences = listDifferences(candidate, match);

    if (differences.length === 0) {
      entries.push({
        item: candidate,
        kind: 'duplicate',
        existing: match,
        reason: 'Every field matches an entry you already have',
        selected: false,
      });
      duplicateCount++;
    } else {
      const shown = differences.slice(0, 3).join(', ');
      entries.push({
        item: candidate,
        kind: 'similar',
        existing: match,
        differences,
        reason: `Similar to "${match.title}" — different ${shown}${differences.length > 3 ? ` and ${differences.length - 3} more` : ''}`,
        selected: true,
      });
      similarCount++;
    }
  }

  return { entries, newCount, duplicateCount, similarCount };
}
