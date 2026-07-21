# MSec

A secure, all-in-one password manager and authenticator. MSec combines client-side encryption with a clean interface to protect your credentials, generate strong passwords, and provide TOTP two-factor codes in a single app.

## Quick start

Prerequisites: Node.js (LTS).

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build
npm run lint         # TypeScript check
npm run test:crypto  # encryption test suite
```

You can use MSec fully offline (local-only mode) — just create a master password on first launch. Signing in with Google additionally syncs your encrypted vault through Firestore.

## Platforms

MSec is a PWA plus native desktop/Android builds via Tauri:

- **Web / PWA** — deployed to GitHub Pages automatically on every push to `main` (`.github/workflows/deploy-pages.yml`). One-time setup: repo Settings → Pages → Source: "GitHub Actions". The app is installable (manifest + service worker) and works offline once loaded.
- **Windows, macOS (Universal), Linux** — push a version tag (`git tag v0.1.0 && git push origin v0.1.0`) and `.github/workflows/release-desktop.yml` builds installers for all three and attaches them to a draft GitHub Release.
- **Android** — experimental: run the "Build Android APK (debug)" workflow manually from the Actions tab to get an unsigned debug APK artifact. A signed release build needs a keystore added later.
- **iOS** — no native build; install as a PWA (Safari → Share → Add to Home Screen). PWA limitations on iOS: no true biometric unlock integration, service worker storage can be evicted by the OS if the app is unused for weeks (your vault stays safe in Firestore if you use sync), and clipboard auto-clear timing is less reliable in the background.

To develop the desktop app locally: `npm install`, then `npx tauri icon public/icons/icon-1024.png` once, then `npm run tauri dev` (requires Rust).

On phones the dashboard switches to a homescreen-style layout: a 4-column grid of icons and folders with the remaining widgets stacked full-width below. Icon merging (drag-to-folder) is desktop-only; folders opened by tapping work everywhere.

## Security model

MSec is zero-knowledge: your master password, and anything derived from it, never leaves your device.

The master password is run through PBKDF2-SHA256 (600,000 iterations, random 16-byte salt) to derive an AES-256-GCM vault key. The key is held in memory only — it is never written to disk, localStorage, or Firestore. Unlocking is verified by decrypting a stored verifier blob rather than comparing any password hash. All vault data (items, folders, masked emails) is encrypted client-side before it is persisted anywhere: locally as a single encrypted blob (`msec_vault`), and in Firestore as one opaque blob per document. The Firestore security rules enforce this with `hasOnly()` — a write containing any plaintext vault field is rejected by the server.

Consequences worth knowing: there is no password recovery (losing the master password means losing the vault), and biometric quick-unlock only works while the key is still in memory (after a soft lock in the same session). A page reload or sign-out always requires the master password.

Source layout: `src/lib/crypto.ts` (key derivation and encrypt/decrypt), `src/store/VaultContext.tsx` (vault state, persistence, Firestore sync), `firestore.rules` (server-side enforcement).

## Browser extension (Chrome & Firefox)

The `extension/` folder is a WebExtension that puts an MSec icon inside login fields on any website — click it to autofill saved credentials for that site or to create (and optionally generate) a new login, which syncs straight into your encrypted vault. It uses the same zero-knowledge model: it signs into Firebase with your Google account, downloads encrypted blobs, and decrypts them locally after you enter your master password. The derived key lives only in memory-backed session storage and auto-locks after 10 minutes of inactivity.

One-time setup: in Google Cloud Console (same Firebase project) create an OAuth 2.0 "Web application" client, add the redirect URI the extension popup shows you (Chrome: `https://<extension-id>.chromiumapp.org/`; Firefox shows its own), and paste the client ID into `extension/config.js`. Also open the MSec app once while signed in — it publishes the non-secret key-derivation settings the extension needs, and deploy the updated Firestore rules.

Loading it: Chrome → `chrome://extensions` → Developer mode → "Load unpacked" → select `extension/`. Firefox → `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → pick `extension/manifest.json` (permanent install requires signing via addons.mozilla.org). To make MSec your de-facto default manager, disable the browser's built-in offers: Chrome → Settings → Autofill → Google Password Manager → turn off "Offer to save passwords"; Firefox → Settings → Privacy & Security → uncheck "Ask to save passwords".

## Firebase deployment

The web app config in `firebase-applet-config.json` is public by design (Firebase web API keys are not secrets; access is controlled by the rules). After changing `firestore.rules`, deploy them:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Note: the deployed rules must match the encrypted blob format or sync writes will be rejected.

## Migration from earlier versions

Earlier builds stored the vault and master password in plaintext localStorage (`vaultx_*` keys). On first unlock with the correct master password, MSec transparently migrates that data into the encrypted format and deletes the plaintext. Legacy plaintext Firestore documents remain readable and are re-encrypted the next time each item is edited.

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS 4, Firebase (Auth + Firestore), Web Crypto API, otpauth (TOTP), zxcvbn (password strength).
