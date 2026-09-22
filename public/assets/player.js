/* ============================================================================
   player.js — the media player (the JD's headline UI surface)
   ----------------------------------------------------------------------------
   This is a SIMULATED player on purpose: a deterministic timeline you drive
   from tests, with no real media file, codecs, or autoplay policies to make
   tests flaky. Everything a test cares about is exposed two ways:

     1) DOM contract (preferred, "user-facing" assertions):
          - #player [data-state] = idle|buffering|playing|paused|ended|error
          - play/pause button aria-label flips "Play" <-> "Pause"
          - time read-outs, seek slider, captions box, etc. via data-testid
     2) window.__player  — a small API for page.evaluate() power-assertions:
          getState(), play(), pause(), seek(s), currentTime, duration, paused

   Flow on load (the integration path):  require auth -> POST /playback ->
   resume from saved progress -> play -> periodically POST /progress.
   ============================================================================ */
import { api, session, requireAuth, formatTime, toast } from '/assets/api.js';

if (!requireAuth()) {
  // requireAuth() already redirected; stop the module here.
  throw new Error('redirecting to login');
}

/* ---- element handles ------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const player = $('player');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const ui = {
  playPause: $('playPause'),
  bigPlay: $('bigPlay'),
  rewind: $('rewindBtn'),
  forward: $('forwardBtn'),
  seek: $('seek'),
  current: $('currentTime'),
  duration: $('durationTime'),
  statePill: $('statePill'),
  captionsBtn: $('captionsBtn'),
  captionsBox: $('captions'),
  quality: $('quality'),
  mute: $('muteBtn'),
  volume: $('volume'),
  loadingOverlay: $('loadingOverlay'),
  startOverlay: $('startOverlay'),
  endedOverlay: $('endedOverlay'),
  errorOverlay: $('errorOverlay'),
  errorTitle: $('errorTitle'),
  errorMessage: $('errorMessage'),
  replay: $('replayBtn'),
  titleName: $('titleName'),
  metaLine: $('metaLine'),
  synopsis: $('synopsis'),
  avatar: $('avatar'),
  logout: $('logoutBtn'),
};

/* ============================================================================
   SIM ENGINE — a tiny clock-driven timeline
   ========================================================================== */
const engine = {
  duration: 0,
  currentTime: 0,
  paused: true,
  muted: false,
  volume: 1,
  captionsOn: false,
  hasCaptions: false,
  quality: 'Auto',
  state: 'loading', // loading|idle|buffering|playing|paused|ended|error
  _timer: null,
  _lastTs: 0,
  _bufferTimer: null,
};

/* Central state setter: updates data-state + the visible pill + overlays. */
function setState(next) {
  engine.state = next;
  player.dataset.state = next;
  ui.statePill.textContent = next.toUpperCase();
  ui.statePill.dataset.state = next; // lets CSS color-code the pill per state

  ui.loadingOverlay.hidden = next !== 'buffering';
  ui.startOverlay.hidden = next !== 'idle';
  ui.endedOverlay.hidden = next !== 'ended';
  // error overlay is shown explicitly by fail()

  const playing = next === 'playing';
  ui.playPause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  ui.playPause.setAttribute('aria-pressed', playing ? 'true' : 'false');
  ui.playPause.textContent = playing ? '❚❚' : '▶';
}

function play() {
  if (engine.state === 'error') return;
  if (engine.currentTime >= engine.duration) engine.currentTime = 0;

  // Simulate a short buffering hop on the first play / after seeking.
  setState('buffering');
  clearTimeout(engine._bufferTimer);
  engine._bufferTimer = setTimeout(() => {
    engine.paused = false;
    setState('playing');
    startClock();
  }, 450);
}

function pause() {
  engine.paused = true;
  stopClock();
  clearTimeout(engine._bufferTimer);
  if (engine.state !== 'ended' && engine.state !== 'error') setState('paused');
  saveProgress();
}

function toggle() {
  if (engine.state === 'playing' || engine.state === 'buffering') pause();
  else play();
}

function seek(seconds) {
  engine.currentTime = clamp(seconds, 0, engine.duration);
  if (engine.state === 'ended' && engine.currentTime < engine.duration) {
    engine.paused ? setState('paused') : setState('playing');
  }
  render();
  syncSeek();
}

function skip(delta) {
  seek(engine.currentTime + delta);
}

/* The clock: advance currentTime by REAL elapsed time while playing.
   A setInterval (not requestAnimationFrame) is used on purpose so the timeline
   keeps ticking even when the tab is backgrounded or running headless — which
   keeps automated playback tests deterministic instead of flaky. */
function startClock() {
  stopClock();
  engine._lastTs = performance.now();
  engine._timer = setInterval(() => {
    if (engine.paused) return;
    const now = performance.now();
    const dt = (now - engine._lastTs) / 1000;
    engine._lastTs = now;
    engine.currentTime = Math.min(engine.duration, engine.currentTime + dt);

    render();
    syncSeek();
    maybeSaveProgress();

    if (engine.currentTime >= engine.duration) {
      engine.currentTime = engine.duration;
      engine.paused = true;
      stopClock();
      setState('ended');
      saveProgress();
    }
  }, 100);
}

function stopClock() {
  if (engine._timer) {
    clearInterval(engine._timer);
    engine._timer = null;
  }
}

/* ---- view sync ------------------------------------------------------------ */
function syncSeek() {
  // Don't fight the user while they're dragging the slider.
  if (document.activeElement !== ui.seek) ui.seek.value = String(Math.floor(engine.currentTime));
  ui.current.textContent = formatTime(engine.currentTime);
}

function render() {
  drawCanvas();
  renderCaptions();
}

/* ============================================================================
   CANVAS — a lightweight "playback" visual so play/pause is obvious on screen.
   Equalizer bars animate only while playing; a timecode + progress line show
   position. No real video; this is purely cosmetic.
   ========================================================================== */
let activeTitle = null;

function drawCanvas() {
  const w = canvas.width;
  const h = canvas.height;
  const t = engine.currentTime;
  const playing = engine.state === 'playing';
  const pct = engine.duration ? t / engine.duration : 0;

  // backdrop
  ctx.fillStyle = '#04050c';
  ctx.fillRect(0, 0, w, h);

  // neon grid
  ctx.strokeStyle = 'rgba(0,240,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // magenta playhead scan-line, positioned by progress
  ctx.save();
  ctx.shadowColor = '#ff2bd6';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255,43,214,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * pct, 0);
  ctx.lineTo(w * pct, h);
  ctx.stroke();
  ctx.restore();

  // title (neon cyan)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#c7fbff';
  ctx.font = '700 40px "Share Tech Mono", ui-monospace, monospace';
  ctx.fillText((activeTitle ? activeTitle.title : '').toUpperCase(), w / 2, h / 2 - 48);
  ctx.restore();

  // timecode (neon magenta)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff2bd6';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ff6be4';
  ctx.font = '600 22px "Share Tech Mono", ui-monospace, monospace';
  ctx.fillText(`${formatTime(t)} // ${formatTime(engine.duration)}`, w / 2, h / 2 + 2);
  ctx.restore();

  // equalizer bars (cyan↔magenta gradient, animate while playing)
  const bars = 32, barW = 10, gap = 8;
  const totalW = bars * barW + (bars - 1) * gap;
  const x0 = (w - totalW) / 2;
  const baseY = h / 2 + 124;
  ctx.save();
  for (let i = 0; i < bars; i++) {
    const phase = playing ? t * 5 : i * 0.5; // frozen when not playing
    const amp = (Math.sin(phase + i * 0.5) * 0.5 + 0.5) * 72 + 10;
    const x = x0 + i * (barW + gap);
    const grad = ctx.createLinearGradient(0, baseY - amp, 0, baseY);
    grad.addColorStop(0, '#ff2bd6');
    grad.addColorStop(1, '#00f0ff');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = playing ? 12 : 3;
    ctx.globalAlpha = playing ? 1 : 0.5;
    ctx.fillRect(x, baseY - amp, barW, amp);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // progress bar
  ctx.fillStyle = 'rgba(0,240,255,0.12)';
  ctx.fillRect(0, h - 6, w, 6);
  ctx.save();
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(0, h - 6, w * pct, 6);
  ctx.restore();
}

/* ---- captions (fake cues that change with the timeline) ------------------- */
const CUES = [
  'Welcome to Streamz.',
  'This is a simulated caption track.',
  'Captions update as the timeline advances.',
  'Toggle me with the CC button.',
  'Great work automating this player.',
];
function renderCaptions() {
  if (!engine.captionsOn || !engine.hasCaptions || engine.state !== 'playing') {
    ui.captionsBox.hidden = true;
    return;
  }
  const idx = Math.floor(engine.currentTime / 5) % CUES.length;
  ui.captionsBox.textContent = CUES[idx];
  ui.captionsBox.hidden = false;
}

/* ============================================================================
   PROGRESS PERSISTENCE — periodic + on pause/end/leave -> resume next time
   ========================================================================== */
let lastSaved = 0;
function maybeSaveProgress() {
  if (engine.currentTime - lastSaved >= 5) saveProgress();
}
function saveProgress() {
  if (!activeTitle || engine.currentTime <= 0) return;
  lastSaved = engine.currentTime;
  // fire-and-forget; a failure here shouldn't interrupt playback
  api.saveProgress(activeTitle.id, Math.round(engine.currentTime)).catch(() => {});
}

/* ============================================================================
   ERROR STATE — used for 404 / 451 / network failures
   ========================================================================== */
function fail(title, message) {
  setState('error');
  stopClock();
  ui.loadingOverlay.hidden = true;
  ui.errorTitle.textContent = title;
  ui.errorMessage.textContent = message;
  ui.errorOverlay.hidden = false;
  ui.playPause.disabled = true;
  ui.rewind.disabled = true;
  ui.forward.disabled = true;
  ui.seek.disabled = true;
}

/* ============================================================================
   BOOTSTRAP — fetch the playback session and wire everything up
   ========================================================================== */
async function init() {
  const user = session.user;
  ui.avatar.textContent = user && user.name ? user.name[0].toUpperCase() : '?';
  ui.logout.addEventListener('click', async () => {
    await api.logout();
    session.clear();
    location.replace('/login.html');
  });

  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    fail('No title selected', 'Open a title from the browse page.');
    return;
  }

  // Start a playback session (auth + availability are enforced here).
  const res = await api.startPlayback(id);

  if (res.status === 401) {
    session.clear();
    location.replace('/login.html');
    return;
  }
  if (!res.ok) {
    const err = (res.data && res.data.error) || {};
    const map = {
      NOT_FOUND: ['Title not found', 'We couldn’t find that title in the catalog.'],
      UNAVAILABLE: ['Currently unavailable', 'The streaming rights for this title have expired.'],
    };
    const [t, m] = map[err.code] || ['Can’t play this title', err.message || 'Unknown error.'];
    fail(t, m);
    // We still want title metadata if we can get it for context — skip on hard errors.
    return;
  }

  const sess = res.data;

  // Fetch the richer detail for synopsis/genres/etc.
  const detail = await api.title(id);
  activeTitle = detail.ok ? detail.data : { id, title: sess.title, poster: { bg: '#10131a', fg: '#5b8cff', emoji: '🎬' } };

  // Configure engine from the session.
  engine.duration = sess.durationSec;
  engine.currentTime = sess.startPositionSec || 0;
  engine.hasCaptions = !!sess.captions;
  engine.quality = sess.qualities[sess.qualities.length - 1] || 'Auto';

  // Populate the meta + controls.
  document.title = `${activeTitle.title} · Streamz`;
  ui.titleName.textContent = activeTitle.title;
  ui.metaLine.innerHTML = metaHtml(activeTitle, sess);
  ui.synopsis.textContent = activeTitle.synopsis || '';
  ui.duration.textContent = formatTime(engine.duration);
  ui.seek.max = String(engine.duration);
  buildQualityOptions(sess.qualities);
  ui.captionsBtn.disabled = !engine.hasCaptions;

  lastSaved = engine.currentTime;
  render();
  syncSeek();

  // If we resumed mid-title, land in 'paused' so the user can press play; if
  // starting fresh, show the big play button (idle).
  setState(engine.currentTime > 0 ? 'paused' : 'idle');

  wireControls();
}

function metaHtml(t, sess) {
  const genres = (t.genres || []).join(' · ');
  return `
    <span>${t.year || ''}</span>
    <span>${t.rating || ''}</span>
    <span>${genres}</span>
    <span>${formatTime(sess.durationSec)}</span>`;
}

function buildQualityOptions(qualities) {
  const opts = ['Auto', ...qualities];
  ui.quality.innerHTML = opts
    .map((q) => `<option value="${q}">${q}</option>`)
    .join('');
  ui.quality.value = engine.quality;
}

/* ============================================================================
   CONTROL WIRING
   ========================================================================== */
function wireControls() {
  ui.playPause.addEventListener('click', toggle);
  ui.bigPlay.addEventListener('click', play);
  ui.replay.addEventListener('click', () => {
    seek(0);
    play();
  });

  ui.rewind.addEventListener('click', () => skip(-10));
  ui.forward.addEventListener('click', () => skip(10));

  // Seek slider: dragging or programmatic .fill() both fire 'input'.
  ui.seek.addEventListener('input', () => seek(Number(ui.seek.value)));

  // Volume + mute
  ui.volume.addEventListener('input', () => {
    engine.volume = Number(ui.volume.value) / 100;
    engine.muted = engine.volume === 0;
    reflectMute();
  });
  ui.mute.addEventListener('click', () => {
    engine.muted = !engine.muted;
    reflectMute();
  });

  // Captions
  ui.captionsBtn.addEventListener('click', () => {
    if (!engine.hasCaptions) return;
    engine.captionsOn = !engine.captionsOn;
    ui.captionsBtn.setAttribute('aria-pressed', engine.captionsOn ? 'true' : 'false');
    ui.captionsBtn.classList.toggle('active', engine.captionsOn);
    renderCaptions();
  });

  // Quality (an ABR nod): switching shows a brief buffer + a toast.
  ui.quality.addEventListener('change', () => {
    engine.quality = ui.quality.value;
    toast(`Quality: ${engine.quality}`);
    if (engine.state === 'playing') {
      setState('buffering');
      setTimeout(() => { if (engine.state === 'buffering') setState('playing'); }, 350);
    }
  });

  // Keyboard: Space toggles play/pause, arrows skip.
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowLeft') skip(-10);
    if (e.code === 'ArrowRight') skip(10);
  });

  // Persist on leave so resume works across reloads.
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveProgress();
  });
}

function reflectMute() {
  ui.mute.setAttribute('aria-pressed', engine.muted ? 'true' : 'false');
  ui.mute.setAttribute('aria-label', engine.muted ? 'Unmute' : 'Mute');
  ui.mute.textContent = engine.muted ? '🔇' : '🔊';
  if (engine.muted) ui.volume.value = '0';
  else if (Number(ui.volume.value) === 0) ui.volume.value = String(Math.round(engine.volume * 100)) || '100';
}

/* ============================================================================
   UTILITIES
   ========================================================================== */
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/* ============================================================================
   TEST HOOK — window.__player
   A minimal API for page.evaluate() assertions. Mirrors (a subset of) the
   HTMLMediaElement shape so it reads naturally in tests.
   ========================================================================== */
window.__player = {
  play,
  pause,
  toggle,
  seek,
  skip,
  get currentTime() { return engine.currentTime; },
  get duration() { return engine.duration; },
  get paused() { return engine.paused; },
  get ended() { return engine.state === 'ended'; },
  get muted() { return engine.muted; },
  get quality() { return engine.quality; },
  get captionsOn() { return engine.captionsOn; },
  getState() {
    return {
      state: engine.state,
      currentTime: Math.round(engine.currentTime * 100) / 100,
      duration: engine.duration,
      paused: engine.paused,
      muted: engine.muted,
      quality: engine.quality,
      captionsOn: engine.captionsOn,
      titleId: activeTitle ? activeTitle.id : null,
    };
  },
};

init();
