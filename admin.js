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

  // --- Event data -----------------------------------------------------

  const eventNameInput = document.getElementById('eventNameInput');
  const loadEventBtn = document.getElementById('loadEventBtn');
  const eventLoadStatus = document.getElementById('eventLoadStatus');
  const submissionCardsEl = document.getElementById('submissionCards');
  const eventFieldsEl = document.getElementById('eventFields');
  const snippetOutputEl = document.getElementById('snippetOutput');
  const snippetTextEl = document.getElementById('snippetText');

  let currentSubmissions = [];

  function slugify(value) {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function escapeJsString(value) {
    return (value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function renderSubmissionCards() {
    submissionCardsEl.innerHTML = '';
    currentSubmissions.forEach((sub, i) => {
      const card = document.createElement('div');
      card.className = 'submission-card';

      const nameLabel = document.createElement('label');
      nameLabel.className = 'admin-label';
      nameLabel.textContent = `Display name (submitted as "${sub.name || 'blank'}"${sub.city ? ', ' + sub.city : ''})`;
      card.appendChild(nameLabel);

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'admin-input';
      nameInput.value = sub.name || '';
      nameInput.dataset.field = 'displayName';
      card.appendChild(nameInput);

      const photoLabel = document.createElement('label');
      photoLabel.className = 'admin-label';
      photoLabel.textContent = 'Portrait file (drop the actual file in /portraits/ yourself)';
      card.appendChild(photoLabel);

      const photoInput = document.createElement('input');
      photoInput.type = 'text';
      photoInput.className = 'admin-input';
      photoInput.value = sub.portraitLink ? `/portraits/${slugify(sub.name) || 'person-' + i}.jpg` : '';
      photoInput.placeholder = sub.portraitLink ? '' : 'No portrait submitted';
      photoInput.dataset.field = 'photo';
      card.appendChild(photoInput);

      const links = document.createElement('div');
      links.className = 'submission-links';
      if (sub.driveLink) {
        const a = document.createElement('a');
        a.href = sub.driveLink; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Recording ↗';
        links.appendChild(a);
      }
      if (sub.transcriptLink) {
        const a = document.createElement('a');
        a.href = sub.transcriptLink; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Transcript ↗';
        links.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className = 'none';
        span.textContent = 'Not yet transcribed';
        links.appendChild(span);
      }
      card.appendChild(links);

      submissionCardsEl.appendChild(card);
    });
  }

  async function loadEvent() {
    const eventName = eventNameInput.value.trim();
    if (!eventName) return;
    eventLoadStatus.textContent = 'Loading…';
    submissionCardsEl.innerHTML = '';
    eventFieldsEl.classList.remove('show');
    snippetOutputEl.classList.remove('show');

    const res = await fetch(`/.netlify/functions/admin-event-submissions?event=${encodeURIComponent(eventName)}`, {
      headers: { 'X-Admin-Password': getPassword() },
    });
    if (res.status === 401) { showLogin('Session expired -- log in again.'); return; }
    if (!res.ok) { eventLoadStatus.textContent = 'Something went wrong loading that event.'; return; }

    const data = await res.json();
    currentSubmissions = data.matches || [];

    if (!currentSubmissions.length) {
      eventLoadStatus.textContent = 'No submissions found for that event name.';
      return;
    }

    eventLoadStatus.textContent = `${currentSubmissions.length} submission(s) found.`;
    renderSubmissionCards();

    const slug = slugify(eventName);
    document.getElementById('fieldTitle').value = eventName;
    document.getElementById('fieldSlug').value = slug;
    document.getElementById('fieldAudio').value = `/montages/${slug}.mp3`;
    if (!document.getElementById('fieldDate').value) {
      document.getElementById('fieldDate').value = new Date().toISOString().slice(0, 10);
    }
    eventFieldsEl.classList.add('show');
  }

  loadEventBtn.addEventListener('click', loadEvent);
  eventNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadEvent(); });

  function generateSnippet() {
    const title = document.getElementById('fieldTitle').value.trim();
    const date = document.getElementById('fieldDate').value.trim();
    const location = document.getElementById('fieldLocation').value.trim();
    const slug = document.getElementById('fieldSlug').value.trim();
    const audio = document.getElementById('fieldAudio').value.trim();
    const description = document.getElementById('fieldDescription').value.trim();

    const cards = submissionCardsEl.querySelectorAll('.submission-card');
    const portraitsLines = [];
    cards.forEach((card, i) => {
      const sub = currentSubmissions[i];
      const displayName = card.querySelector('[data-field="displayName"]').value.trim();
      const photo = card.querySelector('[data-field="photo"]').value.trim();
      const parts = [`name: "${escapeJsString(displayName)}"`];
      if (photo) parts.push(`photo: "${escapeJsString(photo)}"`);
      if (sub.driveLink) parts.push(`recording: "${escapeJsString(sub.driveLink)}"`);
      if (sub.transcriptLink) parts.push(`transcript: "${escapeJsString(sub.transcriptLink)}"`);
      portraitsLines.push(`      { ${parts.join(', ')} },`);
    });

    const descField = description
      ? `\n    description: "${escapeJsString(description).replace(/\n/g, '\\n')}",`
      : '';

    const snippet = `  {
    slug: "${escapeJsString(slug)}",
    title: "${escapeJsString(title)}",
    date: "${escapeJsString(date)}",
    location: "${escapeJsString(location)}",
    audio: "${escapeJsString(audio)}",${descField}
    portraits: [
${portraitsLines.join('\n')}
    ],
  },`;

    snippetTextEl.value = snippet;
    snippetOutputEl.classList.add('show');
  }

  document.getElementById('generateBtn').addEventListener('click', generateSnippet);
  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(snippetTextEl.value);
  });

  if (getPassword()) {
    showPanel();
  } else {
    showLogin();
  }
})();
