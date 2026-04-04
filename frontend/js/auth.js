import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/** Google 登入，並直接與 Firestore 驗證 (純前端模式) */
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  
  // 檢查 Firestore 中是否已存在該使用者
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    console.log("New user detected, creating profile in Firestore...");
    const newUser = {
      id: user.uid,
      email: user.email,
      display_name: user.displayName,
      photo_url: user.photoURL,
      role: "user",
      created_at: new Date().toISOString()
    };
    await setDoc(userRef, newUser);
    localStorage.setItem("userRole", "user");
  } else {
    localStorage.setItem("userRole", userSnap.data().role || "user");
  }
  return user;
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
