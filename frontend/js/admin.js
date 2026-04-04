import { db } from "./auth.js";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── 使用者管理 ────────────────────────────────────────────

export async function fetchUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.error("fetchUsers error:", e);
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
