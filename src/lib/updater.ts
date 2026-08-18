/*
 * In-app update checking.
 *
 * Asks GitHub for the newest published release and compares it with the
 * version this build was compiled from. Deliberately read-only and anonymous:
 * no account, no telemetry, nothing sent about you — just a GET for the tag.
 *
 * Installing differs by platform:
 *   - Android : download the APK from the release (Tauri can't self-update APKs)
 *   - Desktop : open the release page for the right installer
 *   - Web/PWA : the service worker already fetched it; reload applies it
 */

// The /latest endpoint only returns *published* releases and 404s when there
// are none, so query the list and pick the newest usable one ourselves.
const RELEASES_API = 'https://api.github.com/repos/0mattsmith/MSec/releases?per_page=10';
const RELEASES_PAGE = 'https://github.com/0mattsmith/MSec/releases/latest';
const LS_LAST_CHECK = 'msec_update_check';
const LS_SKIPPED = 'msec_update_skipped';

/** Injected at build time from package.json (see vite.config.ts). */
export const APP_VERSION: string =
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0');

export interface UpdateInfo {
  version: string;
  notes: string;
  url: string;
  apkUrl?: string;
  publishedAt: string;
}

export type Platform = 'android' | 'ios' | 'desktop-app' | 'web';

export function detectPlatform(): Platform {
  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return isTauri ? 'android' : 'web';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return isTauri ? 'desktop-app' : 'web';
}

/** Compare semver-ish strings. Returns >0 if a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split(/[.\-+]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  return (a1 - b1) || (a2 - b2) || (a3 - b3);
}

/**
 * Check for a newer release. Returns null when up to date, on network
 * failure, or when the user has skipped that version.
 */
export async function checkForUpdate(options: { force?: boolean } = {}): Promise<UpdateInfo | null> {
  try {
    // Don't hammer the API (or the user's mobile data) on every launch.
    if (!options.force) {
      const last = parseInt(localStorage.getItem(LS_LAST_CHECK) || '0', 10);
      if (Date.now() - last < 6 * 60 * 60 * 1000) return null;
    }
    localStorage.setItem(LS_LAST_CHECK, String(Date.now()));

    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;

    // Skip drafts (invisible to everyone but the repo owner) and pick the
    // highest version rather than trusting list order.
    const published = list.filter((r: any) => !r.draft && r.tag_name);
    if (published.length === 0) return null;
    const data = published.reduce((best: any, r: any) =>
      compareVersions(r.tag_name, best.tag_name) > 0 ? r : best, published[0]);

    const latest: string = (data.tag_name || '').replace(/^v/, '');
    if (!latest || compareVersions(latest, APP_VERSION) <= 0) return null;

    if (!options.force && localStorage.getItem(LS_SKIPPED) === latest) return null;

    const apkAsset = (data.assets || []).find((a: any) => /\.apk$/i.test(a.name));
    return {
      version: latest,
      notes: (data.body || '').slice(0, 500),
      url: data.html_url || RELEASES_PAGE,
      apkUrl: apkAsset?.browser_download_url,
      publishedAt: data.published_at,
    };
  } catch {
    return null; // offline or rate-limited: silently skip
  }
}

export function skipVersion(version: string): void {
  localStorage.setItem(LS_SKIPPED, version);
}

/** Human-readable action for the current platform. */
export function updateActionLabel(platform: Platform): string {
  switch (platform) {
    case 'android': return 'Download APK';
    case 'desktop-app': return 'Get the installer';
    case 'ios': return 'View release';
    default: return 'Reload to update';
  }
}

/** Apply or start the update, however that works on this platform. */
export async function applyUpdate(info: UpdateInfo, platform: Platform): Promise<void> {
  if (platform === 'web') {
    // The service worker caches a new build as soon as it sees one; asking it
    // to activate immediately and reloading is all that's needed.
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* ignore — plain reload still picks up a new build */
    }
    window.location.reload();
    return;
  }

  const target = platform === 'android' && info.apkUrl ? info.apkUrl : info.url;
  window.open(target, '_blank', 'noopener,noreferrer');
}

declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
}
