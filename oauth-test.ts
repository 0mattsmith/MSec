/*
 * OAuth tests. Covers the parts that are pure logic — PKCE, URL construction,
 * redirect parsing — since the platform flows need a real browser and a real
 * Google to exercise.
 */
import {
  createVerifier, createChallenge, createState, buildAuthUrl,
  parseRedirect, reversedClientScheme,
} from './src/lib/oauth';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

// --- PKCE verifier (RFC 7636 §4.1) ---
const v = createVerifier();
check(v.length >= 43 && v.length <= 128, `verifier length in range (${v.length})`);
check(/^[A-Za-z0-9\-._~]+$/.test(v), 'verifier uses only unreserved characters');
check(createVerifier() !== createVerifier(), 'verifiers are not repeated');

// --- S256 challenge (RFC 7636 §4.2) ---
// The spec's own worked example, so this validates the implementation rather
// than just its self-consistency.
const SPEC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const SPEC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
check(await createChallenge(SPEC_VERIFIER) === SPEC_CHALLENGE,
  `S256 matches the RFC 7636 test vector (${await createChallenge(SPEC_VERIFIER)})`);
check(!(await createChallenge(v)).includes('='), 'challenge is base64url, unpadded');
check(!/[+/]/.test(await createChallenge(v)), 'challenge has no + or / characters');

// --- Authorisation URL ---
const url = buildAuthUrl({
  clientId: 'abc.apps.googleusercontent.com',
  redirectUri: 'http://127.0.0.1:51234',
  challenge: SPEC_CHALLENGE,
  state: 'st8',
  nonce: 'nnc',
});
const q = new URL(url).searchParams;
check(new URL(url).origin === 'https://accounts.google.com', 'auth URL points at Google');
check(q.get('response_type') === 'code', 'authorisation code flow, not implicit');
check(q.get('code_challenge_method') === 'S256', 'S256 challenge method');
check(q.get('code_challenge') === SPEC_CHALLENGE, 'challenge carried through');
check(q.get('redirect_uri') === 'http://127.0.0.1:51234', 'loopback redirect preserved');
check((q.get('scope') || '').includes('openid'), 'openid scope requested (needed for an ID token)');
check(q.get('prompt') === 'select_account', 'account chooser forced');
check(!url.includes('client_secret'), 'no secret in the authorisation URL');

// --- Redirect parsing ---
const good = parseRedirect('?code=4/abc&state=st8', 'st8');
check(good.code === '4/abc', 'reads the code from a bare query string');

const android = parseRedirect('com.googleusercontent.apps.abc:/oauth2redirect?code=4/xyz&state=st8', 'st8');
check(android.code === '4/xyz', 'reads the code from a custom-scheme URL');

// A mismatched state means this response belongs to a different request, so
// the code is not ours to spend.
const forged = parseRedirect('?code=4/evil&state=other', 'st8');
check(!forged.code && /did not match/i.test(forged.error || ''), 'rejects a mismatched state');

const denied = parseRedirect('?error=access_denied&state=st8', 'st8');
check(!denied.code && /cancelled/i.test(denied.error || ''), `access_denied reads as cancellation (${denied.error})`);

const noCode = parseRedirect('?state=st8', 'st8');
check(!noCode.code && !!noCode.error, 'missing code is an error, not a silent pass');

check(createState() !== createState(), 'state values are not repeated');

// --- Android redirect scheme ---
check(
  reversedClientScheme('971957557158-abc.apps.googleusercontent.com') === 'com.googleusercontent.apps.971957557158-abc',
  'client ID reversed into Google’s Android scheme',
);
check(
  reversedClientScheme('971957557158-abc') === 'com.googleusercontent.apps.971957557158-abc',
  'already-bare client ID is left alone',
);

console.log(fail ? `\n${fail} FAILED` : '\nOAuth flow verified.');
process.exit(fail?1:0);
