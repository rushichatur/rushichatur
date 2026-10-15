// Sign-in dialog and account button, shared by the home page, the app and the dashboard.

import { h } from './util.js';
import { auth } from './auth.js';
import { icon } from './icons.js';

const GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const LOGO = '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2563eb"/><path d="M16 6l9 5v10l-9 5-9-5V11z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M7 11l9 5 9-5M16 16v10" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';

let dlg = null;

export function closeAuthDialog() { if (dlg) { dlg.remove(); dlg = null; document.body.classList.remove('auth-open'); } }

/**
 * @param {{reason?:string, mode?:'signin'|'signup', onSuccess?:()=>void, onCancel?:()=>void}} opts
 */
export function openAuthDialog(opts = {}) {
  closeAuthDialog();
  let mode = opts.mode || 'signin';
  const demo = auth.backend !== 'firebase';
  const overlay = h('div', { class: 'auth-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in' });
  dlg = overlay;
  document.body.append(overlay);
  document.body.classList.add('auth-open');
  const cancel = () => { closeAuthDialog(); if (opts.onCancel) opts.onCancel(); };
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) cancel(); });
  const onKey = (e) => { if (e.key === 'Escape' && dlg === overlay) { document.removeEventListener('keydown', onKey); cancel(); } };
  document.addEventListener('keydown', onKey);

  const render = () => {
    const signup = mode === 'signup';
    const err = h('div', { class: 'auth-err', role: 'alert', hidden: true });
    const showErr = (m) => { err.textContent = m; err.hidden = !m; };
    const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
    const done = () => { closeAuthDialog(); document.removeEventListener('keydown', onKey); if (opts.onSuccess) opts.onSuccess(); };

    const google = h('button', { type: 'button', class: 'auth-google', html: GOOGLE + '<span>Continue with Google</span>', disabled: demo, title: demo ? 'Needs the Firebase setup (see README)' : '' });
    google.addEventListener('click', async () => {
      showErr(''); busy(google, true);
      try { await auth.signInGoogle(); done(); } catch (e) { showErr(e.message); } finally { busy(google, false); }
    });

    const name = h('input', { id: 'authName', type: 'text', placeholder: 'Your name', autocomplete: 'name', hidden: !signup });
    const email = h('input', { id: 'authEmail', type: 'email', placeholder: 'Email address', autocomplete: 'email', required: true });
    const pass = h('input', { id: 'authPass', type: 'password', placeholder: signup ? 'Create a password (6+ characters)' : 'Password', autocomplete: signup ? 'new-password' : 'current-password', required: true, minlength: 6 });
    const submit = h('button', { type: 'submit', class: 'btn primary auth-submit' }, signup ? 'Create account' : 'Sign in');
    const form = h('form', { class: 'auth-form', novalidate: true }, name, email, pass, err, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); showErr('');
      if (!email.value.trim() || !pass.value) { showErr('Enter your email and password.'); return; }
      busy(submit, true);
      try {
        if (signup) await auth.signUp(name.value.trim(), email.value, pass.value); else await auth.signIn(email.value, pass.value);
        done();
      } catch (ex) { showErr(ex.message); } finally { busy(submit, false); }
    });

    const forgot = h('button', { type: 'button', class: 'auth-link', hidden: signup }, 'Forgot password?');
    forgot.addEventListener('click', async () => {
      showErr('');
      try { await auth.resetPassword(email.value); err.hidden = false; err.textContent = 'Check your inbox for a reset link.'; err.className = 'auth-err ok'; } catch (ex) { err.className = 'auth-err'; showErr(ex.message); }
    });
    const swap = h('button', { type: 'button', class: 'auth-link' }, signup ? 'Already have an account? Sign in' : 'New here? Create an account');
    swap.addEventListener('click', () => { mode = signup ? 'signin' : 'signup'; render(); });

    overlay.innerHTML = '';
    overlay.append(h('div', { class: 'auth-card' },
      h('button', { class: 'icon-btn auth-x', title: 'Close', 'aria-label': 'Close', html: icon('close'), onclick: cancel }),
      h('div', { class: 'auth-logo', html: LOGO }),
      h('h2', {}, opts.reason ? (signup ? 'Create your free account' : 'Sign in to continue') : signup ? 'Create your free account' : 'Welcome back'),
      h('p', { class: 'auth-sub' }, opts.reason || (signup ? 'Save projects and export your plans.' : 'Open your saved projects and export your plans.')),
      google,
      h('div', { class: 'auth-or' }, h('span', {}, 'or')),
      form,
      h('div', { class: 'auth-links' }, forgot, swap),
      demo ? h('p', { class: 'auth-demo' }, h('b', {}, 'Demo mode. '), 'Accounts and projects are saved in this browser only. Add your Firebase keys (README) to switch on Google sign-in and cloud saving.') : null,
    ));
    setTimeout(() => { if (dlg === overlay && !overlay.contains(document.activeElement)) (signup ? name : email).focus(); }, 30);
  };
  render();
}

/** Renders a "Sign in" button or the account menu into `el`, and keeps it up to date. */
export function mountAccount(el, { extraItems = () => [], signInLabel = 'Sign in', onSignOut } = {}) {
  let menu = null;
  const close = () => { if (menu) { menu.remove(); menu = null; } };
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && !el.contains(e.target)) close(); });

  const paint = (u) => {
    close();
    el.innerHTML = '';
    if (!u) {
      el.append(h('button', { class: 'btn acct-signin', onclick: () => openAuthDialog({ mode: 'signin' }) }, signInLabel));
      return;
    }
    const initial = (u.name || u.email || '?').trim()[0].toUpperCase();
    const btn = h('button', { class: 'avatar', title: u.email || u.name, 'aria-label': 'Account menu', 'aria-haspopup': 'menu' },
      u.photo ? h('img', { src: u.photo, alt: '', referrerpolicy: 'no-referrer' }) : initial);
    btn.addEventListener('click', () => {
      if (menu) { close(); return; }
      const r = btn.getBoundingClientRect();
      const items = [
        h('div', { class: 'acct-head' }, h('b', {}, u.name), h('span', {}, u.email || (auth.backend === 'demo' ? 'Demo account' : ''))),
        h('a', { class: 'menu-item', href: 'projects.html', html: icon('cube') + '<span>My projects</span>' }),
        ...extraItems(),
        h('hr'),
        h('button', { class: 'menu-item', html: icon('close') + '<span>Sign out</span>', onclick: async () => { close(); await auth.signOut(); if (onSignOut) onSignOut(); } }),
      ];
      menu = h('div', { class: 'menu acct-menu', role: 'menu' }, items);
      document.body.append(menu);
      menu.style.top = r.bottom + 8 + 'px';
      menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    });
    el.append(btn);
  };
  auth.onChange(paint);
  auth.init();
  return { repaint: () => paint(auth.user) };
}
