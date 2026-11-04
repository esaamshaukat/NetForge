// Firebase sign-in (Email/Password only) and the key fetch from Firestore.
// Uses the browser (CDN) modular SDK - no bundler.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, runTransaction }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCQvvWNIVFALaUlYcjk_ZNJ9QygDK9AD3I",
  authDomain: "encor-study.firebaseapp.com",
  projectId: "encor-study",
  storageBucket: "encor-study.firebasestorage.app",
  messagingSenderId: "668072896678",
  appId: "1:668072896678:web:77da00720e2a9dfb3fac67"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { doc, getDoc, setDoc, runTransaction };

export const onUser = cb => onAuthStateChanged(auth, cb);
export const login = (email, pw) => signInWithEmailAndPassword(auth, email.trim(), pw);
export const resetPassword = email => sendPasswordResetEmail(auth, email.trim());
export const logout = () => signOut(auth);

// The encryption key lives at config/bank, field "key" (base64). Only allowed users can read it.
export async function fetchKey() {
  const s = await getDoc(doc(db, 'config', 'bank'));
  if (!s.exists() || !s.data().key) { const e = new Error('The key document config/bank is missing in Firestore.'); e.code = 'app/no-key'; throw e; }
  return s.data().key;
}

export function friendly(e) {
  const c = (e && e.code) || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return 'That email or password is not right.';
  if (c === 'auth/invalid-email') return 'That does not look like an email address.';
  if (c === 'auth/missing-password') return 'Please type your password.';
  if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes, or use "Forgot password".';
  if (c === 'auth/user-disabled') return 'This account has been switched off.';
  if (c === 'auth/network-request-failed') return 'No internet connection. You need to be online to sign in the first time.';
  if (c === 'permission-denied' || c === 'firestore/permission-denied') return 'This account is not on the allowed list.';
  if (c === 'app/no-key') return e.message;
  return (e && e.message) || 'Something went wrong.';
}
