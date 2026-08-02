(function () {
  const loginEl = document.getElementById('adminLogin');
  const panelEl = document.getElementById('adminPanel');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');

  const rows = {
    submission: document.getElementById('rowSubmission'),
    vertex: document.getElementById('rowVertex'),
  };

  let pollTimer = null;

  function getPassword() {
    return sessionStorage.getItem('horizonsAdminPassword') || '';
  }

  function setRow(which, state) {
    const row = rows[which];
    const dot = row.querySelector('.admin-dot');
    const detail = row.querySelector('.admin-row-detail');
    const btn = row.querySelector('button');

    if (!state) {
      dot.className = 'admin-dot pending';
      detail.textContent = 'Checking…';
      return;
    }

    dot.className = 'admin-dot ' + (state.ok ? 'ok' : 'bad');
    detail.textContent = state.ok
      ? `Connected (${state.source})`
      : `${state.error || 'Not connected'} (${state.source})`;
    btn.disabled = false;
  }

  async function checkHealth() {
    const res = await fetch('/.netlify/functions/admin-health', {
      headers: { 'X-Admin-Password': getPassword() },
    });
    if (res.status === 401) {
      showLogin('Session expired -- log in again.');
      return;
    }
    const data = await res.json();
    setRow('submission', data.submission);
    setRow('vertex', data.vertex);
  }

  function showLogin(message) {
    sessionStorage.removeItem('horizonsAdminPassword');
    loginEl.classList.add('show');
    panelEl.classList.remove('show');
    if (message) {
      loginError.textContent = message;
      loginError.style.display = 'block';
    }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function showPanel() {
    loginEl.classList.remove('show');
    panelEl.classList.add('show');
    checkHealth();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkHealth, 5000);
  }

  async function tryLogin() {
    const password = passwordInput.value;
    if (!password) return;
    const res = await fetch('/.netlify/functions/admin-health', {
      headers: { 'X-Admin-Password': password },
    });
    if (res.status === 401) {
      loginError.textContent = 'Incorrect password.';
      loginError.style.display = 'block';
      return;
    }
    sessionStorage.setItem('horizonsAdminPassword', password);
    showPanel();
  }

  loginBtn.addEventListener('click', tryLogin);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
  });

  document.querySelectorAll('button[data-which]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const which = btn.dataset.which;
      const res = await fetch('/.netlify/functions/admin-oauth-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': getPassword() },
        body: JSON.stringify({ which }),
      });
      if (res.status === 401) { showLogin('Session expired -- log in again.'); return; }
      const { ticket } = await res.json();
      window.open(`/.netlify/functions/admin-oauth-start?ticket=${ticket}`, '_blank');
      btn.disabled = false;
    });
  });

  if (getPassword()) {
    showPanel();
  } else {
    showLogin();
  }
})();
