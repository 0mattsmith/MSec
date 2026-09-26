# Syncing MSec across your devices

MSec's sync is zero-knowledge. Firestore only ever holds
`{ blob, userId, updatedAt }`, where `blob` is your vault encrypted with a key
derived from your master password. Google decides *which* encrypted blob is
yours; it never learns what's inside it.

Two consequences worth internalising before you set anything up:

- **The same master password is needed on every device.** Signing in with Google
  is not enough on its own — it identifies the blob, it doesn't decrypt it.
- **If you forget the master password, the blob is unrecoverable.** Nobody,
  including you, can decrypt it. That's the design, not a gap in it.

If you'd rather not involve Google at all, skip to
[Manual sync](#manual-sync-no-account) — it works everywhere and needs no setup.

---

## Why the native apps need their own OAuth clients

The web build signs in with Firebase's `signInWithPopup`, which is fine in a
browser tab. It cannot work anywhere else MSec ships:

- **Tauri desktop** — the webview has no opener/postMessage channel back from
  the popup, so the promise simply never settles.
- **Android** — Google refuses OAuth inside embedded WebViews by policy
  (`disallowed_useragent`), and has for years.

So the native builds do what RFC 8252 says a native app should: run the
authorisation code flow with PKCE in the *system* browser and catch the redirect
coming back. Desktop catches it on a loopback port; Android catches it on a
custom URI scheme.

---

## One-time setup

### 1. Authorise the web origins

Firebase Console → Authentication → Settings → **Authorized domains**. Add:

- `0mattsmith.github.io` — for the GitHub Pages build
- your self-hosted hostname, if you have one

**A bare IP address cannot be authorised.** If you reach your CasaOS instance at
`https://192.168.1.50:8443`, Google sign-in will not work there, and the app
will tell you so rather than failing silently. Tailscale is the tidiest fix: it
gives you a real hostname *and* a trusted certificate, which also unblocks
biometric unlock. See [DOCKER.md](DOCKER.md).

### 2. Create the desktop OAuth client

Google Cloud Console → the same project as Firebase (`golden-fountain-w6tp2`) →
APIs & Services → Credentials → **Create credentials → OAuth client ID**:

- Application type: **Desktop app**
- Name: `MSec Desktop`

You get a client ID *and* a client secret. Google requires the secret for
desktop clients even though it ships inside the binary — RFC 8252 §8.5 is
explicit that it isn't confidential, and PKCE is what actually protects the
exchange.

### 3. Create the Android OAuth client

Same place, **Create credentials → OAuth client ID**:

- Application type: **Android**
- Package name: `com.msec.vault`
- SHA-1 certificate fingerprint: from the keystore `new-keystore.ps1` made:

  ```powershell
  keytool -list -v -keystore msec.keystore -alias msec
  ```

  Copy the SHA-1 line. Android clients have no secret — the package name and
  signing certificate are what identify the app.

> Build a debug APK and the fingerprint won't match, so sign-in will fail on it.
> Use a release build, which is what CI produces anyway.

### 4. Point MSec at the clients

```powershell
.\set-oauth-client.ps1 -DesktopClientId "123-abc.apps.googleusercontent.com" `
                       -DesktopClientSecret "GOCSPX-..." `
                       -AndroidClientId "123-xyz.apps.googleusercontent.com"
```

This writes `oauth-config.json` and derives the Android redirect scheme into
`src-tauri/tauri.conf.json`. Do it with the script rather than by hand: the
scheme is the client ID reversed and lives in two files, and when they disagree
the symptom is a sign-in that hangs with no error.

### 5. Let Firebase accept those clients

Firebase Console → Authentication → Sign-in method → **Google** → Web SDK
configuration. If sign-in gets as far as Google but Firebase rejects the token
(`auth/invalid-credential`), add the desktop and Android client IDs to the
allowed list here.

### 6. Deploy the Firestore rules

```powershell
firebase deploy --only firestore:rules
```

Until this runs, the zero-knowledge rules — which reject any document
containing plaintext fields — aren't enforced server-side.

### 7. Cut a release

Both config files are read at **build** time, so the values only reach your
devices in a new build:

```powershell
.\push.ps1 "Configure Google sign-in" -Release
```

---

## What works where

| | Sign-in | Notes |
|---|---|---|
| Web (GitHub Pages) | Firebase popup | Needs step 1 |
| Self-hosted (Docker/CasaOS) | Firebase popup | Needs a hostname, not an IP |
| Windows / macOS / Linux | System browser, loopback | Needs steps 2, 4, 5 |
| Android | System browser, custom scheme | Needs steps 3, 4, 5 |
| Browser extension | `launchWebAuthFlow` | Separate client — see below |

### The browser extension

The extension's manifest pins its extension ID with a `key` field, so it is
`aebefjopnpalipplflpiahbjdgjmmjmm` in Chrome, Brave, Edge **and** Vivaldi
rather than a different ID per browser. That means one redirect URI covers all
four:

```
https://aebefjopnpalipplflpiahbjdgjmmjmm.chromiumapp.org/
```

Create a **Web application** OAuth client, add that URI, and paste the client ID
into `extension/config.js`. Firefox derives its redirect URI differently — the
extension popup has a "Show redirect URI" link that prints it.

---

## Manual sync (no account)

Nothing above is required to use MSec on several devices. Every entry carries a
stable UUID, so **Settings → Export → MSec transfer** doubles as a sync file:

- Import with **Merge** and entries are matched by UUID — the newer edit wins,
  missing entries are added, and nothing duplicates however many times you move
  the file back and forth.
- Import with **Replace** to discard the local vault instead.

It's more effort per sync and nothing leaves your control. Other managers ignore
the UUID field, so imports *from* them fall back to matching on 2FA secret or
website + username.
