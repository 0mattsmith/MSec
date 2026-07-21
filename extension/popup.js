const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
const $ = (id) => document.getElementById(id);

function show(view) {
  for (const v of ['config', 'signin', 'unlock', 'unlocked']) {
    $(`view-${v}`).classList.toggle('hidden', v !== view);
  }
}

async function refresh() {
  const s = await send({ type: 'status' });
  const badge = $('state-badge');
  if (!s || s.error) {
    badge.textContent = '';
    show('signin');
    $('signin-err').textContent = s?.error || 'Extension error';
    return;
  }
  $('redirect-uri').textContent = s.redirectUri;
  if (!s.configured) {
    badge.textContent = '';
    show('config');
  } else if (!s.signedIn) {
    badge.textContent = '';
    show('signin');
  } else if (!s.unlocked) {
    badge.className = 'badge locked';
    badge.textContent = 'Locked';
    $('unlock-email').textContent = `Signed in as ${s.email}`;
    show('unlock');
    $('master-password').focus();
  } else {
    badge.className = 'badge unlocked';
    badge.textContent = 'Unlocked';
    $('unlocked-info').textContent = `Signed in as ${s.email}. Vault unlocked.`;
    show('unlocked');
  }
}

$('btn-signin').addEventListener('click', async () => {
  $('signin-err').textContent = '';
  const res = await send({ type: 'signin' });
  if (res?.error) $('signin-err').textContent = res.error;
  refresh();
});

async function doUnlock() {
  $('unlock-err').textContent = '';
  const password = $('master-password').value;
  if (!password) return;
  $('btn-unlock').textContent = 'Decrypting…';
  const res = await send({ type: 'unlock', password });
  $('btn-unlock').textContent = 'Unlock vault';
  if (res?.error) {
    $('unlock-err').textContent = res.error;
  } else {
    $('master-password').value = '';
  }
  refresh();
}
$('btn-unlock').addEventListener('click', doUnlock);
$('master-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });

$('btn-lock').addEventListener('click', async () => { await send({ type: 'lock' }); refresh(); });
for (const id of ['btn-signout-1', 'btn-signout-2']) {
  $(id).addEventListener('click', async () => { await send({ type: 'signout' }); refresh(); });
}

refresh();
