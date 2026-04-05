import { db } from "./auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/** 取得當前版本 (遷移至 Cloudflare API) */
export async function fetchCurrentVersion() {
  try {
    const res = await fetch('/api/options');
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.version || "Season 41";
  } catch (e) { 
    console.warn("fetchCurrentVersion failed, using fallback.");
    return "Season 41"; 
  }
}

/** 更新目前版本 (遷移至 Cloudflare API) */
export async function updateVersion(newVersion) {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_version: newVersion })
    });
    if (!res.ok) throw new Error("Update Failed");
    return true;
  } catch (e) { 
    console.error("updateVersion error:", e); 
    return false; 
  }
}

/** 數據遷移：將舊版本號統一更正為 Season 41 (保留為 Firestore 維護工具) */
export async function migrateHistoricalData() {
  try {
    const colRef = collection(db, "match_records");
    const snapshots = await Promise.all([
      getDocs(query(colRef, where("version", "==", "2024.12.30"))),
      getDocs(query(colRef, where("version", "==", "unknown")))
    ]);
    
    let count = 0;
    for (const snap of snapshots) {
      if (snap.empty) continue;
      for (const d of snap.docs) {
        await updateDoc(doc(db, "match_records", d.id), { version: "Season 41" });
        count++;
      }
    }
    return count;
  } catch (e) { 
    console.error("Migration error:", e); 
    return 0; 
  }
}

// ── 使用者管理 (保留在 Firestore) ────────────────────────────

export async function fetchUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({id: d.id, ...d.data()}));
  } catch (e) { 
    console.error("fetchUsers error:", e); 
    return []; 
  }
}

export async function updateUserRole(userId, newRole) {
  try {
    await updateDoc(doc(db, "users", userId), { role: newRole });
    return true;
  } catch (e) { 
    console.error("updateUserRole error:", e); 
    return false; 
  }
}

// ── 戰績數據管理 (遷移至 Cloudflare D1 API) ──────────────────────────

let currentOffset = 0;

export async function fetchRecords(isNext = false, mapName = "", hunterName = "") {
  try {
    if (!isNext) {
      currentOffset = 0;
    } else {
      currentOffset += 15;
    }

    const url = new URL('/api/match', window.location.origin);
    url.searchParams.set("limit", 15);
    url.searchParams.set("offset", currentOffset);
    if (mapName) url.searchParams.set("map", mapName);
    if (hunterName) url.searchParams.set("hunter", hunterName);

    console.log(`[API] 正在從 D1 讀取戰績... (Offset: ${currentOffset})`);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch Records API Failed");
    
    const data = await res.json();
    return { 
      records: data.records || [], 
      hasMore: data.hasMore || false 
    };
  } catch (e) {
    console.error("fetchRecords error:", e);
    return { records: [], hasMore: false };
  }
}

/** 刪除戰績 (遷移至 Cloudflare API) */
export async function deleteRecord(id) {
  try {
    const res = await fetch(`/api/match?id=${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error("Delete Request Failed");
    return true;
  } catch (e) {
    console.error("deleteRecord error:", e);
    return false;
  }
}
