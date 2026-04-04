import { db } from "./auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── 系統配置與版本官理 ──────────────────────────────────────

/** 更新全局版本號 */
export async function updateVersion(versionName) {
  try {
    await setDoc(doc(db, "configs", "current_status"), {
      current_version: versionName,
      updated_at: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (e) {
    console.error("updateVersion error:", e);
    return false;
  }
}

/** 獲取當前版本號 */
export async function fetchCurrentVersion() {
  try {
    const snap = await getDoc(doc(db, "configs", "current_status"));
    return snap.exists() ? (snap.data().current_version || "Season 41") : "Season 41";
  } catch (e) {
    console.warn("fetchCurrentVersion error:", e);
    return "Season 41";
  }
}

/** 數據遷移：將舊版本號統一更正為 Season 41 */
export async function migrateHistoricalData() {
  try {
    const colRef = collection(db, "match_records");
    const { query, where, getDocs, updateDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    
    // 找出所有 2024.12.30 和 unknown 的資料
    const snapshots = await Promise.all([
      getDocs(query(colRef, where("version", "==", "2024.12.30"))),
      getDocs(query(colRef, where("version", "==", "unknown")))
    ]);

    let count = 0;
    for (const snap of snapshots) {
      if (snap.empty) continue;
      const batch = snap.docs.map(d => updateDoc(fsDoc(db, "match_records", d.id), { version: "Season 41" }));
      await Promise.all(batch);
      count += snap.size;
    }
    return count;
  } catch (e) {
    console.error("Migration error:", e);
    throw e;
  }
}


// ── 使用者管理 ────────────────────────────────────────────

export async function fetchUsers() {
  try {
    console.log("Admin.js: Fetching users from Firestore...");
    const snap = await getDocs(collection(db, "users"));
    console.log(`Admin.js: Found ${snap.docs.length} user documents.`);
    // 關鍵修復：必須包含 d.id，否則 HTML 渲染時會找不到 ID
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Admin.js: fetchUsers error:", e);
    return [];
  }
}

export async function setUserRole(uid, role) {
  try {
    await updateDoc(doc(db, "users", uid), { role });
    return true;
  } catch (e) {
    console.error("setUserRole error:", e);
    return false;
  }
}

// ── 封鎖名單 ──────────────────────────────────────────────

export async function fetchBanlist() {
  try {
    const snap = await getDocs(collection(db, "banlist"));
    return snap.docs.map(d => ({id: d.id, ...d.data()}));
  } catch (e) {
    return [];
  }
}

// ── 戰績數據管理 ──────────────────────────────────────────

export async function fetchRecords(page = 1, mapName = "", hunterName = "") {
  try {
    const snap = await getDocs(collection(db, "match_records"));
    let records = snap.docs.map(d => ({id: d.id, ...d.data()}));
    
    // 簡易前端過濾
    if (mapName) records = records.filter(r => r.map_name === mapName);
    if (hunterName) records = records.filter(r => r.hunter_name === hunterName);
    
    // 簡易前端分頁 (10 per page)
    const start = (page - 1) * 10;
    const paginated = records.slice(start, start + 10);
    return { records: paginated, total: records.length };
  } catch (e) {
    console.error("fetchRecords error:", e);
    return { records: [], total: 0 };
  }
}

export async function deleteRecord(recordId) {
  try {
    await deleteDoc(doc(db, "match_records", recordId));
    return true;
  } catch (e) {
    console.error("deleteRecord error:", e);
    return false;
  }
}
