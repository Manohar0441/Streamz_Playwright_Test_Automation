/* ============================================================================
   browse.js — catalog grid, search, "continue watching", logout
   ----------------------------------------------------------------------------
   On load it guards the route (redirect to login if no token), renders the
   public catalog, and — for titles the user has already started — builds a
   "Continue watching" row from saved progress (an integration touch: it reads
   per-title progress from the API).
   ============================================================================ */
import { api, session, requireAuth, toast } from '/assets/api.js';

const els = {
  search: document.getElementById('search'),
  catalogGrid: document.getElementById('catalogGrid'),
  emptyState: document.getElementById('emptyState'),
  continueSection: document.getElementById('continueSection'),
  continueGrid: document.getElementById('continueGrid'),
  userName: document.getElementById('userName'),
  avatar: document.getElementById('avatar'),
  logoutBtn: document.getElementById('logoutBtn'),
};

async function init() {
  const user = session.user;
  els.userName.textContent = user ? user.name : '';
  els.avatar.textContent = user && user.name ? user.name[0].toUpperCase() : '?';

  els.logoutBtn.addEventListener('click', onLogout);
  els.search.addEventListener('input', debounce(() => load(els.search.value.trim()), 200));

  await load('');
  await buildContinueRow();
}

/* Render the catalog, optionally filtered by a search term. */
async function load(search) {
  const res = await api.catalog(search);
  if (!res.ok) {
    toast('Could not load the catalog.');
    return;
  }
  const items = res.data.items || [];
  els.catalogGrid.innerHTML = '';
  items.forEach((t) => els.catalogGrid.appendChild(card(t)));
  els.emptyState.hidden = items.length > 0;
}

/* Build "Continue watching" from saved progress for each title. Unavailable
   titles (rights expired) are skipped. */
async function buildContinueRow() {
  const res = await api.catalog('');
  if (!res.ok) return;

  const inProgress = [];
  for (const t of res.data.items) {
    if (!t.available) continue;
    const p = await api.getProgress(t.id);
    if (p.ok && p.data.positionSec > 0) {
      inProgress.push({ ...t, progressSec: p.data.positionSec });
    }
  }

  if (inProgress.length === 0) return;
  els.continueGrid.innerHTML = '';
  inProgress.forEach((t) => els.continueGrid.appendChild(card(t, true)));
  els.continueSection.hidden = false;
}

/* Build one catalog card. `showProgress` adds the resume bar. */
function card(t, showProgress = false) {
  const el = document.createElement('button');
  el.className = 'card';
  el.type = 'button';
  el.dataset.testid = 'title-card';
  el.dataset.titleId = t.id;
  el.setAttribute('aria-label', `Open ${t.title}`);

  const lockBadge = !t.available ? '🚫' : '';
  const pct = showProgress && t.durationSec ? Math.min(100, (t.progressSec / t.durationSec) * 100) : 0;

  el.innerHTML = `
    <div class="art" style="background:${t.poster.bg};color:${t.poster.fg}">
      <span>${t.poster.emoji}</span>
      ${lockBadge ? `<span class="lock">${lockBadge}</span>` : ''}
    </div>
    <div class="body">
      <p class="name">${escapeHtml(t.title)}</p>
      <div class="meta">
        <span>${t.year}</span>
        <span>${t.rating}</span>
        <span>${escapeHtml(t.genres[0] || '')}</span>
      </div>
      ${showProgress ? `<div class="progress-track"><div style="width:${pct}%"></div></div>` : ''}
    </div>`;

  el.addEventListener('click', () => {
    location.href = `/player.html?id=${encodeURIComponent(t.id)}`;
  });
  return el;
}

async function onLogout() {
  await api.logout(); // best-effort: invalidate the token server-side
  session.clear();
  location.replace('/login.html');
}

/* ---- tiny utilities ------------------------------------------------------- */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* Guard the route, then start. Called last so every const above is initialised. */
if (requireAuth()) {
  init();
}
