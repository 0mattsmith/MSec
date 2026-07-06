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

## Security model

MSec is zero-knowledge: your master password, and anything derived from it, never leaves your device.

The master password is run through PBKDF2-SHA256 (600,000 iterations, random 16-byte salt) to derive an AES-256-GCM vault key. The key is held in memory only — it is never written to disk, localStorage, or Firestore. Unlocking is verified by decrypting a stored verifier blob rather than comparing any password hash. All vault data (items, folders, masked emails) is encrypted client-side before it is persisted anywhere: locally as a single encrypted blob (`msec_vault`), and in Firestore as one opaque blob per document. The Firestore security rules enforce this with `hasOnly()` — a write containing any plaintext vault field is rejected by the server.

Consequences worth knowing: there is no password recovery (losing the master password means losing the vault), and biometric quick-unlock only works while the key is still in memory (after a soft lock in the same session). A page reload or sign-out always requires the master password.

Source layout: `src/lib/crypto.ts` (key derivation and encrypt/decrypt), `src/store/VaultContext.tsx` (vault state, persistence, Firestore sync), `firestore.rules` (server-side enforcement).

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
