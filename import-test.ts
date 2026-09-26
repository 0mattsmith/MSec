/*
 * Importer tests. Every header line below is the real one that manager emits —
 * a fixture invented from memory would pass while the actual export failed.
 */
import { parseImport, detectFormat, parseCsv, detectDelimiter } from './src/lib/importers';
let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };
const item = (r: any, i = 0) => (r.items?.[i] ?? {}) as any;

// --- CSV parser edge cases ---
const tricky = parseCsv('a,b,c\n"has, comma","has ""quotes""","multi\nline"');
check(tricky[1][0] === 'has, comma', 'CSV: embedded comma');
check(tricky[1][1] === 'has "quotes"', 'CSV: escaped quotes');
check(tricky[1][2] === 'multi\nline', 'CSV: newline inside a quoted field');

// A comma inside a quoted header must not win the delimiter vote.
check(detectDelimiter('"Name, full";url;password\n') === ';', 'delimiter: quoted comma ignored');
check(detectDelimiter('name,url,password\n') === ',', 'delimiter: comma default');
check(detectDelimiter('name\turl\tpassword\n') === '\t', 'delimiter: tab');

// --- Regression: UTF-8 BOM ---
// Excel and several managers prepend one. Left in place it fuses to the first
// header name, so "name" becomes "﻿name" and every title lookup misses.
const bom = '﻿name,url,username,password\nGitHub,https://github.com,matt,hunter2';
check(detectFormat(bom) === 'chrome-csv', `BOM: still detected (${detectFormat(bom)})`);
check(item(parseImport(bom)).title === 'GitHub', 'BOM: first column still readable');

// --- Regression: semicolon-delimited export ---
const semi = 'name;url;username;password\nBank;https://bank.com;me;pw1';
check(detectFormat(semi) === 'chrome-csv', `semicolon: detected (${detectFormat(semi)})`);
check(item(parseImport(semi)).password === 'pw1', 'semicolon: fields mapped');

// --- Header spelling variance ---
const spaced = '"Title","Web Site","User Name","Password"\n"Router","192.168.1.1","admin","admin123"';
const sp = parseImport(spaced);
check(sp.ok && item(sp).url === '192.168.1.1', `header squashing: "Web Site" -> url (${item(sp).url})`);
check(item(sp).username === 'admin', 'header squashing: "User Name" -> username');

// --- Chrome / Edge / Brave ---
const chrome = `name,url,username,password,note
GitHub,https://github.com,matt,hunter2,
Reddit,https://reddit.com,matt2,pw2,`;
check(detectFormat(chrome) === 'chrome-csv', `detects Chrome CSV (${detectFormat(chrome)})`);
const c = parseImport(chrome);
check(c.ok && c.items?.length === 2, `Chrome: 2 items (${c.items?.length})`);
check(item(c).password === 'hunter2' && item(c).url === 'https://github.com', 'Chrome: fields mapped');

// --- LastPass ---
const lastpass = `url,username,password,totp,extra,name,grouping,fav
https://bank.com,me@x.com,secret1,JBSWY3DPEHPK3PXP,my notes,Bank,Finance,0
http://sn,,,,"secure note body",Note1,Personal,0`;
check(detectFormat(lastpass) === 'lastpass-csv', `detects LastPass CSV (${detectFormat(lastpass)})`);
const lp = parseImport(lastpass);
check(lp.ok === true, 'LastPass parses');
check(item(lp).totpSecret === 'JBSWY3DPEHPK3PXP', 'LastPass: TOTP secret imported');
check(lp.folders?.includes('Finance') === true, `LastPass: folders detected (${lp.folders})`);
check(item(lp, 1).type === 'note', 'LastPass: passwordless row becomes a note');

// --- NordPass (one wide table holding four item types) ---
const nordpass = `name,url,additional_urls,username,password,note,cardholdername,cardnumber,cvc,expirydate,zipcode,folder,full_name,phone_number,email,address1,address2,city,country,state,type,custom_fields
GitHub,https://github.com,,matt,hunter2,,,,,,,Dev,,,,,,,,,password,
My Visa,,,,,,M Smith,4111111111111111,123,2028-04,SW1A 1AA,Finance,,,,,,,,,credit_card,
Wifi,,,,,"the code is swordfish",,,,,,Home,,,,,,,,,note,
Me,,,,,,,,,,,Personal,Matt Smith,07700900123,me@x.com,1 High St,Flat 2,London,UK,Greater London,identity,`;
check(detectFormat(nordpass) === 'nordpass-csv', `detects NordPass CSV (${detectFormat(nordpass)})`);
const np = parseImport(nordpass);
check(np.ok && np.items?.length === 4, `NordPass: 4 items (${np.items?.length})`);
check(item(np, 0).type === 'login' && item(np, 0).password === 'hunter2', 'NordPass: login');
check(item(np, 1).type === 'card', `NordPass: credit_card -> card (${item(np, 1).type})`);
check(item(np, 1).cardNumber === '4111111111111111', 'NordPass: card number');
check(item(np, 1).cardCvv === '123' && item(np, 1).cardholderName === 'M Smith', 'NordPass: cvc + cardholder');
check(item(np, 2).type === 'note' && /swordfish/.test(item(np, 2).notes), 'NordPass: note');
check(item(np, 3).type === 'identity', `NordPass: identity (${item(np, 3).type})`);
check(item(np, 3).firstName === 'Matt' && item(np, 3).lastName === 'Smith', 'NordPass: full_name split');
check(/London/.test(item(np, 3).address || ''), `NordPass: address joined (${item(np, 3).address})`);
check(np.folders?.includes('Finance') === true, `NordPass: folders (${np.folders})`);

// --- Dashlane credentials.csv ---
const dashlane = `username,username2,username3,title,password,note,url,category,otpSecret
matt,alt@x.com,,Amazon,pw123,,https://amazon.co.uk,Shopping,JBSWY3DPEHPK3PXP`;
check(detectFormat(dashlane) === 'dashlane-csv', `detects Dashlane CSV (${detectFormat(dashlane)})`);
const dl = parseImport(dashlane);
check(dl.ok && item(dl).username === 'matt', 'Dashlane: primary username preferred');
check(item(dl).totpSecret === 'JBSWY3DPEHPK3PXP', 'Dashlane: otpSecret mapped');
check(dl.folders?.includes('Shopping') === true, `Dashlane: category as folder (${dl.folders})`);

// --- Proton Pass CSV ---
const proton = `type,name,url,email,username,password,note,totp,createTime,modifyTime,vault
login,Proton,https://proton.me,me@proton.me,matt,pw1,,otpauth://totp/Proton?secret=GEZDGNBV,1700000000,1700000000,Personal
note,Shopping list,,,,,"milk, eggs",,1700000000,1700000000,Personal
creditCard,Amex,,,,,,,1700000000,1700000000,Personal`;
check(detectFormat(proton) === 'protonpass-csv', `detects Proton Pass CSV (${detectFormat(proton)})`);
const pp = parseImport(proton);
check(pp.ok && pp.items?.length === 3, `Proton CSV: 3 items (${pp.items?.length})`);
check(item(pp, 0).email === 'me@proton.me' && item(pp, 0).username === 'matt', 'Proton CSV: email and username kept apart');
check(item(pp, 0).totpSecret === 'GEZDGNBV', 'Proton CSV: otpauth URI reduced to secret');
check(item(pp, 1).type === 'note', 'Proton CSV: note');
// Proton's CSV names credit cards but omits every card column, so the row has a
// title and nothing else. It must still import rather than vanishing silently.
check(item(pp, 2).type === 'card', `Proton CSV: creditCard -> card (${item(pp, 2).type})`);
check(item(pp, 2).title === 'Amex', 'Proton CSV: field-less card row kept, not dropped');
check(pp.folders?.includes('Personal') === true, `Proton CSV: vault as folder (${pp.folders})`);

// --- Bitwarden CSV ---
const bwCsv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
Work,1,login,Jira,,,0,https://jira.x,matt,pw9,JBSWY3DPEHPK3PXP
,0,note,Recovery codes,"1234 5678",,0,,,,`;
check(detectFormat(bwCsv) === 'bitwarden-csv', `detects Bitwarden CSV (${detectFormat(bwCsv)})`);
const bc = parseImport(bwCsv);
check(bc.ok && bc.items?.length === 2, `Bitwarden CSV: 2 items (${bc.items?.length})`);
check(item(bc, 0).url === 'https://jira.x' && item(bc, 0).password === 'pw9', 'Bitwarden CSV: login_* columns mapped');
check(item(bc, 1).type === 'note', 'Bitwarden CSV: type column honoured');

// --- 1Password CSV ---
const onepw = `Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes
Netflix,https://netflix.com,matt,pw5,otpauth://totp/N?secret=MFRGGZDF,false,false,Media,`;
check(detectFormat(onepw) === 'onepassword-csv', `detects 1Password CSV (${detectFormat(onepw)})`);
const op = parseImport(onepw);
check(op.ok && item(op).totpSecret === 'MFRGGZDF', '1Password: OTPAuth mapped');

// --- Apple Passwords (Safari / iCloud) ---
const apple = `Title,URL,Username,Password,Notes,OTPAuth
Apple ID,https://appleid.apple.com,me@icloud.com,pw7,,`;
check(detectFormat(apple) === 'apple-csv', `detects Apple Passwords CSV (${detectFormat(apple)})`);
check(parseImport(apple).ok === true, 'Apple Passwords parses');

// --- Firefox ---
const firefox = `"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"
"https://news.ycombinator.com","matt","pw8",,"https://news.ycombinator.com","{abc}","1700000000","1700000000","1700000000"`;
check(detectFormat(firefox) === 'firefox-csv', `detects Firefox CSV (${detectFormat(firefox)})`);
const ff = parseImport(firefox);
check(ff.ok && item(ff).title === 'https://news.ycombinator.com', 'Firefox: URL used as title when unnamed');

// --- KeePassXC ---
const kpxc = `"Group","Title","Username","Password","URL","Notes","TOTP","Icon","Last Modified","Created"
"Root/Email","Fastmail","matt","pw6","https://fastmail.com","","otpauth://totp/F?secret=MZXW6","0","",""`;
check(detectFormat(kpxc) === 'keepassxc-csv', `detects KeePassXC CSV (${detectFormat(kpxc)})`);
const kx = parseImport(kpxc);
check(kx.ok && item(kx).totpSecret === 'MZXW6', 'KeePassXC: TOTP column mapped');
check(kx.folders?.includes('Root/Email') === true, `KeePassXC: group as folder (${kx.folders})`);

// --- Classic KeePass 2 ---
const kp = `"Account","Login Name","Password","Web Site","Comments"
"Router","admin","admin123","192.168.1.1","home"`;
check(detectFormat(kp) === 'keepass-csv', `detects KeePass CSV (${detectFormat(kp)})`);
check(item(parseImport(kp)).username === 'admin', 'KeePass: fields mapped');

// --- RoboForm ---
const roboform = `Url,Name,MatchUrl,Login,Pwd,Note,Folder
https://ebay.co.uk,eBay,https://ebay.co.uk,matt,pw10,,Shopping`;
check(detectFormat(roboform) === 'roboform-csv', `detects RoboForm CSV (${detectFormat(roboform)})`);
const rf = parseImport(roboform);
check(rf.ok && item(rf).password === 'pw10', 'RoboForm: Pwd column mapped');

// --- Zoho Vault (credentials live inside a JSON column) ---
const zoho = `Secret Name,Description,Secret Type,Tags,SecretData,CustomData,Classification,Favorite,URLs,Chamber
AWS root,prod account,Web Account,,"{""username"":""root"",""password"":""pw11""}",,,0,https://aws.amazon.com,Infra`;
check(detectFormat(zoho) === 'zoho-csv', `detects Zoho CSV (${detectFormat(zoho)})`);
const zv = parseImport(zoho);
check(zv.ok === true, 'Zoho parses');
check(item(zv).password === 'pw11', `Zoho: password lifted out of SecretData (${item(zv).password})`);
check(item(zv).username === 'root', 'Zoho: username lifted out of SecretData');
check(item(zv).title === 'AWS root', 'Zoho: Secret Name as title');

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
check(item(b).totpSecret === 'GEZDGNBV', 'Bitwarden: otpauth:// URI reduced to secret');
check(item(b).folderName === 'Work', 'Bitwarden: folder name resolved from id');
check(item(b, 1).type === 'note', 'Bitwarden: secure note');
check(item(b, 2).cardExpiry === '03/27', `Bitwarden: card expiry normalised (${item(b, 2).cardExpiry})`);

// Bitwarden identity rows carry their fields under `identity`.
const bwId = JSON.stringify({ items: [{ type: 4, name: 'Me', identity: { firstName: 'Matt', lastName: 'Smith', phone: '07700900123', address1: '1 High St', city: 'London' } }] });
const bi = parseImport(bwId);
check(bi.ok && item(bi).type === 'identity', 'Bitwarden: identity imported');
check(item(bi).firstName === 'Matt' && /London/.test(item(bi).address || ''), 'Bitwarden: identity fields mapped');

// --- Proton Pass JSON (items keyed by vault) ---
const protonJson = JSON.stringify({
  version: '1.10.0', encrypted: false,
  vaults: {
    v1: {
      name: 'Personal',
      items: [
        { itemId: 'i1', data: { type: 'login', metadata: { name: 'Proton', note: 'hi' }, content: { itemEmail: 'me@proton.me', itemUsername: 'matt', password: 'pw1', urls: ['https://proton.me'], totpUri: 'otpauth://totp/P?secret=GEZDGNBV' } } },
        { itemId: 'i2', data: { type: 'creditCard', metadata: { name: 'Amex', note: '' }, content: { number: '378282246310005', expirationDate: '2029-07', verificationNumber: '1234', cardholderName: 'M Smith' } } },
        { itemId: 'i3', data: { type: 'note', metadata: { name: 'Codes', note: 'abc' }, content: {} } },
      ],
    },
  },
});
check(detectFormat(protonJson) === 'protonpass-json', `detects Proton Pass JSON (${detectFormat(protonJson)})`);
const pj = parseImport(protonJson);
check(pj.ok && pj.items?.length === 3, `Proton JSON: 3 items (${pj.items?.length})`);
check(item(pj, 0).totpSecret === 'GEZDGNBV', 'Proton JSON: totpUri reduced to secret');
check(item(pj, 0).url === 'https://proton.me', 'Proton JSON: first url taken');
check(item(pj, 1).cardExpiry === '07/29', `Proton JSON: YYYY-MM expiry -> MM/YY (${item(pj, 1).cardExpiry})`);
check(item(pj, 2).type === 'note', 'Proton JSON: note');
check(pj.folders?.includes('Personal') === true, `Proton JSON: vault as folder (${pj.folders})`);
check(item(pj, 0).externalId === 'protonpass:i1', 'Proton JSON: externalId kept for dedupe');

// --- Keeper JSON (TOTP hidden in a custom field) ---
const keeper = JSON.stringify({
  records: [{
    uid: 'k1', title: 'Keeper entry', login: 'matt', password: 'pw12',
    login_url: 'https://keepersecurity.com', notes: 'n',
    custom_fields: { 'TFC:Keeper': 'otpauth://totp/K?secret=MFRGGZDF' },
    folders: [{ folder: 'Vault' }],
  }],
});
check(detectFormat(keeper) === 'keeper-json', `detects Keeper JSON (${detectFormat(keeper)})`);
const kj = parseImport(keeper);
check(kj.ok && item(kj).password === 'pw12', 'Keeper: fields mapped');
check(item(kj).totpSecret === 'MFRGGZDF', `Keeper: TFC:Keeper custom field read (${item(kj).totpSecret})`);
check(kj.folders?.includes('Vault') === true, `Keeper: folder (${kj.folders})`);

// --- Enpass JSON (labelled field lists) ---
const enpass = JSON.stringify({
  folders: [{ uuid: 'fd1', title: 'Banking' }],
  items: [
    {
      uuid: 'e1', title: 'Monzo', category: 'login', note: 'n', folders: ['fd1'],
      fields: [
        { label: 'Username', type: 'username', value: 'matt' },
        { label: 'Password', type: 'password', value: 'pw13' },
        { label: 'Website', type: 'url', value: 'https://monzo.com' },
        { label: 'One-time code', type: 'totp', value: 'otpauth://totp/M?secret=MZXW6YTB' },
      ],
    },
    {
      uuid: 'e2', title: 'Mastercard', category: 'creditcard', note: '',
      fields: [
        { label: 'Number', type: 'ccNumber', value: '5555555555554444' },
        { label: 'CVC', type: 'ccCvc', value: '999' },
        { label: 'Expiry date', type: 'ccExpiry', value: '12/2030' },
      ],
    },
  ],
});
check(detectFormat(enpass) === 'enpass-json', `detects Enpass JSON (${detectFormat(enpass)})`);
const ej = parseImport(enpass);
check(ej.ok && ej.items?.length === 2, `Enpass: 2 items (${ej.items?.length})`);
check(item(ej, 0).password === 'pw13' && item(ej, 0).url === 'https://monzo.com', 'Enpass: fields read by type');
check(item(ej, 0).totpSecret === 'MZXW6YTB', 'Enpass: totp field reduced to secret');
check(item(ej, 0).folderName === 'Banking', 'Enpass: folder resolved from uuid');
check(item(ej, 1).type === 'card' && item(ej, 1).cardNumber === '5555555555554444', 'Enpass: card');

// --- MSec's own formats still work ---
const mine = JSON.stringify({ format: 'msec-vault-transfer', items: [{ id: 'abc', type: 'login', title: 'Self', password: 'p' }] });
check(detectFormat(mine) === 'msec-transfer', 'detects MSec transfer file');
check(item(parseImport(mine)).id === 'abc', 'MSec transfer: item id preserved');

// --- Files we recognise but cannot read: the error must say what to do ---
const zip = parseImport('PK\u0003\u0004rest of a zip', 'export.1pux');
check(zip.ok === false && /unzip/i.test(zip.error || ''), `1pux: explains unzipping (${zip.error?.slice(0, 40)}…)`);
const kdbx = parseImport('binary junk', 'Passwords.kdbx');
check(kdbx.ok === false && /KeePassXC/.test(kdbx.error || ''), 'kdbx: points at KeePassXC export');
const enc = parseImport(JSON.stringify({ encrypted: true, passwordProtected: true, data: 'xxx' }));
check(enc.ok === false && /encryption turned off/i.test(enc.error || ''), 'encrypted export: says to re-export unencrypted');

// --- Failure modes ---
check(parseImport('not a file at all').ok === false, 'rejects junk');
check(parseImport('{"nope":1}').ok === false, 'rejects unrelated JSON');
const noCreds = parseImport('name,url\nx,y', 'x.csv');
check(noCreds.ok === false && /header row/i.test(noCreds.error || ''), 'CSV with no credential column explains the header requirement');
check(parseImport('name,url,password\n').ok === false, 'rejects a header with no rows');

console.log(fail ? `\n${fail} FAILED` : '\nImporters verified.');
process.exit(fail?1:0);
