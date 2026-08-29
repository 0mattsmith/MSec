/*
 * Importing from other password managers.
 *
 * Everything is parsed locally — an export file never leaves the device.
 * These files contain plaintext passwords, so the UI should encourage
 * deleting them afterwards.
 *
 * Supported:
 *   - MSec JSON (our own plain export)
 *   - Bitwarden JSON (unencrypted export)
 *   - LastPass CSV
 *   - Chrome / Edge / Brave CSV
 *   - KeePass / KeePassXC CSV
 *   - 1Password CSV
 *   - Generic CSV, by column-name sniffing
 */

import type { VaultItem, ItemCategory } from '../types';

export type ImportFormat =
  | 'msec-json' | 'bitwarden-json' | 'lastpass-csv' | 'chrome-csv'
  | 'keepass-csv' | 'onepassword-csv' | 'generic-csv' | 'unknown';

export interface ParsedImport {
  ok: boolean;
  error?: string;
  format?: ImportFormat;
  formatLabel?: string;
  items?: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>[];
  folders?: string[];
  skipped?: number;
}

const FORMAT_LABELS: Record<ImportFormat, string> = {
  'msec-json': 'MSec export',
  'bitwarden-json': 'Bitwarden',
  'lastpass-csv': 'LastPass',
  'chrome-csv': 'Chrome / Edge / Brave',
  'keepass-csv': 'KeePass',
  'onepassword-csv': '1Password',
  'generic-csv': 'CSV',
  unknown: 'Unknown',
};

// ---------- CSV parsing (quoted fields, embedded commas/newlines) ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

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

function toItem(fields: {
  title?: string; username?: string; password?: string; url?: string;
  notes?: string; totp?: string; type?: ItemCategory; folderName?: string;
}): Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'> & { folderName?: string } {
  return {
    type: fields.type || 'login',
    title: (fields.title || fields.url || fields.username || 'Untitled').slice(0, 200),
    username: fields.username || undefined,
    password: fields.password || undefined,
    url: fields.url || undefined,
    notes: fields.notes || undefined,
    totpSecret: normaliseTotp(fields.totp || '') || undefined,
    isFavorite: false,
    folderName: fields.folderName || undefined,
  };
}

// ---------- Format detection ----------

export function detectFormat(text: string, filename = ''): ImportFormat {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data?.items) && data.items.some((i: any) => i?.login || i?.type === 1)) {
        return 'bitwarden-json';
      }
      if (Array.isArray(data?.items) || Array.isArray(data)) return 'msec-json';
    } catch {
      return 'unknown';
    }
    return 'unknown';
  }

  const header = (parseCsv(trimmed)[0] || []).map((h) => h.trim().toLowerCase());
  if (header.length === 0) return 'unknown';
  const has = (...names: string[]) => names.every((n) => header.includes(n));

  if (has('url', 'username', 'password', 'name', 'grouping')) return 'lastpass-csv';
  if (has('name', 'url', 'username', 'password') && header.length <= 5) return 'chrome-csv';
  if (has('account', 'login name', 'password')) return 'keepass-csv';
  if (header.includes('title') && header.includes('password') &&
      (header.includes('website') || header.includes('urls'))) return 'onepassword-csv';
  if (header.includes('password') && (header.includes('username') || header.includes('login'))) {
    return 'generic-csv';
  }
  return filename.toLowerCase().endsWith('.csv') ? 'generic-csv' : 'unknown';
}

// ---------- Parsers ----------

function rowsToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

export function parseImport(text: string, filename = ''): ParsedImport {
  const format = detectFormat(text, filename);
  if (format === 'unknown') {
    return { ok: false, error: 'Unrecognised file. Export as JSON or CSV from your password manager and try again.' };
  }

  try {
    const items: any[] = [];
    const folders = new Set<string>();
    let skipped = 0;

    if (format === 'msec-json' || format === 'bitwarden-json') {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data.items || [];

      // Bitwarden folder ids -> names, so imported items keep their grouping.
      const folderNames = new Map<string, string>();
      for (const f of data.folders || []) {
        if (f?.id && f?.name) folderNames.set(f.id, f.name);
        if (f?.name) folders.add(f.name);
      }

      for (const raw of list) {
        if (!raw) { skipped++; continue; }

        if (format === 'bitwarden-json') {
          // 1 = login, 2 = secure note, 3 = card, 4 = identity
          const kind = raw.type;
          const folderName = raw.folderId ? folderNames.get(raw.folderId) : undefined;
          if (kind === 1 || raw.login) {
            items.push(toItem({
              title: raw.name,
              username: raw.login?.username,
              password: raw.login?.password,
              url: raw.login?.uris?.[0]?.uri,
              notes: raw.notes,
              totp: raw.login?.totp,
              folderName,
            }));
          } else if (kind === 2) {
            items.push(toItem({ title: raw.name, notes: raw.notes, type: 'note', folderName }));
          } else if (kind === 3 && raw.card) {
            items.push({
              ...toItem({ title: raw.name, notes: raw.notes, type: 'card', folderName }),
              cardNumber: raw.card.number,
              cardExpiry: raw.card.expMonth && raw.card.expYear
                ? `${String(raw.card.expMonth).padStart(2, '0')}/${String(raw.card.expYear).slice(-2)}`
                : undefined,
              cardCvv: raw.card.code,
              cardholderName: raw.card.cardholderName,
              cardIssuer: raw.card.brand,
            } as any);
          } else {
            skipped++;
          }
        } else {
          // Our own export shape
          items.push(toItem({
            title: raw.title || raw.name,
            username: raw.username,
            password: raw.password,
            url: raw.url,
            notes: raw.notes,
            totp: raw.totpSecret,
            type: raw.type,
          }));
        }
      }
    } else {
      for (const row of rowsToObjects(text)) {
        const title = pick(row, 'name', 'title', 'account', 'display name');
        const username = pick(row, 'username', 'login name', 'login_username', 'login', 'email', 'user name');
        const password = pick(row, 'password', 'login_password');
        const url = pick(row, 'url', 'urls', 'website', 'web site', 'login_uri', 'uri');
        const notes = pick(row, 'notes', 'comments', 'extra', 'note');
        const totp = pick(row, 'totp', 'otpauth', 'two factor', 'otp secret', 'login_totp');
        const folderName = pick(row, 'grouping', 'group', 'folder', 'category');

        if (!password && !username && !totp && !notes) { skipped++; continue; }
        if (folderName) folders.add(folderName);
        items.push(toItem({
          title, username, password, url, notes, totp,
          type: !password && notes ? 'note' : 'login',
          folderName,
        }));
      }
    }

    if (items.length === 0) {
      return { ok: false, error: 'No usable entries were found in that file.', format };
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
