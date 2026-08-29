import { parseImport, detectFormat, parseCsv } from './src/lib/importers';
let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

// --- CSV parser edge cases ---
const tricky = parseCsv('a,b,c\n"has, comma","has ""quotes""","multi\nline"');
check(tricky[1][0] === 'has, comma', 'CSV: embedded comma');
check(tricky[1][1] === 'has "quotes"', 'CSV: escaped quotes');
check(tricky[1][2] === 'multi\nline', 'CSV: newline inside a quoted field');

// --- Chrome ---
const chrome = `name,url,username,password
GitHub,https://github.com,matt,hunter2
Reddit,https://reddit.com,matt2,pw2`;
check(detectFormat(chrome) === 'chrome-csv', `detects Chrome CSV (${detectFormat(chrome)})`);
const c = parseImport(chrome);
check(c.ok && c.items?.length === 2, `Chrome: 2 items (${c.items?.length})`);
check(c.items?.[0].password === 'hunter2' && c.items?.[0].url === 'https://github.com', 'Chrome: fields mapped');

// --- LastPass (incl. TOTP + folder) ---
const lastpass = `url,username,password,totp,extra,name,grouping,fav
https://bank.com,me@x.com,secret1,JBSWY3DPEHPK3PXP,my notes,Bank,Finance,0
http://sn,,,,"secure note body",Note1,Personal,0`;
check(detectFormat(lastpass) === 'lastpass-csv', `detects LastPass CSV (${detectFormat(lastpass)})`);
const lp = parseImport(lastpass);
check(lp.ok === true, 'LastPass parses');
check(lp.items?.[0].totpSecret === 'JBSWY3DPEHPK3PXP', 'LastPass: TOTP secret imported');
check(lp.folders?.includes('Finance') === true, `LastPass: folders detected (${lp.folders})`);
check((lp.items?.[1] as any)?.type === 'note', 'LastPass: passwordless row becomes a note');

// --- Bitwarden JSON ---
const bw = JSON.stringify({
  folders: [{ id: 'f1', name: 'Work' }],
  items: [
    { type: 1, name: 'Gmail', folderId: 'f1', notes: 'n', login: { username: 'a@b.c', password: 'pw', totp: 'otpauth://totp/Gmail?secret=GEZDGNBV', uris: [{ uri: 'https://gmail.com' }] } },
    { type: 2, name: 'Wifi code', notes: 'hunter2' },
    { type: 3, name: 'Visa', card: { number: '4111111111111111', expMonth: '3', expYear: '2027', code: '123', cardholderName: 'M Smith', brand: 'Visa' } },
    { type: 4, name: 'Identity' },
  ],
});
check(detectFormat(bw) === 'bitwarden-json', `detects Bitwarden JSON (${detectFormat(bw)})`);
const b = parseImport(bw);
check(b.items?.length === 3 && b.skipped === 1, `Bitwarden: 3 imported, 1 skipped (${b.items?.length}/${b.skipped})`);
check(b.items?.[0].totpSecret === 'GEZDGNBV', 'Bitwarden: otpauth:// URI reduced to secret');
check((b.items?.[0] as any).folderName === 'Work', 'Bitwarden: folder name resolved from id');
check((b.items?.[1] as any).type === 'note', 'Bitwarden: secure note');
check((b.items?.[2] as any).cardExpiry === '03/27', `Bitwarden: card expiry normalised (${(b.items?.[2] as any).cardExpiry})`);

// --- KeePass ---
const kp = `"Account","Login Name","Password","Web Site","Comments"
"Router","admin","admin123","192.168.1.1","home"`;
check(detectFormat(kp) === 'keepass-csv', `detects KeePass CSV (${detectFormat(kp)})`);
check(parseImport(kp).items?.[0].username === 'admin', 'KeePass: fields mapped');

// --- Failure modes ---
check(parseImport('not a file at all').ok === false, 'rejects junk');
check(parseImport('name,url\nx,y').ok === false, 'rejects a CSV with no credentials');
console.log(fail ? `\n${fail} FAILED` : '\nImporters verified.');
process.exit(fail?1:0);
