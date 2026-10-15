// Turn on real Google + email sign-in and cloud-saved projects.
//
// 1. Create a free project at https://console.firebase.google.com
// 2. Build → Authentication → Get started → enable "Google" and "Email/Password"
// 3. Build → Firestore Database → Create database, then paste the rules from README.md
// 4. Project settings → Your apps → Web app (</>) → copy the config object here:
//
//    export const FIREBASE_CONFIG = {
//      apiKey: '…', authDomain: '…firebaseapp.com', projectId: '…', appId: '…',
//    };
//
// While this is null the app runs in DEMO MODE: accounts and projects are kept in this
// browser only (fine for trying things out, not for real users).
export const FIREBASE_CONFIG = null;
