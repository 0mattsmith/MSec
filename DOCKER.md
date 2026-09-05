# Self-hosting MSec

MSec is a client-side app. Your vault is encrypted in the browser with AES-256-GCM
under a key derived from your master password (PBKDF2-SHA256, 600,000 iterations)
before anything is written anywhere. The container's only job is to hand over
static files — it never sees a key or a plaintext secret.

```bash
docker run -d --name msec \
  -p 8443:8443 -p 8080:8080 \
  -v msec-certs:/certs \
  -e MSEC_EXTRA_SAN="IP:192.168.1.50" \
  --restart unless-stopped \
  ghcr.io/0mattsmith/msec:latest
```

Then open **https://192.168.1.50:8443**.

Or with the compose file in this repo:

```bash
docker compose up -d
```

---

## Read this first: MSec cannot run over plain HTTP

Browsers expose `crypto.subtle` — the Web Crypto API that does all of MSec's
key derivation and encryption — and WebAuthn only inside a **secure context**.
On `http://` at anything other than `localhost`, `window.crypto.subtle` is
literally `undefined`. MSec would load and then be unable to unlock a vault at
all.

So the container serves HTTPS, and generates a self-signed certificate on first
boot if you haven't given it one. Your browser will warn once per device. That
warning is about *identity*, not encryption — the connection is still encrypted,
and the browser still grants a secure context once you accept it.

Set `MSEC_EXTRA_SAN` to the address you actually type before the first start:

```yaml
MSEC_EXTRA_SAN: "IP:192.168.1.50,DNS:casaos.local"
```

Without it, the certificate only names `msec.local` and `localhost`, and
browsing to the IP gives you the harsher "wrong host" error instead of the
one-click-through "unknown issuer" one. If you get this wrong, delete the certs
volume and restart — a new certificate is issued automatically.

---

## CasaOS

App Store → **Custom Install** → **Import**, then paste `docker-compose.yml`
from this repo. The `x-casaos` block gives it a name, icon, category and
descriptions for each setting.

The default certificate volume is `/DATA/AppData/msec/certs`, which is where
CasaOS expects app data to live.

---

## Getting rid of the certificate warning

The self-signed certificate is the zero-configuration option, not the best one.
Two better routes, both of which give you a genuinely trusted certificate:

**Tailscale** — no open ports, no DNS, no certificate authority to argue with:

```bash
tailscale serve --bg --https=443 http://localhost:8080
```

Set `MSEC_TLS=off` on the container in this case, since Tailscale terminates TLS.

**Your existing reverse proxy** — Caddy, Nginx Proxy Manager, Traefik. Again set
`MSEC_TLS=off` and point the proxy at port 8080.

> Only use `MSEC_TLS=off` behind something that speaks HTTPS. On its own it puts
> the app back outside a secure context, where it cannot function.

This matters more than aesthetics for one feature: **biometric unlock**.
WebAuthn is strict about certificate errors, and browsers may refuse to register
a credential on a self-signed origin. Master password unlock works either way.

---

## What is and isn't self-hosted

| | Where it lives |
|---|---|
| The app | Your container |
| Your vault | Your browser's local storage, encrypted |
| Encrypted backups (`.msecvault`) | Wherever you save them |
| Optional cloud sync | Still Firebase (Google) — ciphertext only |

You never have to sign in. MSec gates on your master password, not on an
account, so a fresh container is a fully working offline vault. Cloud sync is
opt-in, and even when enabled the only thing Firestore ever stores is an
encrypted blob.

To move a vault between devices without Google in the loop, use
**Settings → Export → MSec transfer**, which preserves item UUIDs so importing
on the other device merges cleanly instead of duplicating.

---

## Settings

| Variable | Default | What it does |
|---|---|---|
| `MSEC_TLS` | `auto` | `auto` issues a self-signed certificate if `/certs` is empty. `off` serves plain HTTP on 8080 — proxy only. |
| `MSEC_HOSTNAME` | `msec.local` | Name written into the certificate. |
| `MSEC_EXTRA_SAN` | *(empty)* | Extra certificate names, OpenSSL syntax: `IP:192.168.1.50,DNS:casaos.local`. |
| `MSEC_PUBLIC_HTTPS_PORT` | `8443` | The HTTPS port as published on the host, used for the HTTP→HTTPS redirect. |
| `MSEC_CSP` | `on` | Content-Security-Policy. Turn off only if you have repointed the app at a different backend. |

| Path | Purpose |
|---|---|
| `/certs` | `msec.crt` and `msec.key`. Drop your own in to replace the generated pair. |

Ports: **8443** HTTPS, **8080** HTTP (redirects, and serves `/healthz`).

---

## Updating

The container serves whatever build was baked into the image, so reloading the
page can't update it — the in-app banner says "pull the new container image" for
exactly this reason.

```bash
docker compose pull && docker compose up -d
```

`:latest` follows version tags. `:edge` follows `main` if you want the bleeding
edge. Pin `:0.1` or `:0.1.15` if you'd rather updates be deliberate.

---

## Building it yourself

```bash
docker build -t msec:local .
docker run -d -p 8443:8443 -v msec-certs:/certs msec:local
```

The Node stage is pinned to `$BUILDPLATFORM`, so cross-building for arm64
doesn't emulate the JavaScript build — only the tiny nginx layer.
