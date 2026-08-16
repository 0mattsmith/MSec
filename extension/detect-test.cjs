// Field-detection tests for the MSec extension.
// Run: node extension/detect-test.cjs
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'content.js'), 'utf8');
const STRONG = eval(src.match(/const STRONG = (\/.*?\/i);/)[1]);
const NEGATIVE = eval(src.match(/const NEGATIVE = (\/.*?\/i);/)[1]);
const POSITIVE = eval(src.match(/const POSITIVE = (\/.*?\/i);/)[1]);

function describe(el) {
  return `${el.name || ''} ${el.id || ''} ${el.autocomplete || ''} ${el.placeholder || ''} ${el['aria-label'] || ''} ${el.testid || ''}`;
}
function isIdentity(el) {
  const type = (el.type || 'text').toLowerCase();
  if (!['text', 'email', 'tel', ''].includes(type)) return false;
  const desc = describe(el);
  if (type === 'email' || /^(username|email)$/i.test(el.autocomplete || '')) return true;
  if (STRONG.test(desc)) return true;
  if (NEGATIVE.test(desc)) return false;
  return POSITIVE.test(desc);
}

const cases = [
  // [field, shouldDetect, label]
  [{ type: 'email', name: 'email' }, true, 'Google/standard email field'],
  [{ type: 'text', autocomplete: 'username' }, true, 'autocomplete=username (Microsoft)'],
  [{ type: 'text', name: 'loginfmt' }, true, 'Microsoft loginfmt'],
  [{ type: 'text', id: 'user_login' }, true, 'WordPress login'],
  [{ type: 'text', name: 'session[username_or_email]' }, true, 'Twitter/X style'],
  [{ type: 'text', placeholder: 'Username or email' }, true, 'placeholder only'],
  [{ type: 'text', 'aria-label': 'Email address' }, true, 'aria-label only'],
  [{ type: 'text', name: 'account' }, true, 'account field'],
  // Should NOT be decorated
  [{ type: 'text', name: 'q' }, false, 'search box (name=q)'],
  [{ type: 'text', name: 'search_query' }, false, 'YouTube search'],
  [{ type: 'text', placeholder: 'Search products' }, false, 'search placeholder'],
  [{ type: 'text', name: 'promo_code' }, false, 'promo code'],
  [{ type: 'text', name: 'card_number' }, false, 'card number'],
  [{ type: 'text', name: 'otp_code' }, false, 'OTP field'],
  [{ type: 'text', name: 'comment' }, false, 'comment box'],
  [{ type: 'text', name: 'street_address' }, false, 'address'],
  [{ type: 'text', name: 'first_name' }, false, 'plain name field'],
  [{ type: 'text', name: 'city' }, false, 'city'],
  // Tricky: email in a newsletter signup — acceptable to detect (user may want masked email)
  [{ type: 'email', name: 'newsletter_email' }, true, 'newsletter email (acceptable)'],
  [{ type: 'text', placeholder: 'Email address' }, true, 'Email address placeholder (regression)'],
  [{ type: 'text', name: 'billing_address' }, false, 'billing address still ignored'],
  [{ type: 'text', name: 'user_search' }, false, 'user search still ignored'],
  [{ type: 'text', 'aria-label': 'Sign in with username' }, true, 'sign-in aria-label'],
];

let pass = 0, fail = 0;
for (const [field, expected, label] of cases) {
  const got = isIdentity(field);
  if (got === expected) { pass++; console.log(`  PASS  ${got ? 'detect' : 'ignore'}  ${label}`); }
  else { fail++; console.log(`  FAIL  expected ${expected ? 'detect' : 'ignore'}, got ${got ? 'detect' : 'ignore'}  ${label}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
