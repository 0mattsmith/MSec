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

/**
 * Where this build is deployed. The Docker image sets DEPLOY_TARGET=selfhosted.
 * It matters because a self-hosted copy is whatever version the operator last
 * pulled — reloading the page cannot change that, so offering "Reload to
 * update" would be a button that permanently does nothing.
 */
export const DEPLOY_TARGET: string =
  (typeof __DEPLOY_TARGET__ !== 'undefined' ? __DEPLOY_TARGET__ : 'web');

/** The command that actually updates a self-hosted instance. */
export const SELF_HOSTED_UPDATE_COMMAND = 'docker compose pull && docker compose up -d';

const SELF_HOSTED_UPDATE_HINT =
  'A container cannot update itself from the browser. Run ' +
  `"${SELF_HOSTED_UPDATE_COMMAND}" where MSec is hosted, then reload this page.`;

export function isSelfHosted(): boolean {
  return DEPLOY_TARGET === 'selfhosted';
}

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
    default: return isSelfHosted() ? 'How to update' : 'Reload to update';
  }
}

/*
 * Shown when GitHub has a newer release but it carries no signed manifest.
 * The cause is always the same: TAURI_SIGNING_PRIVATE_KEY was not set when the
 * release was built, so tauri-action skipped latest.json and the .sig files.
 */
const UPDATER_NOT_SIGNED =
  'This release was published without update signatures, so MSec will not ' +
  'install it automatically — it refuses to run an unverified binary. ' +
  'Opening the release page so you can install it by hand. (To fix it ' +
  'permanently: add TAURI_SIGNING_PRIVATE_KEY as a repository secret and ' +
  'cut a new release.)';

export interface UpdateProgress {
  stage: 'checking' | 'downloading' | 'installing' | 'restarting';
  /** 0–100 where known. */
  percent?: number;
}

/**
 * Desktop: download, verify the signature and install without leaving the app,
 * then relaunch into the new version. Returns null on success, or a message.
 *
 * The signature check is the point of the whole exercise — an unverified
 * self-installing binary would be a gift to anyone able to tamper with the
 * download.
 */
async function silentDesktopUpdate(onProgress?: (p: UpdateProgress) => void): Promise<string | null> {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    onProgress?.({ stage: 'checking' });

    const update = await check();
    if (!update) {
      // check() reads latest.json from the release. GitHub says a newer version
      // exists (that is why this ran at all), so the manifest being absent means
      // the release was built without a signing key — not that you are up to
      // date. Saying "no update available" here would be actively misleading.
      return UPDATER_NOT_SIGNED;
    }

    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event: any) => {
      if (event.event === 'Started') {
        total = event.data?.contentLength || 0;
        onProgress?.({ stage: 'downloading', percent: 0 });
      } else if (event.event === 'Progress') {
        downloaded += event.data?.chunkLength || 0;
        onProgress?.({
          stage: 'downloading',
          percent: total ? Math.min(99, Math.round((downloaded / total) * 100)) : undefined,
        });
      } else if (event.event === 'Finished') {
        onProgress?.({ stage: 'installing', percent: 100 });
      }
    });

    onProgress?.({ stage: 'restarting' });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
    return null;
  } catch (e: any) {
    return `Automatic update failed: ${e?.message || e}`;
  }
}

/**
 * Apply or start the update, however that works on this platform.
 * Returns an error message rather than throwing, so the UI can show what
 * went wrong instead of appearing to do nothing.
 */
/*
 * Opening the browser is a legitimate outcome on the web, and a failure
 * everywhere else: it means the in-app path broke and we quietly did something
 * worse instead. Returning null in that case is how a broken updater comes to
 * look like a deliberate design — it just sends you to a web page, forever,
 * saying nothing. So a fallback that follows a failure reports it.
 */
function fellBackTo(problems: string[]): string | null {
  if (problems.length === 0) return null;
  return 'Updating inside the app failed, so the download was opened in your browser ' +
    `instead — install it from there. Cause: ${problems.join('; ')}`;
}

export async function applyUpdate(
  info: UpdateInfo,
  platform: Platform,
  onProgress?: (p: UpdateProgress) => void,
): Promise<string | null> {
  // Desktop can update itself completely: verify, install, relaunch.
  if (platform === 'desktop-app') {
    const problem = await silentDesktopUpdate(onProgress);
    if (!problem) return null;
    // Signed updates may not be configured yet — fall back to the release page.
    window.open(info.url, '_blank', 'noopener,noreferrer');
    return problem;
  }

  if (platform === 'web' && isSelfHosted()) {
    // Nothing the page can do: a web page cannot pull a container image, and
    // sending the user to a release page full of desktop installers tells them
    // nothing useful. The UI shows the command instead - see SELF_HOSTED_UPDATE.
    return SELF_HOSTED_UPDATE_HINT;
  }

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
    return null;
  }

  const target = platform === 'android' && info.apkUrl ? info.apkUrl : info.url;
  const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
  const problems: string[] = [];

  // Android: download inside the app so the user isn't bounced to a browser,
  // then hand the file to the system installer. Android always shows its own
  // confirmation for sideloaded installs — that dialog cannot be skipped
  // without being a device-owner or Play Store install.
  if (platform === 'android' && info.apkUrl) {
    try {
      onProgress?.({ stage: 'downloading', percent: 0 });
      const { download } = await import('@tauri-apps/plugin-upload');
      const { appCacheDir, join } = await import('@tauri-apps/api/path');
      const dest = await join(await appCacheDir(), `MSec-${info.version}.apk`);

      let total = 0;
      let got = 0;
      await download(info.apkUrl, dest, (progress: any) => {
        total = progress.total || total;
        got += progress.progressTotal ?? progress.progress ?? 0;
        onProgress?.({
          stage: 'downloading',
          percent: total ? Math.min(99, Math.round((got / total) * 100)) : undefined,
        });
      });

      onProgress?.({ stage: 'installing', percent: 100 });
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(dest);
      return null;
    } catch (e: any) {
      problems.push(`in-app download: ${e?.message || e}`);
      // Fall through to the browser download below.
    }
  }

  // Inside the Tauri webview, window.open is intercepted and the link can
  // silently do nothing — the opener plugin hands the URL to the OS browser,
  // which then downloads the APK / installer as normal.
  if (isTauri) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(target);
      return fellBackTo(problems);
    } catch (e: any) {
      problems.push(`opener: ${e?.message || e}`);
    }
  }

  try {
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (opened) return fellBackTo(problems);
    problems.push('window.open was blocked');
  } catch (e: any) {
    problems.push(`window.open: ${e?.message || e}`);
  }

  // Last resort: navigate this window at the download. On Android the browser
  // takes over the download and the app stays running behind it.
  try {
    window.location.href = target;
    return fellBackTo(problems);
  } catch (e: any) {
    problems.push(`navigation: ${e?.message || e}`);
  }

  return `Could not open the download. ${problems.join('; ')}. You can get it manually from ${info.url}`;
}

declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
  // eslint-disable-next-line no-var
  var __DEPLOY_TARGET__: string;
}
