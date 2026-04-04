import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/** Google 登入 (僅負責身份驗證) */
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/** 登出 */
async function logout() {
  await signOut(auth);
  localStorage.removeItem("userRole");
  window.location.href = "/index.html";
}

/** 取得目前使用者的 ID Token */
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(true);
}

export { auth, db, signInWithGoogle, logout, getIdToken, onAuthStateChanged };
