/*
 * MSec content script: decorates login fields with the MSec icon and a
 * dropdown offering autofill for matched credentials or saving new ones.
 * All vault access goes through the background worker via messaging —
 * this script only ever receives credentials the user explicitly picks.
 */
(() => {
  const ICON_URL = chrome.runtime.getURL('icons/icon-32.png');
  const HOST = location.hostname;
  let panel = null;
  const decorated = new WeakSet();

  const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  function nativeSet(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findUsernameField(passwordEl) {
    const form = passwordEl.form || document;
    const candidates = [...form.querySelectorAll('input[type="text"], input[type="email"], input:not([type])')]
      .filter(el => el.offsetParent !== null && !el.readOnly && !el.disabled);
    // Prefer fields with username/email hints, else the last text field before the password.
    const hinted = candidates.find(el =>
      /user|email|login|account/i.test(`${el.name} ${el.id} ${el.autocomplete} ${el.placeholder}`));
    if (hinted) return hinted;
    const before = candidates.filter(el =>
      el.compareDocumentPosition(passwordEl) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before[before.length - 1] || candidates[0] || null;
  }

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  function fill(usernameEl, passwordEl, cred) {
    if (usernameEl && cred.username) nativeSet(usernameEl, cred.username);
    if (passwordEl && cred.password) nativeSet(passwordEl, cred.password);
    closePanel();
  }

  function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_';
    const rand = crypto.getRandomValues(new Uint32Array(18));
    return [...rand].map(n => chars[n % chars.length]).join('');
  }

  async function openPanel(anchorEl, usernameEl, passwordEl) {
    closePanel();
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
      for (const cred of res.credentials) {
        addRow(cred.title || cred.username || 'Login', cred.username, () => fill(usernameEl, passwordEl, cred));
      }
      if (res.credentials.length === 0) {
        addRow('No saved logins for this site', HOST, () => {});
      }
      addRow('Create login for this site', 'Saves the entered (or a generated) password', async () => {
        const username = usernameEl?.value || '';
        let password = passwordEl?.value || '';
        if (!password) {
          password = generatePassword();
          if (passwordEl) nativeSet(passwordEl, password);
        }
        const saveRes = await send({ type: 'save-credential', host: HOST, username, password });
        closePanel();
        if (saveRes?.error) alert(`MSec: ${saveRes.error}`);
      }, true);
    }

    document.body.append(panel);
  }

  function positionIcon(icon, input) {
    const rect = input.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { icon.style.display = 'none'; return; }
    icon.style.display = 'block';
    icon.style.top = `${rect.top + window.scrollY + (rect.height - 20) / 2}px`;
    icon.style.left = `${rect.right + window.scrollX - 26}px`;
  }

  function decorate(passwordEl) {
    if (decorated.has(passwordEl)) return;
    decorated.add(passwordEl);
    const usernameEl = findUsernameField(passwordEl);

    const makeIcon = (input) => {
      const icon = document.createElement('img');
      icon.src = ICON_URL;
      icon.className = 'msec-field-icon';
      icon.title = 'MSec - autofill or save login';
      icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPanel(input, usernameEl, passwordEl);
      });
      document.body.append(icon);
      positionIcon(icon, input);
      const reposition = () => positionIcon(icon, input);
      window.addEventListener('scroll', reposition, { passive: true, capture: true });
      window.addEventListener('resize', reposition, { passive: true });
      setInterval(reposition, 1500); // layout drift safety net
    };

    makeIcon(passwordEl);
    if (usernameEl) makeIcon(usernameEl);
  }

  function scan() {
    document.querySelectorAll('input[type="password"]').forEach((el) => {
      if (el.offsetParent !== null) decorate(el);
    });
  }

  document.addEventListener('click', (e) => {
    if (panel && !panel.contains(e.target) && !(e.target instanceof HTMLImageElement && e.target.classList.contains('msec-field-icon'))) {
      closePanel();
    }
  }, true);

  scan();
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
})();
