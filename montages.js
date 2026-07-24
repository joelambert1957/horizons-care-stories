(function () {
  const listEl = document.getElementById('montageList');
  const emptyEl = document.getElementById('montageEmpty');
  const events = (window.EVENTS || [])
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!events.length) {
    emptyEl.classList.add('show');
    return;
  }

  events.forEach((ev, i) => {
    const li = document.createElement('li');
    li.className = 'montage-item';

    const link = document.createElement('a');
    link.href = `events/${ev.slug}`;
    link.className = 'montage-link';

    const title = document.createElement('h2');
    title.className = 'montage-title';
    title.textContent = `${i + 1}. ${ev.title}`;
    link.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'montage-meta';
    meta.textContent = [formatDate(ev.date), ev.location].filter(Boolean).join(' · ');
    link.appendChild(meta);

    li.appendChild(link);
    listEl.appendChild(li);
  });

  function formatDate(iso) {
    if (!iso) return '';
    const [y, mo, d] = iso.split('-').map(Number);
    if (!y || !mo || !d) return iso;
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
})();
