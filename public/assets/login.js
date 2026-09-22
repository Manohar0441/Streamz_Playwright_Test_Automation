/* ============================================================================
   login.js — client logic for the sign-in page
   ----------------------------------------------------------------------------
   Demonstrates the UI-automation surface the JD names: a login flow with
   client-side validation, a server round-trip, an error state on bad
   credentials, and a redirect on success.
   ============================================================================ */
import { api, session } from '/assets/api.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const formError = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

// Already signed in? Skip the form.
if (session.token) {
  location.replace(nextTarget());
}

/* Where to go after a successful login: honour ?next=, else /browse. */
function nextTarget() {
  const next = new URLSearchParams(location.search).get('next');
  // Only allow same-site relative paths (avoid open-redirect).
  if (next && next.startsWith('/')) return next;
  return '/browse.html';
}

function clearErrors() {
  emailError.textContent = '';
  passwordError.textContent = '';
  formError.hidden = true;
  formError.textContent = '';
}

/* Returns true when the form is locally valid. Mirrors the server's 400 rules
   so the happy path never needs a round-trip to discover an empty field. */
function validate() {
  let ok = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {
    emailError.textContent = 'Email is required.';
    ok = false;
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    emailError.textContent = 'Enter a valid email address.';
    ok = false;
  }
  if (!password) {
    passwordError.textContent = 'Password is required.';
    ok = false;
  }
  return ok;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  if (!validate()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  const res = await api.login(emailInput.value.trim(), passwordInput.value);

  if (res.ok) {
    session.set({ token: res.data.token, user: res.data.user });
    location.replace(nextTarget());
    return;
  }

  // Surface server-side failures in the banner.
  const code = res.data && res.data.error ? res.data.error.code : 'ERROR';
  formError.textContent =
    code === 'INVALID_CREDENTIALS'
      ? 'Email or password is incorrect.'
      : (res.data && res.data.error && res.data.error.message) || 'Something went wrong. Try again.';
  formError.hidden = false;

  submitBtn.disabled = false;
  submitBtn.textContent = 'Sign in';
});
