/* ============================================================================
   streamz-core.js — pure, dependency-free helpers
   ----------------------------------------------------------------------------
   These are the small, side-effect-free pieces of logic the server relies on.
   Keeping them HERE (instead of inline in server.js) is what lets the UNIT
   tests call them directly, with no HTTP server and no network — the fastest,
   most focused level of the test pyramid.

   Every function takes its inputs as arguments and returns a value. No globals,
   no `req`/`res`, nothing to mock.
   ============================================================================ */

'use strict';

/* Public view of a user — never leak the password field. */
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name };
}

/* Catalog card — the trimmed title shape used in browse listings. */
function catalogCard(t) {
  return {
    id: t.id,
    title: t.title,
    year: t.year,
    rating: t.rating,
    genres: t.genres,
    durationSec: t.durationSec,
    available: t.available,
    captions: t.captions,
    poster: t.poster,
  };
}

/* Case-insensitive search + genre filter over a list of titles.
   Returns a NEW array (never mutates the input). */
function filterTitles(titles, { search = '', genre = '' } = {}) {
  let items = titles.slice();

  const s = String(search).trim().toLowerCase();
  if (s) {
    items = items.filter(
      (t) =>
        t.title.toLowerCase().includes(s) ||
        t.genres.join(' ').toLowerCase().includes(s)
    );
  }

  const g = String(genre).trim().toLowerCase();
  if (g) {
    items = items.filter((t) => t.genres.some((x) => x.toLowerCase() === g));
  }

  return items;
}

/* Decide whether a per-title request may proceed.
   Returns { title } to allow, or { status, code, message } to reject
   (404 unknown id, 451 rights-expired). */
function resolveTitleAccess(titles, id) {
  const title = titles.find((t) => t.id === id);
  if (!title) {
    return { status: 404, code: 'NOT_FOUND', message: `No title with id '${id}'.` };
  }
  if (!title.available) {
    return { status: 451, code: 'UNAVAILABLE', message: 'This title is unavailable (rights expired).' };
  }
  return { title };
}

/* Validate a resume position against a title's duration.
   Returns { ok: true, value } (rounded) or { ok: false }. */
function validatePosition(pos, durationSec) {
  if (typeof pos !== 'number' || Number.isNaN(pos) || pos < 0 || pos > durationSec) {
    return { ok: false };
  }
  return { ok: true, value: Math.round(pos) };
}

/* Pull the token out of an "Authorization: Bearer <token>" header.
   Returns the trimmed token, or null when the header is missing/malformed. */
function parseBearer(header) {
  const match = /^Bearer\s+(.+)$/i.exec(header || '');
  return match ? match[1].trim() : null;
}

module.exports = {
  publicUser,
  catalogCard,
  filterTitles,
  resolveTitleAccess,
  validatePosition,
  parseBearer,
};
