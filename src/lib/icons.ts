/*
 * Choosing an icon for a vault entry.
 *
 * Four sources, in order of preference, and the order is a privacy decision as
 * much as a visual one:
 *
 *   1. custom   — one you picked. Stored in the vault, encrypted, never fetched.
 *   2. brand    — bundled offline mark, matched on domain. No network at all.
 *   3. favicon  — opt-in, off by default. See the warning below.
 *   4. letter   — a deterministic coloured tile. Always available, always free.
 *
 * On the favicon option: asking a third-party icon service for an icon tells
 * that service which sites you hold accounts on, tied to your IP, every time
 * you open your vault. That is precisely the inventory a password manager
 * exists to keep private, which is why services like Bitwarden run their own
 * icon servers rather than use Google's. MSec doesn't use an aggregator at all.
 * When the option is on it fetches from the site itself, so the only party that
 * learns anything is the site you already have an account with — and it learns
 * only that someone at your IP loaded its favicon.
 *
 * It is still off by default, because "no requests" is the only setting that
 * needs no explanation.
 */

import type { VaultItem } from '../types';
import { normaliseHost } from './dedupe';

export type IconKind = 'custom' | 'brand' | 'favicon' | 'letter';

export interface ResolvedIcon {
  kind: IconKind;
  /** data: URL for custom, https URL for favicon. */
  src?: string;
  /** SVG path data for a bundled brand mark. */
  path?: string;
  /** Hex colour without the leading #. */
  hex?: string;
  /** Up to two characters for the letter tile. */
  letter?: string;
  /** Tailwind-ready background for the letter tile. */
  background?: string;
}

/*
 * Tile colours. Picked for legible white text, and deliberately a short list —
 * the point is that one entry always looks the same, not that every entry looks
 * different.
 */
const TILE_COLOURS = [
  '#4f46e5', '#0891b2', '#059669', '#ca8a04', '#dc2626',
  '#9333ea', '#db2777', '#2563eb', '#ea580c', '#0d9488',
];

/** Stable hash, so an entry keeps its colour between sessions and devices. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function tileColour(seed: string): string {
  return TILE_COLOURS[hashString(seed || 'msec') % TILE_COLOURS.length];
}

/**
 * One or two characters to stand in for the entry.
 *
 * Taken from the title where there is one, because that is what the user reads
 * in the list; the host is the fallback so an untitled entry still gets
 * something stable rather than a question mark.
 */
export function initialsFor(item: Partial<VaultItem>): string {
  const title = (item.title || '').trim();
  if (title) {
    const words = title.split(/[\s._-]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return title.slice(0, 2).toUpperCase();
  }

  // From a host, take the first label only. Splitting on dots the way a title
  // is split turns monzo.com into "MC" — the M of monzo and the C of com.
  const host = iconDomain(item.url);
  if (host) return host.split('.')[0].slice(0, 2).toUpperCase();

  const fallback = (item.username || '?').trim();
  return fallback.slice(0, 2).toUpperCase();
}

/**
 * The domain a bundled icon would be keyed by.
 *
 * "www." and any deeper subdomain are stripped back to the registrable-ish
 * part, so mail.google.com and google.com reach the same mark. Two-part public
 * suffixes (.co.uk) are handled, which a naive "last two labels" split gets
 * wrong — it would turn tesco.co.uk into co.uk.
 */
export function iconDomain(url?: string): string {
  const host = normaliseHost(url);
  // Must actually look like a hostname. Without this, free text in the URL
  // field flows into https://<whatever>/favicon.ico and produces a request to
  // a nonsense address.
  if (!host || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const twoPartSuffixes = ['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.nz', 'co.jp', 'com.br'];
  const lastTwo = parts.slice(-2).join('.');
  return twoPartSuffixes.includes(lastTwo)
    ? parts.slice(-3).join('.')
    : lastTwo;
}

export interface IconOptions {
  /** Bundled marks, loaded lazily by the caller. */
  brands?: Record<string, { p: string; c: string }>;
  /** Whether the user has opted in to fetching favicons. */
  allowFavicon?: boolean;
}

export function resolveIcon(item: Partial<VaultItem>, options: IconOptions = {}): ResolvedIcon {
  const { brands, allowFavicon } = options;

  // 1. Whatever the user chose wins outright, and costs nothing to show.
  if (item.iconData) {
    return { kind: 'custom', src: item.iconData };
  }

  // 2. Bundled mark. Note that several of the largest brands — Amazon,
  // Microsoft, LinkedIn, Slack — are absent because the icon set removed them
  // at the trademark holders' request, so a letter tile for those is expected
  // rather than a failure.
  const domain = iconDomain(item.url);
  if (domain && brands) {
    const hit = brands[domain];
    if (hit) return { kind: 'brand', path: hit.p, hex: hit.c };
  }

  // 3. Favicon, only if asked for, and only straight from the site.
  if (allowFavicon && domain) {
    return { kind: 'favicon', src: `https://${domain}/favicon.ico` };
  }

  // 4. Always works, reveals nothing.
  const seed = domain || item.title || item.id || 'msec';
  return { kind: 'letter', letter: initialsFor(item), background: tileColour(seed) };
}
