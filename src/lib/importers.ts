/*
 * Importing from other password managers.
 *
 * Everything is parsed locally — an export file never leaves the device.
 * These files contain plaintext passwords, so the UI should encourage
 * deleting them afterwards.
 *
 * Recognised, with per-manager column mapping:
 *   JSON  - MSec (own export + transfer), Bitwarden, Proton Pass, Keeper, Enpass
 *   CSV   - LastPass, NordPass, Dashlane, Proton Pass, Bitwarden, 1Password,
 *           KeePass, KeePassXC, Chrome/Edge/Brave, Firefox, Apple Passwords
 *           (Safari/iCloud), RoboForm, Zoho Vault
 *   CSV   - anything else, by column-name sniffing
 *
 * Three things bite when reading other people's exports, and all three are
 * handled up front rather than per-format:
 *   1. A UTF-8 BOM. Excel and several managers prepend one, which glues itself
 *      to the first header name and makes every column lookup miss.
 *   2. The delimiter isn't always a comma. Exports produced in locales where
 *      the list separator is ";" are still called .csv, and a few managers use
 *      tabs.
 *   3. Header spelling is inconsistent even within one product: "Web Site",
 *      "website", "login_uri". Headers are squashed to bare alphanumerics
 *      before matching, so all three collapse to one key.
 */

import type { VaultItem, ItemCategory } from '../types';

export type ImportFormat =
  // JSON
  | 'msec-transfer' | 'msec-json' | 'bitwarden-json' | 'protonpass-json'
  | 'keeper-json' | 'enpass-json'
  // Delimited
  | 'lastpass-csv' | 'nordpass-csv' | 'dashlane-csv' | 'protonpass-csv'
  | 'bitwarden-csv' | 'onepassword-csv' | 'keepass-csv' | 'keepassxc-csv'
  | 'chrome-csv' | 'firefox-csv' | 'apple-csv' | 'roboform-csv' | 'zoho-csv'
  | 'generic-csv'
  // Recognised, but not usable as-is
  | 'encrypted-json' | 'archive' | 'kdbx'
  | 'unknown';

export interface ParsedImport {
  ok: boolean;
  error?: string;
  format?: ImportFormat;
  formatLabel?: string;
  items?: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>[];
  folders?: string[];
  skipped?: number;
}

export const TRANSFER_FORMAT = 'msec-vault-transfer';

const FORMAT_LABELS: Record<ImportFormat, string> = {
  'msec-transfer': 'MSec transfer file',
  'msec-json': 'MSec export',
  'bitwarden-json': 'Bitwarden (JSON)',
  'protonpass-json': 'Proton Pass (JSON)',
  'keeper-json': 'Keeper (JSON)',
  'enpass-json': 'Enpass (JSON)',
  'lastpass-csv': 'LastPass',
  'nordpass-csv': 'NordPass',
  'dashlane-csv': 'Dashlane',
  'protonpass-csv': 'Proton Pass',
  'bitwarden-csv': 'Bitwarden (CSV)',
  'onepassword-csv': '1Password',
  'keepass-csv': 'KeePass',
  'keepassxc-csv': 'KeePassXC',
  'chrome-csv': 'Chrome / Edge / Brave',
  'firefox-csv': 'Firefox',
  'apple-csv': 'Apple Passwords',
  'roboform-csv': 'RoboForm',
  'zoho-csv': 'Zoho Vault',
  'generic-csv': 'CSV',
  'encrypted-json': 'Encrypted export',
  archive: 'Archive',
  kdbx: 'KeePass database',
  unknown: 'Unknown',
};

/** Managers offered in the UI, so the picker can list what actually works. */
export const SUPPORTED_SOURCES = [
  '1Password', 'Apple Passwords', 'Bitwarden', 'Chrome / Edge / Brave',
  'Dashlane', 'Enpass', 'Firefox', 'Google Authenticator (QR)', 'Keeper',
  'KeePass / KeePassXC', 'LastPass', 'NordPass', 'Proton Pass', 'RoboForm',
  'Zoho Vault',
];

// ---------- Text preparation ----------

/**
 * Excel and several managers write a UTF-8 BOM. Left in place it becomes part
 * of the first header name, so every lookup against that column misses and the
 * file looks like it has no title/name field at all.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Guess the field separator from the header line. Quoted sections are removed
 * first so that a comma inside "Smith, John" doesn't win the vote.
 */
export function detectDelimiter(text: string): string {
  const firstLine = stripBom(text).split(/\r?\n/)[0] || '';
  const unquoted = firstLine.replace(/"[^"]*"/g, '');
  let best = ',';
  let bestCount = 0;
  for (const d of [',', ';', '\t', '|']) {
    const count = unquoted.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return bestCount > 0 ? best : ',';
}

/** Reduce a header to bare alphanumerics: "Web Site" / "login_uri" -> "website" / "loginuri". */
function squash(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------- Delimited parsing (quoted fields, embedded separators/newlines) ----------

export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = stripBom(text);
  const sep = delimiter || detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Rows keyed by squashed header name. */
function rowsToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(squash);
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      if (!h) return;
      const value = (r[i] ?? '').trim();
      // Duplicate header names happen (Dashlane ships three "username" style
      // columns); first non-empty wins rather than last-one-clobbers.
      if (obj[h] === undefined || obj[h] === '') obj[h] = value;
    });
    return obj;
  });
}

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = row[squash(n)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

// ---------- Field aliases ----------

const A = {
  title: ['name', 'title', 'account', 'displayname', 'secretname', 'itemname', 'entryname'],
  username: ['username', 'loginname', 'login', 'user', 'usr', 'accountname', 'itemusername', 'username1'],
  email: ['email', 'emailaddress', 'itememail'],
  password: ['password', 'pwd', 'loginpassword', 'pass', 'itempassword'],
  url: ['url', 'urls', 'website', 'websites', 'websiteaddress', 'loginuri', 'uri', 'weburl', 'matchurl', 'link', 'site', 'domain'],
  notes: ['notes', 'note', 'comments', 'comment', 'extra', 'securenote', 'description'],
  totp: ['totp', 'otpauth', 'otpsecret', 'otpsecretkey', 'logintotp', 'twofactor', 'twofactorsecret', 'totpsecret', 'totpuri', 'authkey'],
  folder: ['folder', 'grouping', 'group', 'category', 'vault', 'chamber', 'sharedfolder', 'collection', 'tags'],
  cardNumber: ['cardnumber', 'ccnumber', 'number', 'creditcardnumber'],
  cardExpiry: ['expirydate', 'expirationdate', 'expiration', 'expiry', 'expdate', 'cardexpiration', 'expirationmonthyear'],
  cardCvv: ['cvc', 'cvv', 'cvv2', 'securitycode', 'cardsecuritycode', 'verificationnumber'],
  cardholderName: ['cardholdername', 'cardholder', 'nameoncard', 'ccname'],
  cardPin: ['pin', 'cardpin'],
  cardIssuer: ['brand', 'cardtype', 'issuer', 'cardbrand'],
  bankName: ['bankname', 'bank'],
  firstName: ['firstname', 'givenname'],
  lastName: ['lastname', 'surname', 'familyname'],
  fullName: ['fullname', 'name'],
  phone: ['phonenumber', 'phone', 'mobile', 'telephone'],
};

/** Pull the shared secret out of an otpauth:// URI, or return as-is. */
function normaliseTotp(value: string): string {
  if (!value) return '';
  if (value.toLowerCase().startsWith('otpauth://')) {
    try {
      return new URL(value).searchParams.get('secret') || '';
    } catch {
      return '';
    }
  }
  return value.replace(/\s+/g, '');
}

type ImportedItem = Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'> & { folderName?: string };

function toItem(fields: {
  title?: string; username?: string; email?: string; password?: string; url?: string;
  notes?: string; totp?: string; type?: ItemCategory; folderName?: string;
  externalId?: string;
}): ImportedItem {
  return {
    type: fields.type || 'login',
    externalId: fields.externalId || undefined,
    title: (fields.title || fields.url || fields.username || fields.email || 'Untitled').slice(0, 200),
    username: fields.username || undefined,
    email: fields.email || undefined,
    password: fields.password || undefined,
    url: fields.url || undefined,
    notes: fields.notes || undefined,
    totpSecret: normaliseTotp(fields.totp || '') || undefined,
    isFavorite: false,
    folderName: fields.folderName || undefined,
  };
}

// ---------- Delimited format signatures ----------

interface CsvSpec {
  format: ImportFormat;
  /** Every one of these squashed headers must be present. */
  requires: string[];
  /** None of these may be present — used to break ties between lookalikes. */
  rejects?: string[];
  /** Upper bound on column count, for formats defined by being minimal. */
  maxColumns?: number;
}

/*
 * Order matters: the first match wins, so distinctive signatures come first.
 * Each `requires` list is deliberately a small, stable subset of the real
 * header rather than the whole thing — managers add columns between releases,
 * and an exact-match signature would break on the next export format change.
 */
const CSV_SPECS: CsvSpec[] = [
  // "cardholdername" + "cvc" + a type discriminator is unique to NordPass:
  // it exports logins, cards, notes and identities into one wide table.
  { format: 'nordpass-csv', requires: ['cardholdername', 'cvc', 'type'] },

  // Proton Pass is the only one with a "vault" column alongside "totp".
  { format: 'protonpass-csv', requires: ['vault', 'totp', 'type'] },

  // Dashlane's credentials.csv carries secondary login columns.
  { format: 'dashlane-csv', requires: ['username2', 'password'] },

  // Bitwarden prefixes its login columns.
  { format: 'bitwarden-csv', requires: ['loginuri', 'loginpassword'] },

  { format: 'lastpass-csv', requires: ['url', 'username', 'password', 'name', 'grouping'] },

  { format: 'keepassxc-csv', requires: ['group', 'title', 'password', 'totp'] },

  { format: 'zoho-csv', requires: ['secretname', 'secrettype'] },

  { format: 'roboform-csv', requires: ['pwd', 'matchurl'] },

  { format: 'firefox-csv', requires: ['url', 'username', 'password', 'httprealm'] },
  { format: 'firefox-csv', requires: ['url', 'username', 'password', 'formactionorigin'] },

  // Modern 1Password CSV. "archived" distinguishes it from Apple's export,
  // which otherwise has the same five columns plus OTPAuth.
  { format: 'onepassword-csv', requires: ['title', 'password', 'otpauth', 'archived'] },
  { format: 'onepassword-csv', requires: ['title', 'password', 'website'] },
  { format: 'onepassword-csv', requires: ['title', 'password', 'urls'] },

  { format: 'apple-csv', requires: ['title', 'url', 'username', 'password', 'otpauth'] },

  // Classic KeePass 2 CSV.
  { format: 'keepass-csv', requires: ['account', 'loginname', 'password'] },

  // Browser exports are defined by being minimal, so cap the column count to
  // avoid swallowing richer formats that happen to share these four names.
  {
    format: 'chrome-csv',
    requires: ['name', 'url', 'username', 'password'],
    rejects: ['grouping', 'otpauth', 'type', 'group', 'vault', 'folder'],
    maxColumns: 6,
  },
];

function matchCsvSpec(header: string[]): ImportFormat | null {
  for (const spec of CSV_SPECS) {
    if (spec.maxColumns && header.length > spec.maxColumns) continue;
    if (!spec.requires.every((h) => header.includes(h))) continue;
    if (spec.rejects?.some((h) => header.includes(h))) continue;
    return spec.format;
  }
  return null;
}

/** Does this header have anything we could actually build an item from? */
function headerLooksUsable(header: string[]): boolean {
  const any = (names: string[]) => names.some((n) => header.includes(squash(n)));
  return any(A.password) || any(A.totp) || any(A.cardNumber) ||
    (any(A.notes) && any(A.title));
}

// ---------- Format detection ----------

export function detectFormat(text: string, filename = ''): ImportFormat {
  const name = filename.toLowerCase();
  const trimmed = stripBom(text).trim();

  // Binary containers, recognised so the error can be useful. A zip's first
  // bytes decode to "PK\x03\x04" however the file was read.
  if (trimmed.startsWith('PK\u0003\u0004') || name.endsWith('.1pux') || name.endsWith('.zip')) {
    return 'archive';
  }
  if (name.endsWith('.kdbx') || name.endsWith('.kdb')) return 'kdbx';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: any;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return 'unknown';
    }

    // Password-protected exports: structurally valid JSON, no readable content.
    if (data?.encrypted === true || data?.passwordProtected === true) return 'encrypted-json';

    // Our own transfer file announces itself, so ids can be trusted.
    if (data?.format === TRANSFER_FORMAT) return 'msec-transfer';

    // Proton Pass keys items by vault id rather than a flat list.
    if (data?.vaults && typeof data.vaults === 'object' && !Array.isArray(data.vaults)) {
      return 'protonpass-json';
    }
    if (Array.isArray(data?.records) &&
        data.records.some((r: any) => r && ('login_url' in r || 'login' in r))) {
      return 'keeper-json';
    }
    if (Array.isArray(data?.items) &&
        data.items.some((i: any) => Array.isArray(i?.fields))) {
      return 'enpass-json';
    }
    if (Array.isArray(data?.items) &&
        data.items.some((i: any) => i?.login || typeof i?.type === 'number')) {
      return 'bitwarden-json';
    }
    if (Array.isArray(data?.items) || Array.isArray(data)) return 'msec-json';
    return 'unknown';
  }

  const rows = parseCsv(trimmed);
  const header = (rows[0] || []).map(squash).filter(Boolean);
  if (header.length === 0) return 'unknown';

  const matched = matchCsvSpec(header);
  if (matched) return matched;
  if (headerLooksUsable(header)) return 'generic-csv';

  // Header row we can't use. Tell the caller it's delimited so the error can
  // explain the missing header rather than claiming the file is unreadable.
  return rows.length > 1 && (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt'))
    ? 'generic-csv'
    : 'unknown';
}

// ---------- Type resolution ----------

function declaredType(format: ImportFormat, row: Record<string, string>): ItemCategory | null {
  const t = squash(pick(row, 'type', 'secrettype', 'category'));
  if (!t) return null;

  // Names differ per manager but the vocabulary is small.
  if (['creditcard', 'card', 'payment', 'paymentcard', 'bankaccount'].includes(t)) return 'card';
  if (['note', 'securenote', 'secureNote'.toLowerCase(), 'notes'].includes(t)) return 'note';
  if (['identity', 'personalinfo', 'personalinformation', 'contact', 'address'].includes(t)) return 'identity';
  if (['login', 'password', 'passwords', 'credential', 'webaccount', 'alias'].includes(t)) return 'login';
  return null;
}

// ---------- Delimited row -> item ----------

/**
 * Zoho Vault doesn't give credentials their own columns — it packs them into a
 * JSON blob in SecretData. Lift those keys up so the normal mapping finds them.
 */
function expandEmbeddedJson(row: Record<string, string>): Record<string, string> {
  const blob = row.secretdata;
  if (!blob || !blob.trim().startsWith('{')) return row;
  try {
    const extra = JSON.parse(blob);
    const merged = { ...row };
    for (const [k, v] of Object.entries(extra)) {
      const key = squash(k);
      if (v == null || v === '') continue;
      if (merged[key] === undefined || merged[key] === '') merged[key] = String(v);
    }
    return merged;
  } catch {
    return row;
  }
}

function csvRowToItem(format: ImportFormat, source: Record<string, string>): ImportedItem | null {
  const row = expandEmbeddedJson(source);
  const title = pick(row, ...A.title);
  const username = pick(row, ...A.username);
  const email = pick(row, ...A.email);
  const password = pick(row, ...A.password);
  const url = pick(row, ...A.url);
  const notes = pick(row, ...A.notes);
  const totp = pick(row, ...A.totp);
  const folderName = pick(row, ...A.folder);
  const cardNumber = pick(row, ...A.cardNumber);

  // A declared type is authoritative; otherwise infer from what's populated.
  const declared = declaredType(format, row);
  let type = declared;
  if (!type) {
    if (cardNumber) type = 'card';
    else if (password || totp || username || email) type = 'login';
    else if (notes) type = 'note';
    else return null;
  }

  // Keep a row that the export declared as an item and gave a name, even when
  // every other column is blank. Proton Pass's CSV, for one, lists credit cards
  // by name but omits the card fields entirely — importing the shell is honest,
  // whereas dropping it loses the entry without saying so. Rows with neither a
  // declared type nor any content are padding.
  const hasContent = !!(password || username || email || totp || notes || cardNumber || url);
  if (!hasContent && !(declared && title)) return null;

  const base = toItem({
    title, username, email, password, url, notes, totp, type, folderName,
  });

  if (type === 'card') {
    return {
      ...base,
      cardNumber: cardNumber || undefined,
      cardExpiry: pick(row, ...A.cardExpiry) || undefined,
      cardCvv: pick(row, ...A.cardCvv) || undefined,
      cardPin: pick(row, ...A.cardPin) || undefined,
      cardIssuer: pick(row, ...A.cardIssuer) || undefined,
      bankName: pick(row, ...A.bankName) || undefined,
      cardholderName: pick(row, ...A.cardholderName) || undefined,
    };
  }

  if (type === 'identity') {
    const full = pick(row, ...A.fullName);
    const first = pick(row, ...A.firstName) || full.split(/\s+/)[0] || '';
    const last = pick(row, ...A.lastName) || full.split(/\s+/).slice(1).join(' ');
    const address = [
      pick(row, 'address1', 'address', 'streetaddress', 'street'),
      pick(row, 'address2'),
      pick(row, 'city'),
      pick(row, 'state', 'county', 'province'),
      pick(row, 'zipcode', 'postcode', 'postalcode', 'zip'),
      pick(row, 'country'),
    ].filter(Boolean).join(', ');
    return {
      ...base,
      firstName: first || undefined,
      lastName: last || undefined,
      phone: pick(row, ...A.phone) || undefined,
      address: address || undefined,
    };
  }

  return base;
}

// ---------- JSON parsers ----------

function parseBitwardenJson(data: any, out: ImportedItem[], folders: Set<string>): number {
  let skipped = 0;
  const folderNames = new Map<string, string>();
  for (const f of data.folders || []) {
    if (f?.id && f?.name) folderNames.set(f.id, f.name);
    if (f?.name) folders.add(f.name);
  }

  for (const raw of data.items || []) {
    if (!raw) { skipped++; continue; }
    const folderName = raw.folderId ? folderNames.get(raw.folderId) : undefined;
    const externalId = raw.id ? `bitwarden:${raw.id}` : undefined;
    // 1 = login, 2 = secure note, 3 = card, 4 = identity
    if (raw.type === 1 || raw.login) {
      out.push(toItem({
        title: raw.name,
        username: raw.login?.username,
        password: raw.login?.password,
        url: raw.login?.uris?.[0]?.uri,
        notes: raw.notes,
        totp: raw.login?.totp,
        folderName, externalId,
      }));
    } else if (raw.type === 2) {
      out.push(toItem({ title: raw.name, notes: raw.notes, type: 'note', folderName, externalId }));
    } else if (raw.type === 3 && raw.card) {
      out.push({
        ...toItem({ title: raw.name, notes: raw.notes, type: 'card', folderName, externalId }),
        cardNumber: raw.card.number,
        cardExpiry: raw.card.expMonth && raw.card.expYear
          ? `${String(raw.card.expMonth).padStart(2, '0')}/${String(raw.card.expYear).slice(-2)}`
          : undefined,
        cardCvv: raw.card.code,
        cardholderName: raw.card.cardholderName,
        cardIssuer: raw.card.brand,
      });
    } else if (raw.type === 4 && raw.identity) {
      const id = raw.identity;
      out.push({
        ...toItem({ title: raw.name, notes: raw.notes, type: 'identity', folderName, externalId }),
        firstName: id.firstName,
        lastName: id.lastName,
        phone: id.phone,
        email: id.email,
        address: [id.address1, id.address2, id.city, id.state, id.postalCode, id.country]
          .filter(Boolean).join(', ') || undefined,
      });
    } else {
      skipped++;
    }
  }
  return skipped;
}

function parseProtonPassJson(data: any, out: ImportedItem[], folders: Set<string>): number {
  let skipped = 0;
  for (const vault of Object.values<any>(data.vaults || {})) {
    const folderName = vault?.name || undefined;
    if (folderName) folders.add(folderName);

    for (const entry of vault?.items || []) {
      const d = entry?.data;
      if (!d) { skipped++; continue; }
      const meta = d.metadata || {};
      const content = d.content || {};
      const externalId = entry.itemId ? `protonpass:${entry.itemId}` : undefined;
      const kind = squash(d.type || '');

      if (kind === 'creditcard') {
        out.push({
          ...toItem({ title: meta.name, notes: meta.note, type: 'card', folderName, externalId }),
          cardNumber: content.number,
          // Proton stores expiry as YYYY-MM; the vault shows MM/YY.
          cardExpiry: typeof content.expirationDate === 'string' && content.expirationDate.includes('-')
            ? `${content.expirationDate.split('-')[1]}/${content.expirationDate.split('-')[0].slice(-2)}`
            : content.expirationDate,
          cardCvv: content.verificationNumber,
          cardPin: content.pin,
          cardholderName: content.cardholderName,
        });
      } else if (kind === 'note') {
        out.push(toItem({ title: meta.name, notes: meta.note, type: 'note', folderName, externalId }));
      } else {
        out.push(toItem({
          title: meta.name,
          username: content.itemUsername || content.username,
          email: content.itemEmail,
          password: content.password,
          url: Array.isArray(content.urls) ? content.urls[0] : content.urls,
          notes: meta.note,
          totp: content.totpUri,
          folderName, externalId,
        }));
      }
    }
  }
  return skipped;
}

function parseKeeperJson(data: any, out: ImportedItem[], folders: Set<string>): number {
  let skipped = 0;
  for (const rec of data.records || []) {
    if (!rec) { skipped++; continue; }
    const folderName = rec.folders?.[0]?.folder || rec.folders?.[0]?.shared_folder || undefined;
    if (folderName) folders.add(folderName);
    // Keeper hides the TOTP URI in a custom field keyed "TFC:Keeper".
    const custom = rec.custom_fields || {};
    const totp = custom['TFC:Keeper'] || custom['TFC:keeper'] ||
      Object.entries(custom).find(([k]) => /totp|tfc/i.test(k))?.[1];
    out.push(toItem({
      title: rec.title,
      username: rec.login,
      password: rec.password,
      url: rec.login_url,
      notes: rec.notes,
      totp: typeof totp === 'string' ? totp : undefined,
      folderName,
      externalId: rec.uid ? `keeper:${rec.uid}` : undefined,
    }));
  }
  return skipped;
}

function parseEnpassJson(data: any, out: ImportedItem[], folders: Set<string>): number {
  let skipped = 0;
  const folderNames = new Map<string, string>();
  for (const f of data.folders || []) {
    if (f?.uuid && f?.title) folderNames.set(f.uuid, f.title);
    if (f?.title) folders.add(f.title);
  }

  for (const raw of data.items || []) {
    if (!raw) { skipped++; continue; }
    // Enpass models everything as a labelled field list, so read by field type
    // and fall back to the label when the type is generic.
    const field = (...types: string[]) => {
      for (const t of types) {
        const f = (raw.fields || []).find(
          (x: any) => squash(x?.type) === squash(t) || squash(x?.label) === squash(t),
        );
        if (f?.value) return String(f.value);
      }
      return '';
    };

    const folderName = raw.folders?.[0] ? folderNames.get(raw.folders[0]) : undefined;
    const category = squash(raw.category || raw.template_type || '');
    const cardNumber = field('ccNumber', 'card number', 'number');
    const type: ItemCategory =
      cardNumber || category.includes('creditcard') ? 'card'
        : category.includes('note') ? 'note'
          : 'login';

    const base = toItem({
      title: raw.title,
      username: field('username', 'login'),
      email: field('email'),
      password: field('password'),
      url: field('url', 'website'),
      notes: raw.note,
      totp: field('totp', 'one-time code'),
      type, folderName,
      externalId: raw.uuid ? `enpass:${raw.uuid}` : undefined,
    });

    out.push(type === 'card'
      ? {
        ...base,
        cardNumber: cardNumber || undefined,
        cardExpiry: field('ccExpiry', 'expiry date') || undefined,
        cardCvv: field('ccCvc', 'cvc') || undefined,
        cardPin: field('ccPin', 'pin') || undefined,
        cardholderName: field('ccName', 'cardholder') || undefined,
        bankName: field('ccBankname', 'bank') || undefined,
      }
      : base);
  }
  return skipped;
}

// ---------- Errors for files we recognise but can't read ----------

const UNUSABLE_ERRORS: Partial<Record<ImportFormat, string>> = {
  archive: 'That looks like a zip archive. 1Password .1pux files and Dashlane exports are zips — unzip it first, then import the files inside (Dashlane: credentials.csv, payments.csv, securenotes.csv; 1Password: export.data).',
  kdbx: 'A .kdbx file is an encrypted KeePass database, not an export. Open it in KeePassXC and use Database → Export → CSV, then import that.',
  'encrypted-json': 'That export is password-protected, and MSec cannot decrypt another manager\'s format. Re-export with encryption turned off, import it, then delete the file.',
  unknown: 'Unrecognised file. Export as CSV or unencrypted JSON from your password manager and try again.',
};

// ---------- Entry point ----------

export function parseImport(text: string, filename = ''): ParsedImport {
  const format = detectFormat(text, filename);

  const unusable = UNUSABLE_ERRORS[format];
  if (unusable) return { ok: false, error: unusable, format };

  try {
    const items: ImportedItem[] = [];
    const folders = new Set<string>();
    let skipped = 0;

    if (format === 'bitwarden-json' || format === 'protonpass-json' ||
        format === 'keeper-json' || format === 'enpass-json' ||
        format === 'msec-json' || format === 'msec-transfer') {
      const data = JSON.parse(stripBom(text));

      if (format === 'bitwarden-json') {
        skipped = parseBitwardenJson(data, items, folders);
      } else if (format === 'protonpass-json') {
        skipped = parseProtonPassJson(data, items, folders);
      } else if (format === 'keeper-json') {
        skipped = parseKeeperJson(data, items, folders);
      } else if (format === 'enpass-json') {
        skipped = parseEnpassJson(data, items, folders);
      } else {
        const list = Array.isArray(data) ? data : data.items || [];
        const folderNames = new Map<string, string>();
        for (const f of data.folders || []) {
          if (f?.id && f?.name) folderNames.set(f.id, f.name);
          if (f?.name) folders.add(f.name);
        }

        for (const raw of list) {
          if (!raw) { skipped++; continue; }
          if (format === 'msec-transfer') {
            // A vault transferred from another MSec instance: keep everything,
            // including the item's own id, so repeated transfers stay idempotent.
            const { folderId, ...rest } = raw;
            items.push({ ...rest, folderName: folderId ? folderNames.get(folderId) : undefined });
          } else {
            items.push(toItem({
              title: raw.title || raw.name,
              username: raw.username,
              email: raw.email,
              password: raw.password,
              url: raw.url,
              notes: raw.notes,
              totp: raw.totpSecret,
              type: raw.type,
              externalId: raw.externalId || (raw.id ? `msec:${raw.id}` : undefined),
            }));
          }
        }
      }
    } else {
      const rows = rowsToObjects(stripBom(text));
      if (rows.length === 0) {
        return {
          ok: false, format,
          error: 'That file has a header row but no entries. Check the export actually contains items.',
        };
      }
      for (const row of rows) {
        const item = csvRowToItem(format, row);
        if (!item) { skipped++; continue; }
        if (item.folderName) folders.add(item.folderName);
        items.push(item);
      }
    }

    if (items.length === 0) {
      return {
        ok: false,
        format,
        error: format === 'generic-csv'
          ? 'No usable entries found. MSec matches columns by name — the file needs a header row naming at least a password, note or TOTP column.'
          : 'No usable entries were found in that file.',
      };
    }
    return {
      ok: true,
      format,
      formatLabel: FORMAT_LABELS[format],
      items,
      folders: [...folders],
      skipped,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'The file could not be parsed.', format };
  }
}
