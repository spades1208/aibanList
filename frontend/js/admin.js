import { db } from "./auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, limit, startAfter, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// ── 戰績數據管理 (優化版：伺服器端分頁) ──────────────────────────

let lastRecordDoc = null; // 用於追蹤分頁游標

export async function fetchRecords(isNext = false, mapName = "", hunterName = "") {
  try {
    const colRef = collection(db, "match_records");
    let q;

    // 建立基礎查詢 (按時間倒序)
    const constraints = [orderBy("reported_at", "desc")];
    
    // 如果有過濾條件，Firestore 要求必須先對過濾欄位進行 orderBy (或建立複合索引)
    // 為了簡單起見，我們先支援基礎 orderBy + limit
    if (mapName) constraints.push(where("map_name", "==", mapName));
    if (hunterName) constraints.push(where("hunter_name", "==", hunterName));
    
    constraints.push(limit(15));

    // 如果是載入下一頁且有游標
    if (isNext && lastRecordDoc) {
      constraints.push(startAfter(lastRecordDoc));
    } else {
      // 否則視為重置查詢 (比如換地圖或換監管者)
      lastRecordDoc = null;
    }

    q = query(colRef, ...constraints);
    
    console.log(`[Cloud] 正在從雲端讀取 15 筆分頁數據... (Next: ${isNext})`);
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      lastRecordDoc = snap.docs[snap.docs.length - 1];
    }

    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    return { records, hasMore: records.length === 15 };
  } catch (e) {
    console.error("fetchRecords error:", e);
    return { records: [], hasMore: false };
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
