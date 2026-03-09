// ============================================================
//  github-backup.js  — Sync Kiro backup to/from GitHub repo
//  Repo cible : kreuille/Gouda  (branche main)
//  Fichier    : kiro-backup.json
// ============================================================

const GH_BACKUP = {
  owner: 'kreuille',
  repo:  'Gouda',
  path:  'kiro-backup.json',
  branch: 'main',
  _patKey: 'kiro-github-pat',

  // --- Config UI helpers ---
  getPat() {
    return localStorage.getItem(this._patKey) || '';
  },
  savePat(pat) {
    localStorage.setItem(this._patKey, pat.trim());
  },

  _headers(pat) {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${pat}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  },

  _apiUrl() {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.path}`;
  },

  // --- Fetch current file (returns {content, sha} or null) ---
  async _getRemote(pat) {
    const res = await fetch(this._apiUrl(), {
      headers: this._headers(pat)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const decoded = atob(json.content.replace(/\n/g, ''));
    return { data: JSON.parse(decoded), sha: json.sha };
  },

  // --- Push JSON to GitHub ---
  async _push(pat, data, sha) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = {
      message: `Kiro backup — ${new Date().toISOString()}`,
      content,
      branch: this.branch
    };
    if (sha) body.sha = sha;   // update existing file
    const res = await fetch(this._apiUrl(), {
      method: 'PUT',
      headers: this._headers(pat),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`GitHub PUT ${res.status}: ${await res.text()}`);
    return await res.json();
  },

  // ── EXPORT ── collect all local data → push to GitHub
  async pushBackup() {
    const pat = this.getPat();
    if (!pat) throw new Error('PAT GitHub non configuré');

    // Collect all local data (same as the manual export in app.js)
    const conversations = {};
    const db = await openConvDB();
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const keys = await new Promise(resolve => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
    for (const key of keys) {
      const val = await new Promise(resolve => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (val) conversations[key] = val;
    }

    const payload = {
      _minou_backup: true,
      _kiro_github_sync: true,
      date: new Date().toISOString(),
      conversations,
      systemPrompts: JSON.parse(localStorage.getItem('minou-systemprompts') || '{}'),
      savedPrompts:  JSON.parse(localStorage.getItem('minou-savedprompts')  || '{}'),
      categories:    JSON.parse(localStorage.getItem('minou-categories')    || '{}'),
      theme:         localStorage.getItem('minou-theme') || 'dark',
      apiKeys:       JSON.parse(localStorage.getItem('minou-apikeys')       || '{}')
    };

    // Get current SHA if file exists (needed to overwrite)
    const remote = await this._getRemote(pat);
    await this._push(pat, payload, remote ? remote.sha : undefined);
  },

  // ── IMPORT ── pull from GitHub → restore all local data
  async pullBackup() {
    const pat = this.getPat();
    if (!pat) throw new Error('PAT GitHub non configuré');

    const remote = await this._getRemote(pat);
    if (!remote) throw new Error('Aucun backup trouvé sur GitHub (kiro-backup.json introuvable)');

    const data = remote.data;
    if (!data._minou_backup) throw new Error('Le fichier GitHub ne semble pas être un backup Kiro valide');

    const convCount = data.conversations ? Object.keys(data.conversations).length : 0;
    const spCount   = data.systemPrompts ? Object.keys(data.systemPrompts).length : 0;
    const prCount   = data.savedPrompts  ? Object.keys(data.savedPrompts).length  : 0;
    const catCount  = data.categories    ? Object.keys(data.categories).length    : 0;

    const ok = confirm(
      `Restaurer depuis GitHub ?\n\n` +
      `📅 Sauvegarde du ${new Date(data.date).toLocaleString('fr-FR')}\n` +
      `💬 ${convCount} conversation(s)\n` +
      `🎭 ${spCount} rôle(s)\n` +
      `📝 ${prCount} prompt(s)\n` +
      `🏷️ ${catCount} catégorie(s)\n\n` +
      `Les données existantes portant les mêmes noms seront écrasées.`
    );
    if (!ok) return false;

    if (data.conversations) {
      const db = await openConvDB();
      for (const [key, val] of Object.entries(data.conversations)) {
        const tx = db.transaction('conversations', 'readwrite');
        tx.objectStore('conversations').put(val, key);
        await new Promise(r => { tx.oncomplete = r; });
      }
    }
    if (data.systemPrompts) {
      const existing = JSON.parse(localStorage.getItem('minou-systemprompts') || '{}');
      Object.assign(existing, data.systemPrompts);
      localStorage.setItem('minou-systemprompts', JSON.stringify(existing));
    }
    if (data.savedPrompts) {
      const existing = JSON.parse(localStorage.getItem('minou-savedprompts') || '{}');
      Object.assign(existing, data.savedPrompts);
      localStorage.setItem('minou-savedprompts', JSON.stringify(existing));
    }
    if (data.categories) {
      const existing = JSON.parse(localStorage.getItem('minou-categories') || '{}');
      Object.assign(existing, data.categories);
      localStorage.setItem('minou-categories', JSON.stringify(existing));
    }
    if (data.apiKeys && Object.keys(data.apiKeys).length > 0) {
      if (typeof saveApiKeys === 'function') saveApiKeys(data.apiKeys);
      else localStorage.setItem('minou-apikeys', JSON.stringify(data.apiKeys));
    }
    if (data.theme) localStorage.setItem('minou-theme', data.theme);

    return true;
  }
};

// ── UI: inject GitHub sync button + PAT modal into the sidebar ──
(function mountGithubBackupUI() {
  document.addEventListener('DOMContentLoaded', () => {

    // ---- Inject CSS ----
    const style = document.createElement('style');
    style.textContent = `
      .gh-sync-row { display:flex; gap:6px; margin-bottom:4px; }
      .gh-sync-btn {
        flex:1; font-size:11px; padding:5px 6px; border-radius:6px; border:none;
        cursor:pointer; font-weight:600; display:flex; align-items:center;
        justify-content:center; gap:5px; transition:.15s;
      }
      .gh-sync-btn:disabled { opacity:.45; cursor:not-allowed; }
      .gh-push-btn { background:#238636; color:#fff; }
      .gh-push-btn:hover:not(:disabled) { background:#2ea043; }
      .gh-pull-btn { background:#1f6feb; color:#fff; }
      .gh-pull-btn:hover:not(:disabled) { background:#388bfd; }
      .gh-cfg-btn  { background:#30363d; color:#e6edf3; }
      .gh-cfg-btn:hover { background:#484f58; }
      .gh-status { font-size:10px; text-align:center; color:#8b949e; min-height:14px; margin-bottom:2px; transition:.3s; }
      .gh-status.ok  { color:#3fb950; }
      .gh-status.err { color:#f85149; }

      /* PAT modal */
      #gh-pat-modal-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:9999;
        display:flex; align-items:center; justify-content:center;
      }
      #gh-pat-modal {
        background:var(--bg-modal, #161b22); border:1px solid #30363d;
        border-radius:12px; padding:24px; width:min(90vw, 420px); color:var(--text, #e6edf3);
      }
      #gh-pat-modal h3 { margin:0 0 8px; font-size:15px; }
      #gh-pat-modal p  { font-size:12px; color:#8b949e; margin:0 0 14px; line-height:1.5; }
      #gh-pat-modal a  { color:#58a6ff; }
      .gh-pat-input-wrap { display:flex; gap:6px; margin-bottom:16px; }
      #gh-pat-input {
        flex:1; background:#0d1117; border:1px solid #30363d; border-radius:6px;
        padding:8px 10px; color:#e6edf3; font-size:13px; font-family:monospace;
      }
      .gh-pat-actions { display:flex; justify-content:flex-end; gap:8px; }
      .gh-pat-save-btn { background:#238636; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-weight:600; font-size:13px; }
      .gh-pat-save-btn:hover { background:#2ea043; }
      .gh-pat-cancel-btn { background:#30363d; color:#e6edf3; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:13px; }
      .gh-pat-cancel-btn:hover { background:#484f58; }
    `;
    document.head.appendChild(style);

    // ---- Inject buttons above the bottom sidebar buttons ----
    const sidebarBottom = document.querySelector('.sidebar-bottom');
    if (!sidebarBottom) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="border-top:1px solid #30363d; padding-top:8px; margin-top:4px;">
        <div style="font-size:10px; color:#8b949e; text-align:center; margin-bottom:6px; font-weight:600; letter-spacing:.05em; text-transform:uppercase;">GitHub Backup</div>
        <div class="gh-sync-row">
          <button id="gh-push-btn" class="gh-sync-btn gh-push-btn" title="Sauvegarder vers GitHub">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>
            Push
          </button>
          <button id="gh-pull-btn" class="gh-sync-btn gh-pull-btn" title="Restaurer depuis GitHub">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
            Pull
          </button>
          <button id="gh-cfg-btn" class="gh-sync-btn gh-cfg-btn" title="Configurer le PAT GitHub">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
        <div id="gh-status" class="gh-status"></div>
      </div>
    `;
    sidebarBottom.insertBefore(wrap, sidebarBottom.firstChild);

    // ---- PAT modal HTML ----
    const modalEl = document.createElement('div');
    modalEl.id = 'gh-pat-modal-overlay';
    modalEl.style.display = 'none';
    modalEl.innerHTML = `
      <div id="gh-pat-modal">
        <h3>🔑 GitHub Personal Access Token</h3>
        <p>
          Créez un PAT sur
          <a href="https://github.com/settings/tokens/new?scopes=repo&description=Kiro+Backup" target="_blank" rel="noopener">github.com/settings/tokens</a>
          avec le scope <strong>repo</strong>.<br>
          Il sera stocké dans votre localStorage et jamais envoyé ailleurs que l'API GitHub.
        </p>
        <div class="gh-pat-input-wrap">
          <input type="password" id="gh-pat-input" placeholder="ghp_xxxxxxxxxxxx…" autocomplete="off">
        </div>
        <div class="gh-pat-actions">
          <button id="gh-pat-cancel" class="gh-pat-cancel-btn">Annuler</button>
          <button id="gh-pat-save"   class="gh-pat-save-btn">Enregistrer</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    // ---- Status helper ----
    const statusEl = document.getElementById('gh-status');
    function setStatus(msg, type = '') {
      statusEl.textContent = msg;
      statusEl.className = 'gh-status' + (type ? ' ' + type : '');
      if (type === 'ok') setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'gh-status'; }, 4000);
    }

    // ---- Disable buttons while working ----
    function setBusy(busy) {
      document.getElementById('gh-push-btn').disabled = busy;
      document.getElementById('gh-pull-btn').disabled = busy;
    }

    // ---- Push button ----
    document.getElementById('gh-push-btn').addEventListener('click', async () => {
      if (!GH_BACKUP.getPat()) {
        openPatModal();
        setStatus('Configurez votre PAT d\'abord');
        return;
      }
      setBusy(true);
      setStatus('Push en cours…');
      try {
        await GH_BACKUP.pushBackup();
        setStatus('✓ Backup poussé sur GitHub', 'ok');
      } catch (e) {
        setStatus('Erreur : ' + e.message, 'err');
        console.error(e);
      } finally {
        setBusy(false);
      }
    });

    // ---- Pull button ----
    document.getElementById('gh-pull-btn').addEventListener('click', async () => {
      if (!GH_BACKUP.getPat()) {
        openPatModal();
        setStatus('Configurez votre PAT d\'abord');
        return;
      }
      setBusy(true);
      setStatus('Pull en cours…');
      try {
        const ok = await GH_BACKUP.pullBackup();
        if (ok) {
          setStatus('✓ Restauré depuis GitHub', 'ok');
          setTimeout(() => location.reload(), 1200);
        } else {
          setStatus('Annulé', '');
        }
      } catch (e) {
        setStatus('Erreur : ' + e.message, 'err');
        console.error(e);
      } finally {
        setBusy(false);
      }
    });

    // ---- Config (PAT) button ----
    document.getElementById('gh-cfg-btn').addEventListener('click', openPatModal);

    function openPatModal() {
      document.getElementById('gh-pat-input').value = GH_BACKUP.getPat();
      modalEl.style.display = 'flex';
    }
    document.getElementById('gh-pat-cancel').addEventListener('click', () => { modalEl.style.display = 'none'; });
    document.getElementById('gh-pat-save').addEventListener('click', () => {
      const pat = document.getElementById('gh-pat-input').value.trim();
      GH_BACKUP.savePat(pat);
      modalEl.style.display = 'none';
      setStatus(pat ? '✓ PAT enregistré' : 'PAT effacé', 'ok');
    });
    modalEl.addEventListener('click', e => { if (e.target === modalEl) modalEl.style.display = 'none'; });
  });
})();
