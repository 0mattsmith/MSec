import { parseOtpauthUri, parseMigrationUri, parseQrPayload, bytesToBase32 } from './src/lib/otpimport';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const enc = (s: string) => bytesToBase32(new TextEncoder().encode(s));
check(enc('f') === 'MY', `base32 "f" -> MY (${enc('f')})`);
check(enc('fo') === 'MZXQ', `base32 "fo" -> MZXQ (${enc('fo')})`);
check(enc('foobar') === 'MZXW6YTBOI', `base32 "foobar" -> MZXW6YTBOI (${enc('foobar')})`);

const a = parseOtpauthUri('otpauth://totp/GitHub:matt%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30');
check(a?.secret === 'JBSWY3DPEHPK3PXP', 'extracts secret');
check(a?.issuer === 'GitHub', `issuer "${a?.issuer}"`);
check(a?.username === 'matt@example.com', `decodes account "${a?.username}"`);
check(parseOtpauthUri('otpauth://totp/Acme:alice?secret=GEZDGNBV')?.issuer === 'Acme', 'falls back to issuer in label');
check(parseOtpauthUri('otpauth://hotp/x?secret=GEZDGNBV') === null, 'rejects counter-based HOTP');
check(parseOtpauthUri('https://example.com') === null, 'rejects non-otpauth URIs');
check(parseOtpauthUri('otpauth://totp/x') === null, 'rejects a URI with no secret');

function varint(n: number): number[] { const o: number[] = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return o; }
function field(num: number, wire: number, payload: number[]): number[] { return [...varint((num << 3) | wire), ...payload]; }
function lenDelim(num: number, bytes: number[]): number[] { return field(num, 2, [...varint(bytes.length), ...bytes]); }
const str = (s: string) => [...new TextEncoder().encode(s)];

const secretBytes = [0x48,0x65,0x6c,0x6c,0x6f,0x21,0xde,0xad,0xbe,0xef];
const acct1 = [...lenDelim(1, secretBytes), ...lenDelim(2, str('Acme:bob@example.com')), ...lenDelim(3, str('Acme')),
               ...field(4,0,varint(1)), ...field(5,0,varint(1)), ...field(6,0,varint(2))];
const acct2 = [...lenDelim(1,[1,2,3,4,5]), ...lenDelim(2, str('solo-account')), ...field(6,0,varint(2))];
const hotpAcct = [...lenDelim(1,[9,9,9]), ...lenDelim(2, str('counter-based')), ...field(6,0,varint(1))];
const payload = [...lenDelim(1, acct1), ...lenDelim(1, acct2), ...lenDelim(1, hotpAcct), ...field(2,0,varint(1))];
const b64 = btoa(String.fromCharCode(...payload));
const migUri = `otpauth-migration://offline?data=${encodeURIComponent(b64)}`;

const migrated = parseMigrationUri(migUri);
check(migrated.length === 2, `decodes 2 TOTP accounts, skipping HOTP (got ${migrated.length})`);
check(migrated[0]?.secret === bytesToBase32(new Uint8Array(secretBytes)), `secret -> base32 (${migrated[0]?.secret})`);
check(migrated[0]?.issuer === 'Acme', `issuer "${migrated[0]?.issuer}"`);
check(migrated[0]?.username === 'bob@example.com', `account "${migrated[0]?.username}"`);
check(migrated[1]?.title === 'solo-account', `label with no issuer ("${migrated[1]?.title}")`);
check(parseQrPayload(migUri).length === 2, 'parseQrPayload routes migration URIs');
check(parseQrPayload('otpauth://totp/a?secret=GEZDGNBV').length === 1, 'parseQrPayload routes single URIs');
check(parseQrPayload('random text').length === 0, 'ignores unrelated QR content');
check(parseMigrationUri('otpauth-migration://offline?data=@@@bad@@@').length === 0, 'survives a corrupt payload');

console.log(fail ? `\n${fail} FAILED` : '\nQR / TOTP decoding verified.');
process.exit(fail?1:0);
