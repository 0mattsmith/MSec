/*
 * Minimal Firebase REST client (no SDK, no bundler).
 * Auth: Google id_token -> Identity Toolkit signInWithIdp.
 * Data: Firestore REST v1 against the app's named database.
 */

const FB = {
  authBase: 'https://identitytoolkit.googleapis.com/v1',
  tokenBase: 'https://securetoken.googleapis.com/v1',
  firestoreBase() {
    return `https://firestore.googleapis.com/v1/projects/${MSEC_CONFIG.FIREBASE_PROJECT_ID}` +
      `/databases/${MSEC_CONFIG.FIRESTORE_DATABASE_ID}/documents`;
  },
};

/** Google OAuth via the browser's identity API. Returns a Google id_token. */
async function fbGoogleSignIn() {
  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = crypto.randomUUID();
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(MSEC_CONFIG.OAUTH_CLIENT_ID)}` +
    `&response_type=id_token` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&nonce=${nonce}` +
    `&prompt=select_account`;
  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const fragment = new URL(responseUrl).hash.slice(1);
  const idToken = new URLSearchParams(fragment).get('id_token');
  if (!idToken) throw new Error('Google sign-in did not return an id_token');
  return { idToken, redirectUri };
}

/** Exchange a Google id_token for Firebase credentials. */
async function fbSignInWithGoogle() {
  const { idToken, redirectUri } = await fbGoogleSignIn();
  const res = await fetch(`${FB.authBase}/accounts:signInWithIdp?key=${MSEC_CONFIG.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${idToken}&providerId=google.com`,
      requestUri: redirectUri,
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  if (!res.ok) throw new Error(`Firebase sign-in failed: ${await res.text()}`);
  const data = await res.json();
  return {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + (parseInt(data.expiresIn, 10) - 60) * 1000,
  };
}

/** Refresh the Firebase idToken when expired. Returns updated auth object. */
async function fbEnsureFreshToken(auth) {
  if (auth.expiresAt > Date.now()) return auth;
  const res = await fetch(`${FB.tokenBase}/token?key=${MSEC_CONFIG.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`,
  });
  if (!res.ok) throw new Error('Session expired - sign in again');
  const data = await res.json();
  return {
    ...auth,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    uid: data.user_id,
    expiresAt: Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000,
  };
}

async function fbGet(auth, path) {
  const res = await fetch(`${FB.firestoreBase()}/${path}`, {
    headers: { Authorization: `Bearer ${auth.idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} failed: ${res.status}`);
  return res.json();
}

/** Fetch the KDF config document published by the MSec app. */
async function fbGetKdfConfig(auth) {
  const doc = await fbGet(auth, `users/${auth.uid}/settings/kdf`);
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  return {
    v: parseInt(f.v?.integerValue ?? '1', 10),
    salt: f.salt?.stringValue,
    iterations: parseInt(f.iterations?.integerValue ?? '0', 10),
    verifier: f.verifier?.stringValue,
  };
}

/** Fetch all encrypted item blobs. Returns [{id, blob}]. */
async function fbListItemBlobs(auth) {
  const out = [];
  let pageToken = '';
  do {
    const qs = `pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await fbGet(auth, `users/${auth.uid}/items?${qs}`);
    for (const doc of data?.documents ?? []) {
      const id = doc.name.split('/').pop();
      const blob = doc.fields?.blob?.stringValue;
      if (blob) out.push({ id, blob });
    }
    pageToken = data?.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/** Create a new encrypted item document (blob format enforced by rules). */
async function fbCreateItem(auth, id, blob, updatedAt) {
  const res = await fetch(`${FB.firestoreBase()}/users/${auth.uid}/items?documentId=${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        blob: { stringValue: blob },
        userId: { stringValue: auth.uid },
        updatedAt: { integerValue: String(updatedAt) },
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to save login: ${res.status} ${await res.text()}`);
}
