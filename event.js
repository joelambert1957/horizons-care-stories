(function () {
  const contentEl = document.getElementById('eventContent');
  const notFoundEl = document.getElementById('eventNotFound');

  function getSlug() {
    // Production: Netlify rewrites /events/<slug> to this page (see
    // netlify.toml), so the real path is still visible to JS. Fall back to
    // ?slug= for local testing without that rewrite in front of it.
    const match = window.location.pathname.match(/\/events\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
    return new URLSearchParams(window.location.search).get('slug');
  }

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

  const slug = getSlug();
  const event = (window.EVENTS || []).find((ev) => ev.slug === slug);

  if (!event) {
    notFoundEl.style.display = 'block';
    return;
  }

  document.title = `Horizon's Project — ${event.title}`;

  const h1 = document.createElement('h1');
  h1.textContent = event.title;
  contentEl.appendChild(h1);

  const meta = document.createElement('p');
  meta.className = 'event-meta';
  meta.textContent = [formatDate(event.date), event.location].filter(Boolean).join(' · ');
  contentEl.appendChild(meta);

  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = event.audio;
  audio.className = 'event-audio';
  contentEl.appendChild(audio);

  const portraits = event.portraits || [];
  if (portraits.length) {
    const heading = document.createElement('p');
    heading.className = 'portraits-heading';
    heading.textContent = 'Voices from this evening';
    contentEl.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'portrait-grid';
    portraits.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'portrait-card';

      const img = document.createElement('img');
      img.src = p.photo;
      img.alt = p.name || '';
      img.loading = 'lazy';
      card.appendChild(img);

      if (p.name) {
        const name = document.createElement('p');
        name.className = 'portrait-name';
        name.textContent = p.name;
        card.appendChild(name);
      }

      grid.appendChild(card);
    });
    contentEl.appendChild(grid);
  }
})();
