/* ============================================================================
   api.js — shared helpers used by every page (ES module)
   ----------------------------------------------------------------------------
   - thin fetch wrappers around the JSON API
   - session storage (token + user) in localStorage under one key
   - a route guard used by protected pages
   - small formatting utilities
   Import what you need:  import { api, session, requireAuth } from './api.js';
   ============================================================================ */

const SESSION_KEY = 'streamz.session';

/* ---- Session -------------------------------------------------------------- */
export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
  get token() {
    const s = this.get();
    return s ? s.token : null;
  },
  get user() {
    const s = this.get();
    return s ? s.user : null;
  },
};

/* ---- Fetch wrappers -------------------------------------------------------- */
/* Every call returns { ok, status, data }. Errors are returned, not thrown, so
   callers can branch on status (e.g. 401 vs 404) without try/catch noise. */
async function request(method, path, { body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session.token) headers['Authorization'] = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Without this, a request fired from a 'pagehide'/'visibilitychange'
      // handler (see saveProgress() in player.js) can get cancelled mid-flight
      // once the page starts tearing down - Chrome tends to let it slip
      // through anyway, but Firefox and Safari are stricter about it. keepalive
      // tells the browser to let the request finish in the background instead.
      keepalive: true,
    });
  } catch (networkErr) {
    return { ok: false, status: 0, data: { error: { code: 'NETWORK', message: 'Server unreachable.' } } };
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  login: (email, password) => request('POST', '/api/auth/login', { body: { email, password } }),
  logout: () => request('POST', '/api/auth/logout', { auth: true }),
  profile: () => request('GET', '/api/profile', { auth: true }),
  catalog: (search = '') =>
    request('GET', `/api/content${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  title: (id) => request('GET', `/api/content/${encodeURIComponent(id)}`, { auth: true }),
  startPlayback: (id) =>
    request('POST', `/api/content/${encodeURIComponent(id)}/playback`, { auth: true }),
  getProgress: (id) =>
    request('GET', `/api/content/${encodeURIComponent(id)}/progress`, { auth: true }),
  saveProgress: (id, positionSec) =>
    request('POST', `/api/content/${encodeURIComponent(id)}/progress`, {
      auth: true,
      body: { positionSec },
    }),
};

/* ---- Route guard ---------------------------------------------------------- */
/* Protected pages call this on load. If there is no session, bounce to login
   and remember where the user was headed (so a deep link still works). */
export function requireAuth() {
  if (!session.token) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/login.html?next=${next}`);
    return false;
  }
  return true;
}

/* ---- Formatting ----------------------------------------------------------- */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/* ---- Toast (shared transient message) ------------------------------------- */
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}
