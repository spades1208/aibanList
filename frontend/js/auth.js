import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/** Google Login */
async function signInWithGoogle() {
  console.log("[Auth] Starting signInWithPopup");
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/** Logout */
async function logout() {
  await signOut(auth);
  window.location.href = "/index.html";
}

/** Get ID Token */
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(true);
}

export { auth, db, signInWithGoogle, logout, getIdToken, onAuthStateChanged };
