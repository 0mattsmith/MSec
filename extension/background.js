/*
 * MSec extension background.
 * Cross-browser: Chrome runs this as an MV3 service worker (importScripts),
 * Firefox loads the scripts list from the manifest, so the imports are no-ops.
 *
 * Session model:
 *  - chrome.storage.local: Firebase auth tokens (persistent sign-in).
 *  - chrome.storage.session (memory-only, trusted contexts): raw vault key
 *    + encrypted blob cache while unlocked. Cleared on lock, auto-lock,
 *    or browser exit. Content scripts can never read it directly.
 */
if (typeof importScripts === 'function') {
  try { importScripts('config.js', 'crypto.js', 'firebase-rest.js'); } catch (e) { /* Firefox: already loaded */ }
}

const S = chrome.storage.session;
const L = chrome.storage.local;

async function getAuth() {
  const { msecAuth } = await L.get('msecAuth');
  if (!msecAuth) return null;
  try {
    const fresh = await fbEnsureFreshToken(msecAuth);
    if (fresh !== msecAuth) await L.set({ msecAuth: fresh });
    return fresh;
  } catch {
    await L.remove('msecAuth');
    return null;
  }
}

async function getSession() {
  const { msecKey, msecDocs } = await S.get(['msecKey', 'msecDocs']);
  return msecKey ? { keyRaw: msecFromB64(msecKey), docs: msecDocs || [] } : null;
}

function scheduleAutoLock() {
  chrome.alarms.create('msec-autolock', { delayInMinutes: MSEC_CONFIG.AUTO_LOCK_MINUTES });
}

async function lockVault() {
  await S.remove(['msecKey', 'msecDocs']);
  chrome.alarms.clear('msec-autolock');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'msec-autolock') lockVault();
});

async function decryptItems(session) {
  const key = await msecImportKey(session.keyRaw);
  const items = [];
  for (const doc of session.docs) {
    try {
      items.push(JSON.parse(await msecDecryptString(key, doc.blob)));
    } catch { /* other-key or corrupt doc — skip */ }
  }
  return items;
}

function hostMatches(itemUrl, host) {
  if (!itemUrl) return false;
  try {
    const itemHost = new URL(itemUrl.includes('://') ? itemUrl : `https://${itemUrl}`).hostname;
    return host === itemHost || host.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

const handlers = {
  async status() {
    const auth = await getAuth();
    const session = await getSession();
    return {
      signedIn: !!auth,
      email: auth?.email ?? null,
      unlocked: !!session,
      configured: !MSEC_CONFIG.OAUTH_CLIENT_ID.startsWith('PASTE_'),
      redirectUri: chrome.identity.getRedirectURL(),
    };
  },

  async signin() {
    const auth = await fbSignInWithGoogle();
    await L.set({ msecAuth: auth });
    return { ok: true, email: auth.email };
  },

  async signout() {
    await L.remove('msecAuth');
    await lockVault();
    return { ok: true };
  },

  async unlock({ password }) {
    const auth = await getAuth();
    if (!auth) return { error: 'Sign in with Google first.' };
    const kdf = await fbGetKdfConfig(auth);
    if (!kdf || !kdf.salt || !kdf.verifier) {
      return { error: 'No vault key data found. Open the MSec app while signed in once - it publishes the (non-secret) key-derivation settings the extension needs.' };
    }
    const keyRaw = await msecUnlock(password, kdf);
    if (!keyRaw) return { error: 'Incorrect master password.' };
    const docs = await fbListItemBlobs(auth);
    await S.set({ msecKey: msecToB64(keyRaw), msecDocs: docs });
    scheduleAutoLock();
    return { ok: true, itemCount: docs.length };
  },

  async lock() {
    await lockVault();
    return { ok: true };
  },

  async 'get-credentials'({ host }) {
    const session = await getSession();
    if (!session) return { locked: true };
    scheduleAutoLock(); // activity resets the timer
    const items = await decryptItems(session);
    const matches = items
      .filter(i => (i.type === 'login' || i.type === 'passkey') && !i.deletedAt && hostMatches(i.url, host))
      .map(i => ({ id: i.id, title: i.title, username: i.username || i.email || '', password: i.password || '' }));
    return { credentials: matches };
  },

  async 'save-credential'({ host, username, password, title }) {
    const auth = await getAuth();
    const session = await getSession();
    if (!auth || !session) return { locked: true };
    const now = Date.now();
    const item = {
      id: crypto.randomUUID(),
      type: 'login',
      title: title || host,
      url: `https://${host}`,
      username,
      password,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };
    const key = await msecImportKey(session.keyRaw);
    const blob = await msecEncryptString(key, JSON.stringify(item));
    await fbCreateItem(auth, item.id, blob, now);
    await S.set({ msecDocs: [...session.docs, { id: item.id, blob }] });
    scheduleAutoLock();
    return { ok: true };
  },

  async 'open-unlock'() {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?page=1') });
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg).then(sendResponse).catch((e) => sendResponse({ error: String(e?.message || e) }));
  return true; // async response
});
