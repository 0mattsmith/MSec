/*
 * Google sign-in for the native builds.
 *
 * The web build uses Firebase's signInWithPopup, which is fine in a real
 * browser tab. It does not work anywhere else we ship:
 *
 *   - Tauri desktop: the webview has no opener/postMessage channel back from
 *     the popup, so the promise never settles.
 *   - Android: Google refuses OAuth inside embedded WebViews outright
 *     (error disallowed_useragent), by policy, and has done for years.
 *
 * So the native builds do what RFC 8252 says a native app should: run the
 * authorisation code flow with PKCE in the *system* browser, and catch the
 * redirect back.
 *
 *   Desktop  redirect to http://127.0.0.1:<port>, caught by a one-shot
 *            listener in src-tauri (see oauth_start / oauth_await).
 *   Android  redirect to the reversed-client-ID custom scheme, caught by
 *            tauri-plugin-deep-link.
 *
 * The code is then exchanged for an ID token, which Firebase accepts via
 * signInWithCredential. The master password is never involved here: Google
 * only decides *which* encrypted blob is yours, never what is inside it.
 */

import { detectPlatform, type Platform } from './updater';
import oauthConfig from '../../oauth-config.json';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPES = 'openid email profile';

/** Matches the placeholders shipped in oauth-config.json. */
const PLACEHOLDER = /^PASTE_/;

export interface OAuthResult {
  ok: boolean;
  idToken?: string;
  error?: string;
}

// ---------- PKCE ----------

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * RFC 7636 code verifier: 43-128 characters from the unreserved set.
 * 32 random bytes base64url-encoded lands at 43, the minimum, which is what
 * Google's own libraries use.
 */
export function createVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** S256 challenge. Plain is allowed by the spec but not by us. */
export async function createChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function createState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/**
 * Google issues Android and iOS clients a redirect scheme that is the client
 * ID reversed: 123-abc.apps.googleusercontent.com becomes
 * com.googleusercontent.apps.123-abc. Deriving it rather than storing it
 * separately means the scheme and the client ID cannot drift apart.
 */
export function reversedClientScheme(clientId: string): string {
  const id = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${id}`;
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  nonce: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    state: params.state,
    nonce: params.nonce,
    // Always show the chooser: people self-hosting a password manager tend to
    // have more than one Google account and silently reusing the last one is
    // a nasty surprise.
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

/**
 * Pull code/state out of whatever the browser handed back — a full redirect
 * URL on Android, or a bare query string from the desktop listener.
 */
export function parseRedirect(raw: string, expectedState: string): { code?: string; error?: string } {
  let params: URLSearchParams;
  try {
    // Three shapes arrive here: a bare query string from the desktop listener,
    // a loopback URL, and Google's Android redirect - which is
    // "scheme:/oauth2redirect?..." with a *single* slash, so testing for "://"
    // silently misparses it. Taking everything after the first "?" covers all
    // three without caring about the scheme.
    const start = raw.indexOf('?');
    const query = (start >= 0 ? raw.slice(start + 1) : raw).split('#')[0];
    params = new URLSearchParams(query);
  } catch {
    return { error: 'The sign-in response could not be read.' };
  }

  const err = params.get('error');
  if (err) {
    return { error: err === 'access_denied' ? 'Sign-in was cancelled.' : `Google returned: ${err}` };
  }

  // A mismatched state means the response didn't come from the request we
  // started, so the code is not ours to use.
  if (params.get('state') !== expectedState) {
    return { error: 'Sign-in response did not match the request. Please try again.' };
  }

  const code = params.get('code');
  return code ? { code } : { error: 'Google did not return an authorisation code.' };
}

export async function exchangeCode(params: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}): Promise<OAuthResult> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    code_verifier: params.verifier,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });
  // Google issues "Desktop app" clients a secret and requires it here. RFC 8252
  // §8.5 is explicit that it isn't confidential — it ships inside the binary,
  // and PKCE is what actually protects the exchange.
  if (params.clientSecret) body.set('client_secret', params.clientSecret);

  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error_description || data?.error || `Token exchange failed (${res.status}).` };
    }
    if (!data.id_token) return { ok: false, error: 'Google did not return an ID token.' };
    return { ok: true, idToken: data.id_token };
  } catch (e: any) {
    return { ok: false, error: `Could not reach Google: ${e?.message || e}` };
  }
}

// ---------- Configuration ----------

interface ClientConfig { clientId: string; clientSecret?: string }

export function clientFor(platform: Platform): ClientConfig | null {
  const cfg: any = oauthConfig;
  const entry = platform === 'android' ? cfg.android : cfg.desktop;
  if (!entry?.clientId || PLACEHOLDER.test(entry.clientId)) return null;
  return { clientId: entry.clientId, clientSecret: entry.clientSecret && !PLACEHOLDER.test(entry.clientSecret) ? entry.clientSecret : undefined };
}

export function oauthConfigured(platform: Platform = detectPlatform()): boolean {
  return platform === 'web' || clientFor(platform) !== null;
}

const NOT_CONFIGURED =
  'Google sign-in is not set up for this build yet. Create an OAuth client in ' +
  'Google Cloud Console and fill in oauth-config.json — see SYNC.md. Your vault ' +
  'still works without it; sync is the only thing that needs an account.';

// ---------- Platform flows ----------

/**
 * Desktop: bind a loopback listener, send the system browser at Google, wait
 * for it to come back. Google permits loopback redirects for installed apps
 * precisely so that no custom scheme registration is needed.
 */
async function desktopFlow(client: ClientConfig): Promise<OAuthResult> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { openUrl } = await import('@tauri-apps/plugin-opener');

  let port: number;
  try {
    port = await invoke<number>('oauth_start');
  } catch (e: any) {
    return { ok: false, error: `Could not open a local listener for sign-in: ${e?.message || e}` };
  }

  const redirectUri = `http://127.0.0.1:${port}`;
  const verifier = createVerifier();
  const state = createState();
  const url = buildAuthUrl({
    clientId: client.clientId,
    redirectUri,
    challenge: await createChallenge(verifier),
    state,
    nonce: createState(),
  });

  try {
    await openUrl(url);
  } catch (e: any) {
    await invoke('oauth_cancel').catch(() => {});
    return { ok: false, error: `Could not open your browser: ${e?.message || e}` };
  }

  let query: string;
  try {
    query = await invoke<string>('oauth_await', { timeoutSecs: 300 });
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }

  const { code, error } = parseRedirect(query, state);
  if (!code) return { ok: false, error };
  return exchangeCode({ code, verifier, redirectUri, clientId: client.clientId, clientSecret: client.clientSecret });
}

/**
 * Android: custom scheme redirect, caught by the deep-link plugin. Google's
 * Android clients have no secret — the package name and signing certificate
 * fingerprint registered against the client are what identify the app.
 */
async function androidFlow(client: ClientConfig): Promise<OAuthResult> {
  const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  const { openUrl } = await import('@tauri-apps/plugin-opener');

  const redirectUri = `${reversedClientScheme(client.clientId)}:/oauth2redirect`;
  const verifier = createVerifier();
  const state = createState();
  const url = buildAuthUrl({
    clientId: client.clientId,
    redirectUri,
    challenge: await createChallenge(verifier),
    state,
    nonce: createState(),
  });

  // Register the listener before opening the browser: on a fast return the
  // redirect can arrive before an await on the next line would have run.
  const redirect = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sign-in timed out.')), 300_000);
    onOpenUrl((urls) => {
      const hit = urls.find((u) => u.startsWith(reversedClientScheme(client.clientId)));
      if (hit) { clearTimeout(timer); resolve(hit); }
    }).catch(reject);
  });

  try {
    await openUrl(url);
  } catch (e: any) {
    return { ok: false, error: `Could not open your browser: ${e?.message || e}` };
  }

  let returned: string;
  try {
    returned = await redirect;
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }

  const { code, error } = parseRedirect(returned, state);
  if (!code) return { ok: false, error };
  return exchangeCode({ code, verifier, redirectUri, clientId: client.clientId });
}

/**
 * Run the right flow for this platform. Returns an ID token for
 * signInWithCredential; the caller owns the Firebase side.
 */
export async function nativeGoogleSignIn(platform: Platform = detectPlatform()): Promise<OAuthResult> {
  if (platform === 'web' || platform === 'ios') {
    return { ok: false, error: 'This platform uses the browser sign-in flow.' };
  }
  const client = clientFor(platform);
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  return platform === 'android' ? androidFlow(client) : desktopFlow(client);
}
