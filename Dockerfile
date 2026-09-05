# syntax=docker/dockerfile:1
#
# MSec — self-hosted image.
#
# MSec is a pure client-side app: the vault is encrypted in the browser and
# never leaves it in plaintext, so the server's only job is to hand over static
# files. That makes this image small and stateless — the only thing worth
# persisting is the TLS certificate.
#
# TLS is not optional decoration. Browsers expose crypto.subtle (PBKDF2,
# AES-GCM) and WebAuthn only in a *secure context*; over plain http:// on a LAN
# address they are simply undefined and MSec cannot unlock a vault at all.
# The entrypoint therefore issues a self-signed certificate on first boot.

# ---- build ------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

# Dependencies first: editing src/ shouldn't invalidate the npm layer.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Served from the container root, so no BASE_PATH override (that is only for
# GitHub Pages, which serves out of /MSec/). DEPLOY_TARGET tells the in-app
# updater that "reload to update" is meaningless here — a container changes
# version when its operator pulls a new image.
ENV DEPLOY_TARGET=selfhosted
RUN npm run build


# ---- runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="MSec" \
      org.opencontainers.image.description="Self-hosted, zero-knowledge password manager and authenticator" \
      org.opencontainers.image.source="https://github.com/0mattsmith/MSec" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache openssl

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/app-locations.conf     /etc/nginx/msec/app-locations.conf
COPY docker/security-headers.conf  /etc/nginx/msec/security-headers.conf
COPY docker/nginx-tls.conf         /etc/nginx/msec/tls.conf
COPY docker/nginx-plain.conf       /etc/nginx/msec/plain.conf
COPY docker/entrypoint.sh          /usr/local/bin/msec-entrypoint

RUN chmod +x /usr/local/bin/msec-entrypoint && mkdir -p /certs

# auto  = self-signed certificate on first boot (default)
# off   = plain HTTP only, for people terminating TLS at their own proxy
ENV MSEC_TLS=auto \
    MSEC_HOSTNAME=msec.local \
    MSEC_EXTRA_SAN="" \
    MSEC_CSP=on

# Unprivileged ports, so the container can drop root if you want it to.
EXPOSE 8080 8443
VOLUME ["/certs"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/msec-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
