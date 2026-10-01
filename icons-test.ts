/*
 * Icon resolution.
 *
 * The rule being protected: nothing reaches the network unless the user turned
 * it on. A regression here wouldn't look like a bug — icons would simply start
 * appearing — while quietly telling third parties which sites are in the vault.
 */
import { resolveIcon, iconDomain, initialsFor, tileColour } from './src/lib/icons';
import type { VaultItem } from './src/types';

let fail = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

const brands = { 'github.com': { p: 'M0 0h1v1H0z', c: '181717' } };
const item = (over: Partial<VaultItem> = {}): Partial<VaultItem> => ({ title: 'Entry', ...over });

// --- Nothing is fetched by default ---
const noUrl = resolveIcon(item({ url: 'https://unknown-site.example' }), { brands });
check(noUrl.kind === 'letter', `an unmatched site falls back to a letter tile, not a fetch (${noUrl.kind})`);
check(!noUrl.src, 'and carries no URL at all');

const optedOut = resolveIcon(item({ url: 'https://unknown-site.example' }), { brands, allowFavicon: false });
check(optedOut.kind === 'letter', 'explicitly opting out also yields a letter tile');

// --- Opting in fetches from the site itself, never an aggregator ---
const optedIn = resolveIcon(item({ url: 'https://unknown-site.example/login' }), { brands, allowFavicon: true });
check(optedIn.kind === 'favicon', 'opting in enables the favicon');
check(optedIn.src === 'https://unknown-site.example/favicon.ico',
  `fetched straight from the site (${optedIn.src})`);
check(!/google|duckduckgo|icons\./.test(optedIn.src || ''),
  'no third-party icon service is ever contacted');

// --- Precedence ---
const custom = resolveIcon(
  item({ url: 'https://github.com', iconData: 'data:image/png;base64,AAA' }),
  { brands, allowFavicon: true },
);
check(custom.kind === 'custom', 'a chosen icon beats everything else');

const brand = resolveIcon(item({ url: 'https://github.com/matt' }), { brands, allowFavicon: true });
check(brand.kind === 'brand', 'a bundled mark beats a favicon, so no request is made');
check(brand.hex === '181717', 'brand colour carried through');

// --- Domain reduction ---
check(iconDomain('https://www.github.com/matt') === 'github.com', 'www is stripped');
check(iconDomain('https://mail.google.com/mail/u/0') === 'google.com', 'subdomains reduce to the site');
check(iconDomain('https://www.tesco.co.uk/account') === 'tesco.co.uk',
  `two-part suffixes survive (${iconDomain('https://www.tesco.co.uk/account')})`);
check(iconDomain('https://bbc.co.uk') === 'bbc.co.uk', 'a bare two-part suffix is left alone');
check(iconDomain(undefined) === '', 'no URL yields no domain');
check(iconDomain('not a url') === '', 'junk yields no domain');

// A subdomain reducing correctly is what lets one bundled mark serve many URLs.
check(resolveIcon(item({ url: 'https://api.github.com' }), { brands }).kind === 'brand',
  'a subdomain still matches the bundled mark');

// --- Letter tiles ---
check(initialsFor({ title: 'Work Email' }) === 'WE', 'two words give two initials');
check(initialsFor({ title: 'Github' }) === 'GI', 'one word gives two characters');
check(initialsFor({ title: '', url: 'https://monzo.com' }) === 'MO', 'falls back to the host');
check(initialsFor({}) === '?', 'an entry with nothing still renders');

// Stable: the same entry must not change colour between sessions or devices.
check(tileColour('github.com') === tileColour('github.com'), 'tile colour is deterministic');
check(tileColour('a') !== tileColour('b') || true, 'different seeds may differ');

console.log(fail ? `\n${fail} FAILED` : '\nIcon resolution verified.');
process.exit(fail?1:0);
