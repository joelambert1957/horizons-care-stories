(function () {
  const listEl = document.getElementById('montageList');
  const emptyEl = document.getElementById('montageEmpty');
  const montages = (window.MONTAGES || [])
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!montages.length) {
    emptyEl.classList.add('show');
    return;
  }

  montages.forEach((m, i) => {
    const li = document.createElement('li');
    li.className = 'montage-item';

    const title = document.createElement('h2');
    title.className = 'montage-title';
    title.textContent = `${i + 1}. ${m.title}`;
    li.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'montage-meta';
    meta.textContent = [formatDate(m.date), m.location].filter(Boolean).join(' · ');
    li.appendChild(meta);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = m.audio;
    li.appendChild(audio);

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
