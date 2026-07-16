/* ============================================================
   TuneFinder — Application Logic
   Two modes:
     1. "stream" — iTunes Search API (previews + Apple Music links)
     2. "free"   — Internet Archive (public-domain / CC downloads)
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Config ---------- */
  const ITUNES_API  = 'https://itunes.apple.com/search';
  const ARCHIVE_API = 'https://archive.org/advancedsearch.php';
  const META_API    = 'https://archive.org/metadata/';

  const STREAM_TIPS = ['Adele Hello', 'The Weeknd Blinding Lights', 'Taylor Swift', 'Daft Punk'];
  const FREE_TIPS   = ['Beethoven Symphony', 'Scott Joplin ragtime', 'Vivaldi', 'Debussy'];

  const MODE_TEXT = {
    stream: 'Streaming mode: 30-second preview + links to Apple Music for the full song.',
    free:   'Free Downloads mode: searching Internet Archive audio — public-domain & Creative Commons tracks only.'
  };

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);
  const form          = $('searchForm');
  const input         = $('searchInput');
  const statusEl      = $('status');
  const resultsEl     = $('results');
  const modal         = $('modal');
  const modalContent  = $('modalContent');
  const modeHelp      = $('modeHelp');
  const examplesEl    = $('examples');

  /* ---------- State ---------- */
  let currentAudio = null;
  let mode         = 'stream';
  let lastQuery    = '';

  /* ---------- Init ---------- */
  function init() {
    bindModeSwitch();
    bindSearchForm();
    bindModalDismiss();
    renderExamples();
    doSearch('top hits 2024');
  }

  /* ---------- Mode switch ---------- */
  function bindModeSwitch() {
    document.querySelectorAll('#modeSegment button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#modeSegment button')
          .forEach((x) => {
            x.classList.remove('active');
            x.setAttribute('aria-selected', 'false');
          });
        b.classList.add('active');
        b.setAttribute('aria-selected', 'true');
        mode = b.dataset.mode;
        modeHelp.textContent = MODE_TEXT[mode];
        renderExamples();
        if (lastQuery) doSearch(lastQuery);
      });
    });
  }

  function renderExamples() {
    const tips = mode === 'stream' ? STREAM_TIPS : FREE_TIPS;
    examplesEl.innerHTML =
      'Try: ' + tips.map((q) => `<span data-q="${q}">${q}</span>`).join('');
    examplesEl.querySelectorAll('span').forEach((s) => {
      s.onclick = () => { input.value = s.dataset.q; form.requestSubmit(); };
    });
  }

  /* ---------- Search form ---------- */
  function bindSearchForm() {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const term = input.value.trim();
      if (!term) return;
      doSearch(term);
    });
  }

  /* ---------- Dispatch ---------- */
  async function doSearch(term) {
    lastQuery = term;
    resultsEl.innerHTML = '';
    statusEl.innerHTML =
      '<div class="loader"></div>' +
      `<div style="margin-top:14px">Searching for "${escapeHtml(term)}"…</div>`;
    try {
      if (mode === 'stream') await searchStream(term);
      else                   await searchArchive(term);
    } catch (err) {
      console.error(err);
      statusEl.innerHTML =
        '<div class="empty"><div class="icon">⚠️</div>' +
        'Search failed. Check your connection and try again.</div>';
    }
  }

  /* ============================================================
     MODE 1: iTunes Search API — streaming + previews
     ============================================================ */
  async function searchStream(term) {
    const url =
      `${ITUNES_API}?term=${encodeURIComponent(term)}` +
      `&media=music&entity=song&limit=24`;
    const res  = await fetch(url);
    const data = await res.json();
    renderStream(data.results || [], term);
  }

  function renderStream(items, term) {
    statusEl.innerHTML = '';
    if (!items.length) {
      statusEl.innerHTML =
        `<div class="empty"><div class="icon">🔍</div>` +
        `No results for "<strong>${escapeHtml(term)}</strong>"` +
        `<div style="margin-top:8px;font-size:0.9rem">` +
        `Try a different spelling or just the artist name.</div></div>`;
      return;
    }
    statusEl.innerHTML =
      `<div style="color:#9ba3c4;padding:10px">` +
      `✨ Found <strong style="color:#00d9ff">${items.length}</strong> tracks · ` +
      `click a card to preview or open in Apple Music</div>`;
    const frag = document.createDocumentFragment();
    items.forEach((t) => frag.appendChild(buildStreamCard(t)));
    resultsEl.appendChild(frag);
  }

  function buildStreamCard(t) {
    const c   = document.createElement('div');
    c.className = 'card';
    const art = (t.artworkUrl100 || '').replace('100x100bb', '400x400bb');
    c.innerHTML = `
      <img class="card-art" src="${art}" alt="Album art" loading="lazy"
           onerror="this.removeAttribute('src');
                    this.style.background='linear-gradient(135deg,#ff3366,#00d9ff)'">
      <div class="card-body">
        <div class="card-title">${escapeHtml(t.trackName || 'Untitled')}</div>
        <div class="card-artist">🎤 ${escapeHtml(t.artistName || 'Unknown')}</div>
        <div class="card-album">💿 ${escapeHtml(t.collectionName || '—')}</div>
        <div class="card-meta">
          <span class="genre-tag">${escapeHtml(t.primaryGenreName || 'Music')}</span>
          <span class="duration">${fmtMs(t.trackTimeMillis)}</span>
        </div>
      </div>`;
    c.onclick = () => openStreamDetail(t);
    return c;
  }

  function openStreamDetail(t) {
    stopAudio();
    const art  = (t.artworkUrl100 || '').replace('100x100bb', '600x600bb');
    const date = t.releaseDate
      ? new Date(t.releaseDate).toLocaleDateString('en-US',
          { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    const price = t.trackPrice != null
      ? `${t.currency || 'USD'} ${t.trackPrice.toFixed(2)}` : '—';

    const playerOrWarn = t.previewUrl
      ? `<div class="player-bar">
           <audio controls preload="metadata" src="${t.previewUrl}"></audio>
           <div class="preview-note">🎧 Official 30-second preview from Apple</div>
         </div>`
      : `<div style="background:rgba(255,170,0,0.1);padding:12px;border-radius:10px;
            color:#ffd980;font-size:0.85rem;text-align:center;margin-bottom:16px">
           ⚠️ No preview available for this track</div>`;

    modalContent.innerHTML = `
      <button class="close-btn" onclick="TuneFinder.closeModal()">✕</button>
      <img class="modal-art" src="${art}" alt="Album art"
           onerror="this.removeAttribute('src');
                    this.style.background='linear-gradient(135deg,#ff3366,#00d9ff)'">
      <div class="modal-body">
        <div class="modal-title">${escapeHtml(t.trackName || 'Untitled')}</div>
        <div class="modal-artist">🎤 ${escapeHtml(t.artistName || 'Unknown')}</div>
        <div class="modal-album">💿 ${escapeHtml(t.collectionName || '—')}</div>
        <div class="info-grid">
          <div class="info-item"><div class="info-label">Album Artist</div>
            <div class="info-value">${escapeHtml(t.collectionArtistName || t.artistName || '—')}</div></div>
          <div class="info-item"><div class="info-label">Genre</div>
            <div class="info-value">${escapeHtml(t.primaryGenreName || '—')}</div></div>
          <div class="info-item"><div class="info-label">Released</div>
            <div class="info-value">${date}</div></div>
          <div class="info-item"><div class="info-label">Duration</div>
            <div class="info-value">${fmtMs(t.trackTimeMillis)}</div></div>
          <div class="info-item"><div class="info-label">Track #</div>
            <div class="info-value">${t.trackNumber || '—'} of ${t.trackCount || '—'}</div></div>
          <div class="info-item"><div class="info-label">Price</div>
            <div class="info-value">${price}</div></div>
          <div class="info-item"><div class="info-label">Disc #</div>
            <div class="info-value">${t.discNumber || '1'}</div></div>
          <div class="info-item"><div class="info-label">Country</div>
            <div class="info-value">${escapeHtml(t.country || '—')}</div></div>
        </div>
        ${playerOrWarn}
        <div class="action-btns">
          <a class="btn-primary" href="${t.trackViewUrl}" target="_blank" rel="noopener">🎵 Open in Apple Music</a>
          <a class="btn-secondary" href="${t.artistViewUrl || '#'}" target="_blank" rel="noopener">👤 View Artist</a>
        </div>
      </div>`;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    if (t.previewUrl) currentAudio = modalContent.querySelector('audio');
  }

  /* ============================================================
     MODE 2: Internet Archive — public-domain / CC downloads
     ============================================================ */
  async function searchArchive(term) {
    const q =
      `(${encodeURIComponent(term)}) AND mediatype:audio AND ` +
      `(licenseurl:publicdomain OR subject:"creative commons" OR ` +
      `subject:"public domain" OR rights:publicdomain OR ` +
      `rights:"creative commons")`;
    const fields =
      ['identifier','title','creator','description','date','subject','downloads','licenseurl'];
    const url =
      `${ARCHIVE_API}?q=${q}` +
      `&fl[]=${fields.join('&fl[]=')}` +
      `&sort[]=downloads+desc&rows=20&output=json`;

    const res  = await fetch(url);
    const data = await res.json();
    renderArchive(data.response?.docs || [], term);
  }

  function renderArchive(items, term) {
    statusEl.innerHTML = '';
    if (!items.length) {
      statusEl.innerHTML =
        `<div class="empty"><div class="icon">🔍</div>` +
        `No public-domain or Creative Commons recordings for ` +
        `"<strong>${escapeHtml(term)}</strong>"` +
        `<div style="margin-top:8px;font-size:0.9rem">` +
        `Try classical composers, instrumentalists, folk, spoken word, or older recordings.</div></div>`;
      return;
    }
    statusEl.innerHTML =
      `<div style="color:#9ba3c4;padding:10px">` +
      `⬇️ Found <strong style="color:#2ecc71">${items.length}</strong> ` +
      `legally free recordings · click a card to download from Internet Archive</div>`;
    const frag = document.createDocumentFragment();
    items.forEach((t) => frag.appendChild(buildArchiveCard(t)));
    resultsEl.appendChild(frag);
  }

  function buildArchiveCard(t) {
    const c       = document.createElement('div');
    c.className   = 'card';
    const license = (t.licenseurl || '').toLowerCase();
    const isPD    = license.includes('publicdomain') || license.includes('pd');
    const subtitle =
      (t.subject && t.subject.slice(0, 3).join(' · ')) ||
      (t.description || '').slice(0, 60) ||
      'Audio recording';
    const badge = isPD
      ? `<div class="badge-fp">PUBLIC DOMAIN</div>`
      : `<div class="badge-cc">CREATIVE COMMONS</div>`;

    c.innerHTML = `
      ${badge}
      <div class="download-chip">⬇ DOWNLOAD</div>
      <div class="card-art">🎼</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(t.title || t.identifier)}</div>
        <div class="card-artist">🎤 ${escapeHtml(t.creator || 'Unknown artist')}</div>
        <div class="card-album">🗂 ${escapeHtml(subtitle)}</div>
        <div class="card-meta">
          <span class="genre-tag">${escapeHtml((t.subject && t.subject[0]) || t.date || 'Audio')}</span>
          <span class="duration">⬇ ${fmtCount(t.downloads || 0)}</span>
        </div>
      </div>`;
    c.onclick = () => openArchiveDetail(t, isPD);
    return c;
  }

  function openArchiveDetail(t, isPD) {
    stopAudio();
    const subtitle =
      (t.subject && t.subject.slice(0, 3).join(' · ')) || 'Audio recording';

    modalContent.innerHTML = `
      <button class="close-btn" onclick="TuneFinder.closeModal()">✕</button>
      <div class="modal-art">🎼</div>
      <div class="modal-body">
        <div class="modal-title">${escapeHtml(t.title || t.identifier)}</div>
        <div class="modal-artist">🎤 ${escapeHtml(t.creator || 'Unknown artist')}</div>
        <div class="modal-album">🗂 ${escapeHtml(subtitle)}</div>
        <div class="info-grid">
          <div class="info-item"><div class="info-label">License</div>
            <div class="info-value">${isPD ? 'Public Domain ✅' : 'Creative Commons ✅'}</div></div>
          <div class="info-item"><div class="info-label">Year</div>
            <div class="info-value">${escapeHtml(t.date || 'Unknown')}</div></div>
          <div class="info-item"><div class="info-label">Downloads</div>
            <div class="info-value">${fmtCount(t.downloads || 0)}</div></div>
          <div class="info-item"><div class="info-label">Identifier</div>
            <div class="info-value" style="font-family:monospace;font-size:0.8rem">
              ${escapeHtml(t.identifier)}</div></div>
        </div>
        <div id="fileList" class="file-list">
          <div class="status" style="padding:12px">
            <div class="loader sm"></div>
            <div style="margin-top:8px">Loading audio files…</div>
          </div>
        </div>
        <div class="action-btns">
          <a class="btn-green"
             href="https://archive.org/details/${encodeURIComponent(t.identifier)}"
             target="_blank" rel="noopener">📂 View on Internet Archive</a>
          <button class="btn-secondary"
                  onclick="TuneFinder.downloadAll('${escapeAttr(t.identifier)}')">
            ⬇ Download All
          </button>
        </div>
      </div>`;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    loadArchiveFiles(t.identifier);
  }

  async function loadArchiveFiles(identifier) {
    try {
      const url  = `${META_API}${encodeURIComponent(identifier)}`;
      const res  = await fetch(url);
      const meta = await res.json();
      const all  = (meta.files || []).filter(isPlayableFile);
      all.sort((a, b) => rankFormat(b.name) - rankFormat(a.name));
      const top       = all.slice(0, 6);
      const fileList  = $('fileList');
      if (!top.length) {
        fileList.innerHTML =
          `<div class="status" style="padding:8px;color:#ffd980">` +
          `No playable audio files exposed in this item.</div>`;
        return;
      }
      fileList.innerHTML = top
        .map(
          (f) => `
        <div class="file-row">
          <div class="fname">${escapeHtml(f.name)}</div>
          <div class="fsize">${fmtBytes(f.size)}</div>
          <a href="${makeArchiveUrl(identifier, f.name)}"
             target="_blank" rel="noopener"
             download="${escapeAttr(f.name)}">⬇ Download</a>
        </div>`
        )
        .join('');
    } catch (err) {
      console.error(err);
      $('fileList').innerHTML =
        `<div class="status" style="color:#ffd980">` +
        `Couldn't load files. Open on archive.org to browse manually.</div>`;
    }
  }

  function downloadAll(identifier) {
    window.open(
      `https://archive.org/download/${encodeURIComponent(identifier)}/`,
      '_blank'
    );
  }

  function makeArchiveUrl(id, name) {
    return `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(name)}`;
  }

  function rankFormat(name) {
    const n = name.toLowerCase();
    if (n.endsWith('.mp3'))                     return 5;
    if (n.endsWith('.ogg') || n.endsWith('.vorbis')) return 4;
    if (n.endsWith('.flac'))                    return 3;
    if (n.endsWith('.m4a') || n.endsWith('.aac')) return 2;
    if (n.endsWith('.wav'))                     return 1;
    return 0;
  }

  function isPlayableFile(f) {
    if (!f.name) return false;
    return /\.(mp3|ogg|vorbis|flac|m4a|aac|wav)$/i.test(f.name);
  }

  /* ============================================================
     Modal + audio control
     ============================================================ */
  function bindModalDismiss() {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  function closeModal() {
    stopAudio();
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
  }

  /* ============================================================
     Formatters + helpers
     ============================================================ */
  function fmtMs(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtBytes(b) {
    if (!b) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(b < 10 && i ? 1 : 0) + ' ' + u[i];
  }

  function fmtCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M downloads';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k downloads';
    return n + ' downloads';
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------- Public API (exposed for inline onclick handlers) ---------- */
  window.TuneFinder = {
    closeModal,
    downloadAll
  };

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
