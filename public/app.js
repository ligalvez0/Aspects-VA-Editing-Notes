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
      container.innerHTML = '<div class="empty">No shoots for this date.<br>Click "Sync Shoots" to pull from Aspects.</div>';
      return;
    }

    container.innerHTML = shoots.map(shoot => {
      const meta = [shoot.time, shoot.photographer].filter(Boolean).join(' — ');
      const notesHtml = (shoot.notes || []).map(note => `
        <li class="note-item" data-note-id="${note.id}">
          <span class="note-bullet">&#x2022;</span>
          <span class="note-content" title="Click to edit">${esc(note.content)}</span>
          ${note.author ? '<span class="note-author">' + esc(note.author) + '</span>' : ''}
          <button class="note-delete" title="Delete">&times;</button>
        </li>
      `).join('');

      return `
        <div class="shoot-card" data-shoot-id="${shoot.id}">
          <div class="shoot-header">
            <div class="shoot-address">${esc(shoot.address)}</div>
            ${meta ? '<div class="shoot-meta">' + esc(meta) + '</div>' : ''}
          </div>
          <ul class="notes-list">
            ${notesHtml || '<li class="note-item"><span style="color:var(--muted)">No notes yet</span></li>'}
          </ul>
          <div class="add-note">
            <input type="text" placeholder="Add a note..." class="note-input">
            <button class="add-note-btn">Add</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.add-note-btn').forEach(btn => {
      const card = btn.closest('.shoot-card');
      const input = card.querySelector('.note-input');
      const handler = () => addNoteHandler(card.dataset.shootId, input);
      btn.addEventListener('click', handler);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
    });

    container.querySelectorAll('.note-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteNoteHandler(btn.closest('.note-item').dataset.noteId));
    });

    container.querySelectorAll('.note-content').forEach(span => {
      span.addEventListener('click', () => editNoteHandler(span));
    });
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

  // Sync button
  document.getElementById('sync-btn').addEventListener('click', async () => {
    const btn = document.getElementById('sync-btn');
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    const data = await api('POST', '/sync', { date: currentDate });
    if (data.error) {
      toast(`Sync error: ${data.error.slice(0, 100)}`);
    } else {
      toast(`Synced ${data.synced || 0} shoots`);
    }
    btn.disabled = false;
    btn.textContent = 'Sync Shoots';
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
