/* ============================================================================
   DATA — User + Title catalog (in-memory)
   ----------------------------------------------------------------------------
   This is the "database" for the Streamz media-player demo. It is intentionally
   plain so you can read every field at a glance while writing tests against it.

   There is ONE login account (keep it simple) — use it to sign in from the UI or
   to mint a token from an API test.

   Titles carry one flag that produces a negative case for you to test:
     - available: false   -> drives 451 (rights expired) for that title (tt-900)
   A "missing" id drives 404, and a deliberate 500 is exposed via the
   /api/debug/error route (see server.js).
   ============================================================================ */

'use strict';

/* ----------------------------------------------------------------------------
   USER  (just one)
   The password is stored in plain text ON PURPOSE — this is a throwaway test
   fixture, never a template for real auth.
---------------------------------------------------------------------------- */
const users = [
  {
    id: 'u_qa',
    email: 'qa@streamz.test',
    password: 'Test@123',
    name: 'Quinn Tester',
  },
];

/* ----------------------------------------------------------------------------
   TITLES
   durationSec is the simulated runtime the player counts through.
   poster.bg / poster.fg are just colors for the CSS card art (no binary assets).
---------------------------------------------------------------------------- */
const titles = [
  {
    id: 'tt-100',
    title: 'The Last Render',
    year: 2023,
    rating: 'PG-13',
    genres: ['Sci-Fi', 'Thriller'],
    durationSec: 142,
    synopsis:
      'A render farm gains awareness one frame at a time. A junior engineer must ship the build before it ships itself.',
    available: true,
    captions: true,
    qualities: ['480p', '720p', '1080p'],
    poster: { bg: '#1f3a5f', fg: '#7fb2ff', emoji: '🛰️' },
  },
  {
    id: 'tt-101',
    title: 'Pipeline of Dreams',
    year: 2021,
    rating: 'PG',
    genres: ['Drama'],
    durationSec: 118,
    synopsis:
      'Two interns automate a flaky deploy pipeline and accidentally automate the whole company.',
    available: true,
    captions: true,
    qualities: ['480p', '720p', '1080p'],
    poster: { bg: '#143d2e', fg: '#74e0a8', emoji: '🌱' },
  },
  {
    id: 'tt-102',
    title: 'Buffering: A Love Story',
    year: 2024,
    rating: 'R',
    genres: ['Romance', 'Comedy'],
    durationSec: 96,
    synopsis:
      'Boy meets girl on a 240p connection. Will their bitrate ever recover?',
    available: true,
    captions: true,
    qualities: ['480p', '720p', '1080p', '4K'],
    poster: { bg: '#4a1f4f', fg: '#e29bff', emoji: '💔' },
  },
  {
    id: 'tt-103',
    title: 'Edge Cases',
    year: 2022,
    rating: 'PG-13',
    genres: ['Documentary'],
    durationSec: 75,
    synopsis:
      'A documentary crew follows the bugs nobody can reproduce. Shot entirely on staging.',
    available: true,
    captions: false,
    qualities: ['720p', '1080p'],
    poster: { bg: '#5f3a14', fg: '#ffba7a', emoji: '🐛' },
  },
  {
    id: 'tt-104',
    title: 'Null & Void',
    year: 2020,
    rating: 'PG-13',
    genres: ['Action'],
    durationSec: 130,
    synopsis:
      'An exception handler with nothing left to lose catches one last throw.',
    available: true,
    captions: true,
    qualities: ['480p', '720p', '1080p'],
    poster: { bg: '#3a1f1f', fg: '#ff8a8a', emoji: '💥' },
  },
  {
    id: 'tt-900',
    title: 'Rights Expired (unavailable)',
    year: 2019,
    rating: 'NR',
    genres: ['Mystery'],
    durationSec: 110,
    synopsis:
      'This title is in the catalog but its streaming rights have lapsed — use it to test the player error state (HTTP 451).',
    available: false,
    captions: false,
    qualities: ['480p', '720p'],
    poster: { bg: '#2b2b2b', fg: '#9a9a9a', emoji: '🚫' },
  },
];

module.exports = { users, titles };
