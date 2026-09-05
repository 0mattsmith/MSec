#!/bin/sh
# MSec container entrypoint: pick an nginx config, make sure a certificate
# exists, then hand over to nginx.
set -e

CERT_DIR=/certs
CRT="$CERT_DIR/msec.crt"
KEY="$CERT_DIR/msec.key"
CONF=/etc/nginx/conf.d/default.conf
CSP=/etc/nginx/msec/csp.conf

MSEC_TLS="${MSEC_TLS:-auto}"
MSEC_HOSTNAME="${MSEC_HOSTNAME:-msec.local}"
MSEC_PUBLIC_HTTPS_PORT="${MSEC_PUBLIC_HTTPS_PORT:-8443}"
MSEC_CSP="${MSEC_CSP:-on}"

log() { echo "[msec] $*"; }

# --- Content-Security-Policy -------------------------------------------------
# Everything the app runs is bundled at build time, so 'self' is enough for
# scripts. connect-src has to name Firebase and the GitHub releases API, which
# are the only two places the app ever talks to. Set MSEC_CSP=off if you have
# pointed the app at a different backend and something is being blocked.
if [ "$MSEC_CSP" = "on" ]; then
    cat > "$CSP" <<'CSPEOF'
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://api.github.com wss://*.firebaseio.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
CSPEOF
else
    : > "$CSP"
    log "Content-Security-Policy disabled (MSEC_CSP=$MSEC_CSP)"
fi

# --- TLS ---------------------------------------------------------------------
if [ "$MSEC_TLS" = "off" ]; then
    log "TLS disabled — serving plain HTTP on :8080."
    log "WARNING: browsers only expose crypto.subtle and WebAuthn in a secure"
    log "         context. Put this behind a proxy that terminates HTTPS, or"
    log "         MSec will not be able to unlock a vault."
    cp /etc/nginx/msec/plain.conf "$CONF"
else
    mkdir -p "$CERT_DIR"

    if [ -f "$CRT" ] && [ -f "$KEY" ]; then
        log "Using the certificate already in $CERT_DIR."
    else
        # SANs matter more than the CN: browsers ignore CN entirely, and a
        # homelab box is usually reached by IP as often as by name.
        SAN="DNS:${MSEC_HOSTNAME},DNS:localhost,IP:127.0.0.1"
        [ -n "$MSEC_EXTRA_SAN" ] && SAN="${SAN},${MSEC_EXTRA_SAN}"

        log "No certificate found — generating a self-signed one for ${SAN}."
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
            -keyout "$KEY" -out "$CRT" \
            -subj "/CN=${MSEC_HOSTNAME}" \
            -addext "subjectAltName=${SAN}" \
            -addext "basicConstraints=CA:FALSE" \
            -addext "keyUsage=digitalSignature,keyEncipherment" \
            -addext "extendedKeyUsage=serverAuth" 2>/dev/null
        chmod 600 "$KEY"
        log "Certificate written to $CRT (valid 10 years)."
        log "Your browser will warn once per device — that is expected for a"
        log "self-signed certificate. Mount your own into $CERT_DIR to avoid it."
    fi

    sed "s|__HTTPS_PORT__|${MSEC_PUBLIC_HTTPS_PORT}|g" \
        /etc/nginx/msec/tls.conf > "$CONF"
    log "Serving HTTPS on :8443 (HTTP on :8080 redirects to it)."
fi

nginx -t
exec "$@"
