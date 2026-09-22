/* ============================================================================
   STREAMZ — demo media-player backend + static host
   ----------------------------------------------------------------------------
   Zero external dependencies. Runs on Node's built-in `http` module so there is
   NOTHING to `npm install` before you start. One process serves both:
       - the front-end pages from /public        (UI under test)
       - the JSON REST API under /api            (API under test)
   on a single origin (http://localhost:3100), so there are no CORS headaches
   when Playwright drives the UI and the `request` fixture hits the API.

   The API is built to exercise the JD's "UI, API and Integration levels of
   testing" line:
       Auth        POST /api/auth/login        200 / 400 / 401
                   POST /api/auth/logout       200 / 401
                   GET  /api/profile           200 / 401
       Catalog     GET  /api/content           200            (public browse)
                   GET  /api/content/:id       200 / 401 / 404 / 451
       Playback    POST /api/content/:id/playback   200 / 401 / 404 / 451
       Progress    GET  /api/content/:id/progress   200 / 401 / 404
                   POST /api/content/:id/progress   200 / 400 / 401 / 404
       Debug       GET  /api/debug/error       500            (deliberate 5xx)
                   GET  /api/health            200

   Read the route table at the bottom of this file like a map; each handler is
   small and commented so you can predict exactly what a test should assert.

   TESTABILITY NOTE: this module exports `createServer()` and only starts
   listening when run directly (`node server.js`). That lets the automated
   tests boot a fresh server on a random port without spawning a process.
   ============================================================================ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { users, titles } = require('./data/catalog');
const {
  publicUser,
  catalogCard,
  filterTitles,
  resolveTitleAccess,
  validatePosition,
  parseBearer,
} = require('./lib/streamz-core');

const PORT = process.env.PORT || 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ============================================================================
   createServer() — builds the HTTP server with its own private in-memory state.
   Each call gets a fresh `activeTokens` / `progress` map, so a test that boots
   its own server starts from a clean slate.
   ========================================================================== */
function createServer() {
  /* --------------------------------------------------------------------------
     STATE — everything is in memory and resets when the server restarts.
       activeTokens : token -> userId   (login adds an entry, logout deletes it)
       progress     : `${userId}:${titleId}` -> positionSec  (resume points)
  -------------------------------------------------------------------------- */
  const activeTokens = new Map();
  const progress = new Map();

  /* ==========================================================================
     TOKENS — kept deliberately simple: a random string we remember in a Map.
     That's enough to make auth tests meaningful — a missing token, a made-up
     token, or a logged-out token are all unknown to the Map, so all get a 401.
     ======================================================================== */
  function signToken(userId) {
    const token = crypto.randomBytes(24).toString('hex');
    activeTokens.set(token, userId);
    return token;
  }

  /* Returns the user for a valid Authorization header, or null. */
  function authenticate(req) {
    const token = parseBearer(req.headers['authorization']);
    if (!token) return null;

    const userId = activeTokens.get(token);   // unknown token -> undefined -> 401
    if (!userId) return null;

    return users.find((u) => u.id === userId) || null;
  }

  /* ==========================================================================
     HTTP HELPERS
     ======================================================================== */
  function sendJson(res, status, obj) {
    const data = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data),
      'Cache-Control': 'no-store',
    });
    res.end(data);
  }

  /* Standardised error envelope so every failing response looks the same to a
     test:  { error: { code, message } }  alongside the HTTP status. */
  function sendError(res, status, code, message) {
    sendJson(res, status, { error: { code, message } });
  }

  /* Reads and JSON-parses a request body. Resolves { ok, data } so handlers can
     distinguish "no/!invalid JSON" (400) from a genuinely empty body. */
  function readJsonBody(req) {
    return new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 1e6) req.destroy();    // basic guard
      });
      req.on('end', () => {
        if (!raw) return resolve({ ok: true, data: {} });
        try {
          resolve({ ok: true, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ ok: false, data: null });
        }
      });
      req.on('error', () => resolve({ ok: false, data: null }));
    });
  }

  /* ==========================================================================
     ROUTE HANDLERS
     Each returns a response via sendJson/sendError. Authorization rules are
     applied consistently so the same id behaves the same across endpoints.
     ======================================================================== */

  // POST /api/auth/login  ----------------------------------------------------
  async function handleLogin(req, res) {
    const { ok, data } = await readJsonBody(req);
    if (!ok) return sendError(res, 400, 'BAD_JSON', 'Request body must be valid JSON.');

    const { email, password } = data || {};
    if (!email || !password) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Both email and password are required.');
    }

    const user = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password
    );
    if (!user) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    return sendJson(res, 200, { token: signToken(user.id), user: publicUser(user) });
  }

  // POST /api/auth/logout  ---------------------------------------------------
  function handleLogout(req, res, user) {
    const token = parseBearer(req.headers['authorization']);
    if (token) activeTokens.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/profile  --------------------------------------------------------
  function handleProfile(req, res, user) {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  // GET /api/content  --------------------------------------------------------
  // Public browse. Supports ?search= and ?genre= filters (case-insensitive).
  function handleCatalog(req, res, _user, query) {
    const items = filterTitles(titles, {
      search: query.get('search') || '',
      genre: query.get('genre') || '',
    }).map(catalogCard);

    return sendJson(res, 200, { count: items.length, items });
  }

  // GET /api/content/:id  ----------------------------------------------------
  function handleTitleDetail(req, res, user, _query, id) {
    const gate = resolveTitleAccess(titles, id);
    if (gate.status) return sendError(res, gate.status, gate.code, gate.message);

    const t = gate.title;
    const positionSec = progress.get(`${user.id}:${t.id}`) || 0;
    return sendJson(res, 200, {
      ...catalogCard(t),
      synopsis: t.synopsis,
      qualities: t.qualities,
      progressSec: positionSec,
    });
  }

  // POST /api/content/:id/playback  ------------------------------------------
  // Starts a playback "session": the integration step the JD calls out
  // (login -> fetch content -> playback). Returns where to resume from.
  function handlePlayback(req, res, user, _query, id) {
    const gate = resolveTitleAccess(titles, id);
    if (gate.status) return sendError(res, gate.status, gate.code, gate.message);

    const t = gate.title;
    const startPositionSec = progress.get(`${user.id}:${t.id}`) || 0;
    return sendJson(res, 200, {
      sessionId: 'sess_' + crypto.randomBytes(6).toString('hex'),
      titleId: t.id,
      title: t.title,
      manifestUrl: `/streams/${t.id}/manifest.m3u8`, // not real; just a value to assert on
      durationSec: t.durationSec,
      startPositionSec,
      qualities: t.qualities,
      captions: t.captions,
    });
  }

  // GET /api/content/:id/progress  -------------------------------------------
  function handleGetProgress(req, res, user, _query, id) {
    const title = titles.find((t) => t.id === id);
    if (!title) return sendError(res, 404, 'NOT_FOUND', `No title with id '${id}'.`);
    return sendJson(res, 200, { titleId: id, positionSec: progress.get(`${user.id}:${id}`) || 0 });
  }

  // POST /api/content/:id/progress  ------------------------------------------
  // Persists a resume point. Validates the payload so you can write a negative
  // test (non-numeric / out-of-range -> 400).
  async function handleSaveProgress(req, res, user, _query, id) {
    const title = titles.find((t) => t.id === id);
    if (!title) return sendError(res, 404, 'NOT_FOUND', `No title with id '${id}'.`);

    const { ok, data } = await readJsonBody(req);
    if (!ok) return sendError(res, 400, 'BAD_JSON', 'Request body must be valid JSON.');

    const pos = data ? data.positionSec : undefined;
    const check = validatePosition(pos, title.durationSec);
    if (!check.ok) {
      return sendError(
        res,
        400,
        'INVALID_POSITION',
        `positionSec must be a number between 0 and ${title.durationSec}.`
      );
    }

    progress.set(`${user.id}:${id}`, check.value);
    return sendJson(res, 200, { saved: true, titleId: id, positionSec: check.value });
  }

  /* ==========================================================================
     STATIC FILE SERVING (the front-end)
     ======================================================================== */
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
  };

  function serveStatic(req, res, pathname) {
    // Default document + simple extensionless mapping (/login -> /login.html).
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (!path.extname(rel)) rel += '.html';

    // Resolve safely inside PUBLIC_DIR to block path traversal.
    const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return sendError(res, 403, 'FORBIDDEN', 'Path outside web root.');
    }

    fs.readFile(filePath, (err, buf) => {
      if (err) {
        // Unknown UI path -> bounce to the login page so deep links still work.
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, fallback) => {
          if (e2) return sendError(res, 404, 'NOT_FOUND', 'Not found.');
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(fallback);
        });
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(buf);
    });
  }

  /* ==========================================================================
     ROUTER — match method + path, enforce auth, dispatch.
     `auth: true` routes return 401 automatically unless a valid token is present.
     ======================================================================== */
  const routes = [
    { method: 'GET', pattern: /^\/api\/health$/, auth: false, handler: (req, res) =>
        sendJson(res, 200, { status: 'ok', time: new Date().toISOString() }) },

    { method: 'GET', pattern: /^\/api\/debug\/error$/, auth: false, handler: (req, res) =>
        sendError(res, 500, 'SERVER_ERROR', 'Deliberate 500 for testing 5xx handling.') },

    { method: 'POST', pattern: /^\/api\/auth\/login$/, auth: false, handler: handleLogin },
    { method: 'POST', pattern: /^\/api\/auth\/logout$/, auth: true, handler: handleLogout },
    { method: 'GET', pattern: /^\/api\/profile$/, auth: true, handler: handleProfile },

    { method: 'GET', pattern: /^\/api\/content$/, auth: false, handler: handleCatalog },
    { method: 'GET', pattern: /^\/api\/content\/([^/]+)$/, auth: true, handler: handleTitleDetail },
    { method: 'POST', pattern: /^\/api\/content\/([^/]+)\/playback$/, auth: true, handler: handlePlayback },
    { method: 'GET', pattern: /^\/api\/content\/([^/]+)\/progress$/, auth: true, handler: handleGetProgress },
    { method: 'POST', pattern: /^\/api\/content\/([^/]+)\/progress$/, auth: true, handler: handleSaveProgress },
  ];

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Anything not under /api is treated as a static/front-end request.
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET') {
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed for pages.');
      }
      return serveStatic(req, res, pathname);
    }

    // Find a route whose method + path match.
    const pathMatches = routes.filter((r) => r.pattern.test(pathname));
    if (pathMatches.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', `No API route for ${pathname}.`);
    }
    const route = pathMatches.find((r) => r.method === req.method);
    if (!route) {
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', `${req.method} not allowed on ${pathname}.`);
    }

    // Enforce auth for protected routes.
    let user = null;
    if (route.auth) {
      user = authenticate(req);
      if (!user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid bearer token.');
      }
    }

    // First capture group (if any) is the :id path param.
    const params = route.pattern.exec(pathname);
    const id = params && params[1] ? decodeURIComponent(params[1]) : undefined;

    try {
      await route.handler(req, res, user, url.searchParams, id);
    } catch (err) {
      // Never let a handler throw leak a stack trace to the client.
      if (!res.headersSent) sendError(res, 500, 'SERVER_ERROR', 'Unexpected server error.');
    }
  });
}

/* ============================================================================
   ENTRYPOINT — only listen when run directly (`node server.js`). When this file
   is `require()`d by a test, nothing starts until the test calls listen().
   ========================================================================== */
if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    /* eslint-disable no-console */
    console.log('\n  Streamz demo running:');
    console.log(`    UI   ->  http://localhost:${PORT}/`);
    console.log(`    API  ->  http://localhost:${PORT}/api/health`);
    console.log('\n  Test account:');
    console.log('    qa@streamz.test / Test@123');
    console.log('\n  Stop with Ctrl+C.\n');
  });
}

module.exports = { createServer };
