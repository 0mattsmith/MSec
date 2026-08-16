/*
 * MSec content script: decorates login-related fields with the MSec icon and a
 * dropdown offering autofill, saving, or password generation.
 *
 * Fields are detected independently, so two-step logins (email first, password
 * on the next screen) and signup forms get the icon too. All vault access goes
 * through the background worker — this script only receives credentials the
 * user explicitly picks.
 */
(() => {
  const ICON_URL = chrome.runtime.getURL('icons/icon-32.png');
  const HOST = location.hostname;
  let panel = null;
  const decorated = new WeakSet();

  const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  // Fields that look identity-ish but aren't logins.
  // STRONG wins outright ("Email address" is a login field despite "address").
  const STRONG = /e-?mail|user\s?name|username|login|sign[-\s]?in/i;
  const NEGATIVE = /search|query|coupon|promo|card|credit|cvv|phone|mobile|zip|postal|address|street|city|otp|2fa|verification|captcha|comment|message|subject|amount|quantity|birth/i;
  const POSITIVE = /user|account|signin/i;

  function describe(el) {
    return `${el.name || ''} ${el.id || ''} ${el.autocomplete || ''} ${el.placeholder || ''} ` +
      `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-testid') || ''}`;
  }

  function isVisible(el) {
    if (el.offsetParent === null || el.readOnly || el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 30 && r.height > 8;
  }

  /** Username/email fields, judged on their own merits (no password required). */
  function isIdentityField(el) {
    if (!(el instanceof HTMLInputElement) || !isVisible(el)) return false;
    const type = (el.type || 'text').toLowerCase();
    if (!['text', 'email', 'tel', ''].includes(type)) return false;
    const desc = describe(el);
    if (type === 'email' || /^(username|email)$/i.test(el.autocomplete || '')) return true;
    if (STRONG.test(desc)) return true;
    if (NEGATIVE.test(desc)) return false;
    return POSITIVE.test(desc);
  }

  function isPasswordField(el) {
    return el instanceof HTMLInputElement && el.type === 'password' && isVisible(el);
  }

  /** Resolve the partner field at click time — SPAs add fields after load. */
  function findPartner(el, want) {
    const scope = el.form || document;
    const all = [...scope.querySelectorAll('input')].filter(isVisible);
    const matches = all.filter(want === 'password' ? isPasswordField : isIdentityField);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    // Prefer the nearest field in document order.
    let best = matches[0];
    let bestDist = Infinity;
    for (const m of matches) {
      const dist = Math.abs(m.getBoundingClientRect().top - el.getBoundingClientRect().top);
      if (dist < bestDist) { bestDist = dist; best = m; }
    }
    return best;
  }

  function nativeSet(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_';
    const rand = crypto.getRandomValues(new Uint32Array(18));
    return [...rand].map(n => chars[n % chars.length]).join('');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false; // clipboard blocked without user gesture on some sites
    }
  }

  async function openPanel(anchorEl) {
    closePanel();

    // Work out the pair fresh each time the panel opens.
    const passwordEl = isPasswordField(anchorEl) ? anchorEl : findPartner(anchorEl, 'password');
    const usernameEl = isIdentityField(anchorEl) ? anchorEl : findPartner(anchorEl, 'username');

    panel = document.createElement('div');
    panel.className = 'msec-panel';
    const rect = anchorEl.getBoundingClientRect();
    panel.style.top = `${rect.bottom + window.scrollY + 6}px`;
    panel.style.left = `${Math.max(8, rect.right + window.scrollX - 280)}px`;

    const head = document.createElement('div');
    head.className = 'msec-head';
    const headIcon = document.createElement('img');
    headIcon.src = ICON_URL;
    headIcon.style.cssText = 'width:14px;height:14px;border-radius:3px;';
    head.append(headIcon, document.createTextNode('MSec'));
    panel.append(head);

    const addRow = (title, sub, onClick, accent = false) => {
      const row = document.createElement('button');
      row.className = 'msec-row';
      row.type = 'button';
      const t = document.createElement('span');
      t.className = `msec-title${accent ? ' msec-accent' : ''}`;
      t.textContent = title;
      row.append(t);
      if (sub) {
        const s = document.createElement('span');
        s.className = 'msec-sub';
        s.textContent = sub;
        row.append(s);
      }
      row.addEventListener('click', onClick);
      panel.append(row);
      return row;
    };

    const res = await send({ type: 'get-credentials', host: HOST });

    if (!res || res.error) {
      addRow('MSec unavailable', res?.error || 'Try reloading the extension.', closePanel);
    } else if (res.locked) {
      addRow('Unlock MSec', 'Opens the extension to sign in / unlock', async () => {
        await send({ type: 'open-unlock' });
        closePanel();
      }, true);
    } else {
      // Saved logins for this site
      for (const cred of res.credentials) {
        addRow(cred.title || cred.username || 'Login', cred.username, () => {
          if (usernameEl && cred.username) nativeSet(usernameEl, cred.username);
          if (passwordEl && cred.password) nativeSet(passwordEl, cred.password);
          // Nothing to fill here (e.g. email-first screen with no password box):
          // put the username in at least, which is what the user came for.
          closePanel();
        });
      }
      if (res.credentials.length === 0) {
        addRow('No saved logins for this site', HOST, () => {});
      }

      // Explicit password generation — useful on signup forms.
      addRow('Generate password', passwordEl ? 'Fills the password field and copies it' : 'Copies a strong password to the clipboard', async (e) => {
        e.stopPropagation();
        const pw = generatePassword();
        if (passwordEl) nativeSet(passwordEl, pw);
        const copied = await copyText(pw);
        closePanel();
        if (!passwordEl && !copied) alert(`MSec generated password:\n\n${pw}`);
      }, true);

      addRow('Save login for this site', 'Stores the current username and password', async () => {
        const username = usernameEl?.value || '';
        let password = passwordEl?.value || '';
        if (!password) {
          password = generatePassword();
          if (passwordEl) nativeSet(passwordEl, password);
        }
        const saveRes = await send({ type: 'save-credential', host: HOST, username, password });
        closePanel();
        if (saveRes?.error) alert(`MSec: ${saveRes.error}`);
      });
    }

    document.body.append(panel);
  }

  function positionIcon(icon, input) {
    const rect = input.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || input.offsetParent === null) {
      icon.style.display = 'none';
      return;
    }
    icon.style.display = 'block';
    icon.style.top = `${rect.top + window.scrollY + (rect.height - 20) / 2}px`;
    icon.style.left = `${rect.right + window.scrollX - 26}px`;
  }

  function decorate(input) {
    if (decorated.has(input)) return;
    decorated.add(input);

    const icon = document.createElement('img');
    icon.src = ICON_URL;
    icon.className = 'msec-field-icon';
    icon.title = 'MSec — autofill, generate, or save';
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel(input);
    });
    document.body.append(icon);
    positionIcon(icon, input);

    const reposition = () => positionIcon(icon, input);
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    window.addEventListener('resize', reposition, { passive: true });
    setInterval(reposition, 1500); // layout drift safety net
  }

  function scan() {
    document.querySelectorAll('input').forEach((el) => {
      if (isPasswordField(el) || isIdentityField(el)) decorate(el);
    });
  }

  document.addEventListener('click', (e) => {
    if (panel && !panel.contains(e.target) &&
        !(e.target instanceof HTMLImageElement && e.target.classList.contains('msec-field-icon'))) {
      closePanel();
    }
  }, true);

  scan();
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
})();
