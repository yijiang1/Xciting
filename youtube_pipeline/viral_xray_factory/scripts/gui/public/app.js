const jobIndicator = document.getElementById('job-indicator');
const logBody = document.getElementById('log-body');
const logTitle = document.getElementById('log-title');
const conceptGrid = document.getElementById('concept-grid');
const detailOverlay = document.getElementById('detail-overlay');
const detailBody = document.getElementById('detail-body');

let concepts = [];

const fmtNum = (n) => (n === undefined || n === null ? '-' : Number(n).toFixed(0));
const fmtPct = (n) => (n === undefined || n === null ? '-' : `${Number(n).toFixed(0)}%`);

async function api(path, options) {
  const res = await fetch(path, {
    headers: options?.body ? {'Content-Type': 'application/json'} : undefined,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// --- Scoreboard -------------------------------------------------------

function renderScoreboard(rows, tableId) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">No data yet.</td></tr>';
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.key}</td>
      <td>${row.madeCount}</td>
      <td>${row.publishedCount}</td>
      <td>${fmtNum(row.avgViews)}</td>
      <td>${fmtPct(row.avgRetentionPct)}</td>
      <td>${fmtNum(row.avgSubsGained)}</td>`;
    tbody.appendChild(tr);
  }
}

async function loadScoreboard() {
  const board = await api('/api/scoreboard');
  renderScoreboard(board.theme, 'theme-table');
  renderScoreboard(board.style, 'style-table');
}

// --- Concept grid -------------------------------------------------------

function statusBadge(concept) {
  if (concept.published) return '<span class="badge published">published</span>';
  return `<span class="badge ${concept.status}">${concept.status}</span>`;
}

function renderGrid() {
  conceptGrid.innerHTML = '';
  for (const concept of concepts) {
    const card = document.createElement('div');
    card.className = 'concept-card';
    card.innerHTML = `
      <div class="badge-row">
        ${statusBadge(concept)}
        <span class="badge">${concept.series}</span>
        ${concept.theme ? `<span class="badge">${concept.theme}</span>` : ''}
        <span class="badge">${concept.style}</span>
      </div>
      <h3>${concept.title}</h3>
      <p>${concept.hook}</p>
    `;
    card.addEventListener('click', () => openDetail(concept.id));
    conceptGrid.appendChild(card);
  }
}

async function loadConcepts() {
  concepts = await api('/api/concepts');
  renderGrid();
}

// --- Detail panel -------------------------------------------------------

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

async function openDetail(id) {
  const [concept, summary] = await Promise.all([
    api(`/api/concepts/${id}`),
    Promise.resolve(concepts.find((c) => c.id === id)),
  ]);

  const readyRenders = summary.renders.filter((r) => r.ready);
  const readyRender = summary.renders.find((r) => r.ready);

  const previewItems = [
    ...readyRenders.map(
      (r) => `
      <div class="preview-item">
        <div class="preview-label">${r.format}</div>
        <video controls src="/media/renders/${id}${r.format === 'portrait' ? '-portrait' : ''}.mp4"></video>
      </div>`,
    ),
    summary.audioReady
      ? `<div class="preview-item"><div class="preview-label">audio</div><audio controls src="/media/audio/${id}.mp3"></audio></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const publishedLine = summary.published
    ? `<p>Published: <a href="https://youtu.be/${summary.published.videoId}" target="_blank">youtu.be/${summary.published.videoId}</a> (${summary.published.privacyStatus})</p>`
    : '';

  const scriptLabel = concept.song ? 'Lyrics' : 'Script';
  const scriptFields = concept.song
    ? concept.song.sections
        .map(
          (section, index) => `
        <label class="field">${escapeHtml(section.name)}
          <textarea data-song-line="${index}" rows="${Math.max(2, section.lines.length)}">${escapeHtml(section.lines.join('\n'))}</textarea>
        </label>`,
        )
        .join('')
    : concept.beats
        .map(
          (beat, index) => `
        <label class="field">Beat ${index + 1}
          <textarea data-beat-text="${index}" rows="2">${escapeHtml(beat.text)}</textarea>
        </label>`,
        )
        .join('');

  detailBody.innerHTML = `
    <div class="meta-row">
      ${statusBadge(summary)}
      <span class="badge">${concept.series}</span>
      ${concept.theme ? `<span class="badge">${concept.theme}</span>` : ''}
      <span class="badge">${concept.style}</span>
      <span class="badge">${concept.formats.join('/')}</span>
    </div>

    ${previewItems ? `<div class="preview-grid">${previewItems}</div>` : '<p class="hint">Nothing rendered yet.</p>'}
    ${publishedLine}
    <p>audio: ${summary.audioReady ? 'yes' : '-'} &middot; footage clips: ${summary.footageClips} &middot; bundle: ${summary.bundleReady ? 'yes' : '-'} &middot; spend: ${summary.footageSpendUsd ? `$${summary.footageSpendUsd}` : '-'}</p>

    <form id="edit-form" class="edit-form">
      <label class="field">Title <input type="text" name="title" value="${escapeHtml(concept.title)}" /></label>
      <label class="field">Hook <input type="text" name="hook" value="${escapeHtml(concept.hook)}" /></label>

      <div class="field-group">
        <div class="field-group-label">Palette</div>
        <div class="palette-row">
          ${['bg', 'accent', 'accent2', 'ink', 'panel']
            .map((key) => `<label class="swatch">${key} <input type="color" name="palette-${key}" value="${concept.palette[key]}" /></label>`)
            .join('')}
        </div>
      </div>

      <div class="field-group">
        <div class="field-group-label">${scriptLabel}</div>
        <p class="hint">Changing these lines changes what's spoken/sung. Run the pipeline with "force redo" checked below afterward, or the captions won't match the (old) audio.</p>
        ${scriptFields}
      </div>

      <div class="field-group">
        <div class="field-group-label">Upload metadata</div>
        <label class="field">YouTube title <input type="text" name="upload-title" value="${escapeHtml(concept.upload.title)}" /></label>
        <label class="field">Description <textarea name="upload-description" rows="3">${escapeHtml(concept.upload.description)}</textarea></label>
        <label class="field">Tags (comma-separated) <input type="text" name="upload-tags" value="${escapeHtml(concept.upload.tags.join(', '))}" /></label>
      </div>

      <button type="submit" class="btn primary">Save changes</button>
    </form>

    <div class="actions" id="detail-actions"></div>
  `;

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    try {
      const palette = Object.fromEntries(['bg', 'accent', 'accent2', 'ink', 'panel'].map((key) => [key, form[`palette-${key}`].value]));
      const patch = {
        title: form.title.value,
        hook: form.hook.value,
        palette,
        upload: {
          title: form['upload-title'].value,
          description: form['upload-description'].value,
          tags: form['upload-tags'].value.split(',').map((t) => t.trim()).filter(Boolean),
        },
      };
      if (concept.song) {
        patch.song = {
          sections: concept.song.sections.map((_, index) => ({
            lines: form.querySelector(`[data-song-line="${index}"]`).value.split('\n').map((l) => l.trim()).filter(Boolean),
          })),
        };
      } else {
        patch.beats = concept.beats.map((beat, index) => ({
          text: form.querySelector(`[data-beat-text="${index}"]`).value.trim(),
          visual: beat.visual,
        }));
      }
      await api(`/api/concepts/${id}`, {method: 'PUT', body: JSON.stringify(patch)});
      await loadConcepts();
      openDetail(id);
    } catch (err) {
      alert(err.message);
      saveBtn.disabled = false;
    }
  });

  const actions = document.getElementById('detail-actions');

  if (concept.status !== 'approved') {
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn primary';
    approveBtn.textContent = 'Approve';
    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true;
      await api(`/api/concepts/${id}/approve`, {method: 'POST'});
      await loadConcepts();
      openDetail(id);
    });
    actions.appendChild(approveBtn);
  }

  const pipelineWrap = document.createElement('div');
  pipelineWrap.innerHTML = `
    <div class="opts">
      <label><input type="checkbox" id="opt-force"> force redo</label>
      <label><input type="checkbox" id="opt-footage-ok"> allow footage on draft</label>
      <label><input type="checkbox" id="opt-skip-footage"> skip footage</label>
    </div>
  `;
  actions.appendChild(pipelineWrap);

  const pipelineBtn = document.createElement('button');
  pipelineBtn.className = 'btn';
  pipelineBtn.textContent = 'Run Pipeline';
  pipelineBtn.addEventListener('click', () => {
    const force = document.getElementById('opt-force').checked;
    const footageOk = document.getElementById('opt-footage-ok').checked;
    const skipFootage = document.getElementById('opt-skip-footage').checked;
    if (!skipFootage && !confirm(`Run the pipeline for "${id}"? This can spend real money on TTS/footage generation.`)) return;
    api('/api/jobs/pipeline', {method: 'POST', body: JSON.stringify({id, force, footageOk, skipFootage})}).catch((e) =>
      alert(e.message),
    );
  });
  actions.appendChild(pipelineBtn);

  if (readyRender) {
    const publishPrivateBtn = document.createElement('button');
    publishPrivateBtn.className = 'btn';
    publishPrivateBtn.textContent = 'Publish (private)';
    publishPrivateBtn.addEventListener('click', () => {
      if (!confirm(`Upload "${id}" to YouTube as private?`)) return;
      api('/api/jobs/publish', {method: 'POST', body: JSON.stringify({id, format: readyRender.format})}).catch((e) =>
        alert(e.message),
      );
    });
    actions.appendChild(publishPrivateBtn);

    const publishPublicBtn = document.createElement('button');
    publishPublicBtn.className = 'btn danger';
    publishPublicBtn.textContent = 'Publish (PUBLIC)';
    publishPublicBtn.addEventListener('click', () => {
      if (!confirm(`Upload "${id}" to YouTube as PUBLIC? This goes live immediately.`)) return;
      api('/api/jobs/publish', {
        method: 'POST',
        body: JSON.stringify({id, format: readyRender.format, isPublic: true}),
      }).catch((e) => alert(e.message));
    });
    actions.appendChild(publishPublicBtn);
  }

  detailOverlay.classList.remove('hidden');
}

document.getElementById('detail-close').addEventListener('click', () => detailOverlay.classList.add('hidden'));
detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) detailOverlay.classList.add('hidden');
});

// --- Daily draft button -------------------------------------------------

document.getElementById('run-daily').addEventListener('click', async () => {
  try {
    await api('/api/jobs/daily', {method: 'POST'});
  } catch (e) {
    alert(e.message);
  }
});

// --- Log console / job stream -------------------------------------------

document.getElementById('log-clear').addEventListener('click', () => {
  logBody.textContent = '';
});

function setJobIndicator(status, label) {
  jobIndicator.className = `job-indicator ${status}`;
  jobIndicator.textContent = label;
}

function appendLog(line) {
  logBody.textContent += `${line}\n`;
  logBody.scrollTop = logBody.scrollHeight;
}

function connectStream() {
  const source = new EventSource('/api/jobs/stream');

  source.addEventListener('snapshot', (e) => {
    const job = JSON.parse(e.data);
    logTitle.textContent = `${job.script} ${job.args.join(' ')}`;
    logBody.textContent = job.log.join('\n');
    setJobIndicator(job.status, job.status);
  });

  source.addEventListener('start', (e) => {
    const job = JSON.parse(e.data);
    logTitle.textContent = `${job.script} ${job.args.join(' ')}`;
    logBody.textContent = '';
    setJobIndicator('running', 'running');
  });

  source.addEventListener('log', (e) => {
    const {line} = JSON.parse(e.data);
    appendLog(line);
  });

  source.addEventListener('end', (e) => {
    const job = JSON.parse(e.data);
    setJobIndicator(job.status, job.status);
    loadConcepts();
    loadScoreboard();
  });

  source.onerror = () => {
    setJobIndicator('idle', 'disconnected');
  };
}

// --- Init -----------------------------------------------------------------

loadConcepts();
loadScoreboard();
connectStream();
setInterval(() => {
  loadConcepts();
  loadScoreboard();
}, 30000);
