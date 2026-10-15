// Authentication. Uses Firebase (Google + email/password) when js/config.js has a config,
// otherwise a clearly-labelled demo mode that keeps accounts in this browser only.

import { FIREBASE_CONFIG } from './config.js';
import { uid } from './util.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const LS_USERS = 'venuely.demo.users', LS_SESSION = 'venuely.demo.session';

const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const listeners = new Set();

export const auth = {
  user: null,
  ready: false,
  backend: FIREBASE_CONFIG ? 'firebase' : 'demo',
  fb: null,
  initError: '',

  /** Subscribe to sign-in changes. Called straight away once the first state is known. */
  onChange(fn) {
    listeners.add(fn);
    if (this.ready) fn(this.user);
    return () => listeners.delete(fn);
  },
  _set(user) {
    this.user = user;
    this.ready = true;
    for (const fn of listeners) fn(user);
  },

  init() {
    if (!this._init) this._init = Promise.resolve(this.backend === 'firebase' ? this._initFirebase() : this._initDemo());
    return this._init;
  },

  _initDemo() {
    const s = lsGet(LS_SESSION, null);
    const users = lsGet(LS_USERS, {});
    const u = s && users[s.email];
    this._set(u ? { uid: u.uid, email: s.email, name: u.name, photo: '' } : null);
  },

  async _initFirebase() {
    try {
      const [app, A, F] = await Promise.all([import(/* @vite-ignore */ FB + 'firebase-app.js'), import(/* @vite-ignore */ FB + 'firebase-auth.js'), import(/* @vite-ignore */ FB + 'firebase-firestore.js')]);
      const a = A.getAuth(app.initializeApp(FIREBASE_CONFIG));
      this.fb = { A, F, a, db: F.getFirestore(a.app) };
      await new Promise((resolve) => {
        let first = true;
        A.onAuthStateChanged(a, (u) => {
          this._set(u ? { uid: u.uid, email: u.email || '', name: u.displayName || (u.email || 'You').split('@')[0], photo: u.photoURL || '' } : null);
          if (first) { first = false; resolve(); }
        });
      });
    } catch (e) {
      console.error('Firebase failed to load', e);
      this.initError = 'Could not reach the sign-in service. Check your connection and try again.';
      this._set(null);
    }
  },

  // ---- actions ---------------------------------------------------------------
  async signInGoogle() {
    if (this.backend !== 'firebase') throw friendly({ code: 'demo/no-google' });
    if (!this.fb) throw new Error(this.initError || 'Sign-in is still loading. Try again in a moment.');
    try { await this.fb.A.signInWithPopup(this.fb.a, new this.fb.A.GoogleAuthProvider()); } catch (e) { throw friendly(e); }
  },

  async signUp(name, email, password) {
    email = email.trim().toLowerCase();
    if (this.backend === 'firebase') {
      if (!this.fb) throw new Error(this.initError || 'Sign-in is still loading.');
      try {
        const c = await this.fb.A.createUserWithEmailAndPassword(this.fb.a, email, password);
        if (name) await this.fb.A.updateProfile(c.user, { displayName: name });
        this._set({ uid: c.user.uid, email, name: name || email.split('@')[0], photo: '' });
      } catch (e) { throw friendly(e); }
      return;
    }
    const users = lsGet(LS_USERS, {});
    if (users[email]) throw friendly({ code: 'auth/email-already-in-use' });
    if (password.length < 6) throw friendly({ code: 'auth/weak-password' });
    const salt = uid() + uid();
    users[email] = { uid: 'demo-' + uid() + uid(), name: name || email.split('@')[0], salt, hash: await sha(salt + password) };
    lsSet(LS_USERS, users); lsSet(LS_SESSION, { email });
    this._set({ uid: users[email].uid, email, name: users[email].name, photo: '' });
  },

  async signIn(email, password) {
    email = email.trim().toLowerCase();
    if (this.backend === 'firebase') {
      if (!this.fb) throw new Error(this.initError || 'Sign-in is still loading.');
      try { await this.fb.A.signInWithEmailAndPassword(this.fb.a, email, password); } catch (e) { throw friendly(e); }
      return;
    }
    const u = lsGet(LS_USERS, {})[email];
    if (!u || (await sha(u.salt + password)) !== u.hash) throw friendly({ code: 'auth/invalid-credential' });
    lsSet(LS_SESSION, { email });
    this._set({ uid: u.uid, email, name: u.name, photo: '' });
  },

  async resetPassword(email) {
    email = email.trim().toLowerCase();
    if (!email) throw new Error('Type your email address first.');
    if (this.backend !== 'firebase') throw new Error('Password reset works once real sign-in is switched on (see README). In demo mode, create a new account.');
    try { await this.fb.A.sendPasswordResetEmail(this.fb.a, email); } catch (e) { throw friendly(e); }
  },

  async signOut() {
    if (this.backend === 'firebase' && this.fb) { await this.fb.A.signOut(this.fb.a); return; }
    try { localStorage.removeItem(LS_SESSION); } catch (e) { /* ignore */ }
    this._set(null);
  },
};

function friendly(e) {
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/popup-closed-by-user': '',
    'auth/cancelled-popup-request': '',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This site address is not authorised in Firebase yet (Authentication → Settings → Authorized domains).',
    'demo/no-google': 'Google sign-in needs the Firebase setup in README.md. Use email for now.',
  };
  const msg = map[e.code];
  return new Error(msg === undefined ? e.message || 'Something went wrong. Try again.' : msg);
}
