/*
 * Reading TOTP codes out of QR payloads.
 *
 * Two shapes exist in the wild:
 *
 *   otpauth://totp/Issuer:account?secret=BASE32&issuer=Issuer
 *       — the single-account QR nearly every site shows you.
 *
 *   otpauth-migration://offline?data=<base64 protobuf>
 *       — Google Authenticator's "export accounts", which packs many
 *         accounts into one QR. The payload is protobuf, so we decode it by
 *         hand rather than pulling in a protobuf runtime.
 *
 * Everything happens locally; no payload is ever sent anywhere.
 */

export interface ImportedTotp {
  title: string;
  issuer?: string;
  username?: string;
  secret: string; // base32, as MSec stores it
  algorithm?: string;
  digits?: number;
  period?: number;
}

// ---------- base32 (RFC 4648) ----------

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// ---------- otpauth:// ----------

export function parseOtpauthUri(uri: string): ImportedTotp | null {
  try {
    if (!/^otpauth:\/\//i.test(uri)) return null;
    const url = new URL(uri);
    const type = url.host.toLowerCase(); // totp | hotp
    if (type !== 'totp') return null; // counter-based codes aren't supported

    const secret = (url.searchParams.get('secret') || '').replace(/\s+/g, '').toUpperCase();
    if (!secret) return null;

    // Label is "Issuer:account" or just "account", URL-encoded.
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const [maybeIssuer, maybeAccount] = label.includes(':')
      ? [label.split(':')[0], label.split(':').slice(1).join(':')]
      : ['', label];

    const issuer = url.searchParams.get('issuer') || maybeIssuer || '';
    const username = (maybeAccount || label || '').trim();

    return {
      title: issuer || username || 'Authenticator',
      issuer: issuer || undefined,
      username: username || undefined,
      secret,
      algorithm: url.searchParams.get('algorithm') || undefined,
      digits: parseInt(url.searchParams.get('digits') || '6', 10) || 6,
      period: parseInt(url.searchParams.get('period') || '30', 10) || 30,
    };
  } catch {
    return null;
  }
}

// ---------- otpauth-migration:// (Google Authenticator) ----------

/** Minimal protobuf wire-format reader — just what the migration payload uses. */
class ProtoReader {
  private pos = 0;
  constructor(private buf: Uint8Array) {}

  get done(): boolean { return this.pos >= this.buf.length; }

  varint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result >>> 0;
  }

  bytes(): Uint8Array {
    const len = this.varint();
    const out = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  skip(wireType: number): void {
    if (wireType === 0) this.varint();
    else if (wireType === 2) this.bytes();
    else if (wireType === 5) this.pos += 4;
    else if (wireType === 1) this.pos += 8;
  }
}

const ALGORITHMS = ['UNSPECIFIED', 'SHA1', 'SHA256', 'SHA512', 'MD5'];
const DIGIT_COUNTS = [6, 6, 8]; // UNSPECIFIED, SIX, EIGHT

/**
 * Decode Google Authenticator's bulk export.
 * OtpParameters { bytes secret=1; string name=2; string issuer=3;
 *                 Algorithm algorithm=4; DigitCount digits=5; OtpType type=6; }
 * MigrationPayload { repeated OtpParameters otp_parameters = 1; ... }
 */
export function parseMigrationUri(uri: string): ImportedTotp[] {
  try {
    if (!/^otpauth-migration:\/\//i.test(uri)) return [];
    const url = new URL(uri);
    const data = url.searchParams.get('data');
    if (!data) return [];

    const binary = atob(decodeURIComponent(data).replace(/-/g, '+').replace(/_/g, '/'));
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

    const reader = new ProtoReader(buf);
    const results: ImportedTotp[] = [];
    const decoder = new TextDecoder();

    while (!reader.done) {
      const tag = reader.varint();
      const field = tag >>> 3;
      const wireType = tag & 7;

      if (field === 1 && wireType === 2) {
        const inner = new ProtoReader(reader.bytes());
        let secret = new Uint8Array(0);
        let name = '';
        let issuer = '';
        let algorithm = 1;
        let digits = 1;
        let otpType = 2; // 1 = HOTP, 2 = TOTP

        while (!inner.done) {
          const iTag = inner.varint();
          const iField = iTag >>> 3;
          const iWire = iTag & 7;
          if (iField === 1 && iWire === 2) secret = inner.bytes();
          else if (iField === 2 && iWire === 2) name = decoder.decode(inner.bytes());
          else if (iField === 3 && iWire === 2) issuer = decoder.decode(inner.bytes());
          else if (iField === 4) algorithm = inner.varint();
          else if (iField === 5) digits = inner.varint();
          else if (iField === 6) otpType = inner.varint();
          else inner.skip(iWire);
        }

        if (secret.length > 0 && otpType === 2) {
          // Names often arrive as "Issuer:account"
          const [a, b] = name.includes(':')
            ? [name.split(':')[0], name.split(':').slice(1).join(':')]
            : ['', name];
          const finalIssuer = issuer || a || '';
          const username = (b || name || '').trim();
          results.push({
            title: finalIssuer || username || 'Authenticator',
            issuer: finalIssuer || undefined,
            username: username || undefined,
            secret: bytesToBase32(secret),
            algorithm: ALGORITHMS[algorithm] || 'SHA1',
            digits: DIGIT_COUNTS[digits] || 6,
            period: 30,
          });
        }
      } else {
        reader.skip(wireType);
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Accept whatever a QR gave us and return every code found. */
export function parseQrPayload(payload: string): ImportedTotp[] {
  const text = (payload || '').trim();
  if (/^otpauth-migration:\/\//i.test(text)) return parseMigrationUri(text);
  const single = parseOtpauthUri(text);
  return single ? [single] : [];
}
