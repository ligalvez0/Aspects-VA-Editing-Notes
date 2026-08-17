(function () {
  const container = document.getElementById('shoots-container');
  const dateLabel = document.getElementById('current-date');
  const authorInput = document.getElementById('author-input');
  const toastEl = document.getElementById('toast');

  let currentDate = todayStr();

  // Restore saved author name
  authorInput.value = localStorage.getItem('author') || '';
  authorInput.addEventListener('input', () => {
    localStorage.setItem('author', authorInput.value);
  });

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    return res.json();
  }

  async function loadShoots() {
    dateLabel.textContent = formatDateDisplay(currentDate);
    const data = await api('GET', '/shoots?date=' + currentDate);
    render(data.shoots || []);
  }

  function render(shoots) {
    if (shoots.length === 0) {
      container.innerHTML = '<div class="empty">No shoots for this date.<br>Use the search bar above to find and add shoots.</div>';
      return;
    }

    container.innerHTML = shoots.map(shoot => {
      const meta = [shoot.time, shoot.photographer].filter(Boolean).join(' — ');
      const notesHtml = (shoot.notes || []).map(note => `
        <li class="note-item" data-note-id="${note.id}">
          <span class="note-bullet">&#x2022;</span>
          <span class="note-content" title="Click to edit">${esc(note.content)}</span>
          ${note.author ? '<span class="note-author">' + esc(note.author) + '</span>' : ''}
          <button class="note-delete" title="Delete note">&times;</button>
        </li>
      `).join('');

      const imagesHtml = (shoot.images || []).map(img => {
        const url = '/uploads/' + encodeURIComponent(img.filename);
        return `
          <div class="image-thumb" data-image-id="${img.id}">
            <a href="${url}" target="_blank" rel="noopener" title="${esc(img.original_name || 'View image')}">
              <img src="${url}" alt="${esc(img.original_name || 'Attached image')}" loading="lazy">
            </a>
            <button class="image-delete" title="Delete image">&times;</button>
          </div>
        `;
      }).join('');

      return `
        <div class="shoot-card" data-shoot-id="${shoot.id}">
          <div class="shoot-header">
            <div class="shoot-address">${esc(shoot.address)}</div>
            <button class="shoot-delete" title="Remove property">&times;</button>
            ${meta ? '<div class="shoot-meta">' + esc(meta) + '</div>' : ''}
          </div>
          <ul class="notes-list">
            ${notesHtml || '<li class="note-item"><span style="color:var(--muted)">No notes yet</span></li>'}
          </ul>
          <div class="add-note">
            <input type="text" placeholder="Add a note..." class="note-input">
            <button class="add-note-btn">Add</button>
          </div>
          <div class="images-section">
            ${imagesHtml ? '<div class="image-grid">' + imagesHtml + '</div>' : ''}
            <label class="image-upload-btn">
              <input type="file" accept="image/*" class="image-input" hidden>
              <span class="image-upload-label">+ Attach image</span>
            </label>
          </div>
        </div>
      `;
    }).join('');

    // Note add handlers
    container.querySelectorAll('.add-note-btn').forEach(btn => {
      const card = btn.closest('.shoot-card');
      const input = card.querySelector('.note-input');
      const handler = () => addNoteHandler(card.dataset.shootId, input);
      btn.addEventListener('click', handler);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
    });

    // Note delete handlers
    container.querySelectorAll('.note-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteNoteHandler(btn.closest('.note-item').dataset.noteId));
    });

    // Note edit handlers
    container.querySelectorAll('.note-content').forEach(span => {
      span.addEventListener('click', () => editNoteHandler(span));
    });

    // Shoot delete handlers
    container.querySelectorAll('.shoot-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.shoot-card');
        if (confirm('Remove this property?')) {
          deleteShootHandler(card.dataset.shootId);
        }
      });
    });

    // Image upload handlers
    container.querySelectorAll('.image-input').forEach(input => {
      const card = input.closest('.shoot-card');
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          uploadImageHandler(card.dataset.shootId, input.files[0]);
        }
      });
    });

    // Image delete handlers
    container.querySelectorAll('.image-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const thumb = btn.closest('.image-thumb');
        if (confirm('Delete this image?')) {
          deleteImageHandler(thumb.dataset.imageId);
        }
      });
    });
  }

  async function uploadImageHandler(shootId, file) {
    const form = new FormData();
    form.append('image', file);
    toast('Uploading image...');
    try {
      const res = await fetch('/api/shoots/' + shootId + '/images', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Upload failed');
        return;
      }
      toast('Image attached');
      loadShoots();
    } catch (err) {
      toast('Upload failed');
    }
  }

  async function deleteImageHandler(imageId) {
    await api('DELETE', '/images/' + imageId);
    toast('Image deleted');
    loadShoots();
  }

  async function addNoteHandler(shootId, input) {
    const content = input.value.trim();
    if (!content) return;
    await api('POST', '/notes', { shootId, content, author: authorInput.value.trim() });
    input.value = '';
    loadShoots();
  }

  async function deleteNoteHandler(noteId) {
    await api('DELETE', '/notes/' + noteId);
    loadShoots();
  }

  async function deleteShootHandler(shootId) {
    await api('DELETE', '/shoots/' + shootId);
    toast('Property removed');
    loadShoots();
  }

  function editNoteHandler(span) {
    const li = span.closest('.note-item');
    const noteId = li.dataset.noteId;
    const oldText = span.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldText;
    input.className = 'note-edit-input';
    span.replaceWith(input);
    input.focus();
    input.select();

    const save = async () => {
      const newText = input.value.trim();
      if (newText && newText !== oldText) {
        await api('PUT', '/notes/' + noteId, { content: newText });
      }
      loadShoots();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { input.removeEventListener('blur', save); save(); }
      if (e.key === 'Escape') { input.removeEventListener('blur', save); loadShoots(); }
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Date navigation
  document.getElementById('prev-day').addEventListener('click', () => {
    currentDate = shiftDate(currentDate, -1);
    loadShoots();
  });

  document.getElementById('next-day').addEventListener('click', () => {
    currentDate = shiftDate(currentDate, 1);
    loadShoots();
  });

  // Search shoot by address
  document.getElementById('search-btn').addEventListener('click', async () => {
    const input = document.getElementById('search-address');
    const addr = input.value.trim();
    if (!addr) return toast('Enter an address to search');
    const btn = document.getElementById('search-btn');
    btn.disabled = true;
    btn.textContent = 'Searching...';
    const data = await api('POST', '/search-shoot', { address: addr, date: currentDate });
    if (data.found) {
      toast('Found and added shoot!');
      input.value = '';
    } else {
      toast(data.error || 'Not found');
    }
    btn.disabled = false;
    btn.textContent = 'Find';
    loadShoots();
  });

  // Add shoot manually
  document.getElementById('add-manual-btn').addEventListener('click', async () => {
    const input = document.getElementById('search-address');
    const addr = input.value.trim();
    if (!addr) return toast('Enter an address first');
    await api('POST', '/shoots', { address: addr, date: currentDate });
    toast('Shoot added!');
    input.value = '';
    loadShoots();
  });

  // Slack button
  document.getElementById('slack-btn').addEventListener('click', async () => {
    const btn = document.getElementById('slack-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const data = await api('POST', '/slack/send', { date: currentDate });
    toast(data.ok ? 'Sent to Slack!' : 'Slack not configured — check console');
    btn.disabled = false;
    btn.textContent = 'Send to Slack';
  });

  // Initial load
  loadShoots();
})();
