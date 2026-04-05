import { auth, db } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- 全域狀態 ---
let currentPage = 1;
let isFetching = false;

// --- API 函數 (D1 / Config) ---

async function fetchCurrentVersion() {
  try {
    const res = await fetch('/api/options');
    const data = await res.json();
    return data.version || "Season 41";
  } catch (e) { return "Season 41"; }
}

async function updateVersionAPI(newVersion) {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_version: newVersion })
    });
    return res.ok;
  } catch (e) { return false; }
}

async function fetchRecordsAPI(page = 1, map = "", hunter = "") {
  try {
    const limit = 15;
    const offset = (page - 1) * limit;
    const url = new URL('/api/match', window.location.origin);
    url.searchParams.set("limit", limit);
    url.searchParams.set("offset", offset);
    if (map) url.searchParams.set("map", map);
    if (hunter) url.searchParams.set("hunter", hunter);

    const res = await fetch(url);
    return await res.json();
  } catch (e) { return { records: [], hasMore: false }; }
}

async function deleteRecordAPI(id) {
  try {
    const res = await fetch(`/api/match?id=${id}`, { method: 'DELETE' });
    return res.ok;
  } catch (e) { return false; }
}

// --- Firestore 函數 (Users) ---

async function fetchUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { return []; }
}

async function updateUserRole(userId, newRole) {
  try {
    await updateDoc(doc(db, "users", userId), { role: newRole });
    return true;
  } catch (e) { return false; }
}

// --- UI 渲染邏輯 ---

function showPanel(panelId) {
  $("section").addClass("hidden");
  $(`#panel-${panelId}`).removeClass("hidden");
  
  $(".sidebar-item").removeClass("active bg-white/10 text-white").addClass("text-slate-400");
  $(`#nav-${panelId}`).addClass("active bg-white/10 text-white").removeClass("text-slate-400");
  
  loadPanelData(panelId);
}

async function loadPanelData(panelId) {
  if (panelId === "users") renderUsers();
  if (panelId === "records") {
    currentPage = 1;
    await loadFilters();
    renderRecords();
  }
  if (panelId === "config") renderConfigs();
}

async function loadFilters() {
  try {
    const res = await fetch('/api/options');
    const data = await res.json();
    
    const $mapSelect = $("#filter-map");
    const $hunterSelect = $("#filter-hunter");
    
    if ($mapSelect.children().length <= 1) {
      $mapSelect.html('<option value="">所有地圖</option>');
      data.maps.forEach(m => $mapSelect.append(`<option value="${m}">${m}</option>`));
    }
    
    if ($hunterSelect.children().length <= 1) {
      $hunterSelect.html('<option value="">所有監管者</option>');
      data.hunters.forEach(h => $hunterSelect.append(`<option value="${h}">${h}</option>`));
    }
  } catch (e) {}
}

async function renderUsers() {
  const $tbody = $("#users-tbody");
  $tbody.html('<tr><td colspan="4" class="p-8 text-center text-slate-500 italic">載入資料中...</td></tr>');
  const users = await fetchUsers();
  $tbody.empty();
  
  users.forEach(u => {
    const initial = (u.displayName || u.email || "?")[0].toUpperCase();
    const row = `
      <tr class="hover:bg-white/[0.02] transition-colors">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">${initial}</div>
            <span class="font-bold text-white">${u.displayName || "Anonymous"}</span>
          </div>
        </td>
        <td class="px-6 py-4 text-slate-500 font-mono text-xs">${u.email || u.id}</td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${u.role === 'ADMIN' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}">${u.role || "USER"}</span>
        </td>
        <td class="px-6 py-4">
          <button class="change-role-btn text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest transition-colors" data-id="${u.id}" data-role="${u.role || 'USER'}">Toggle Role</button>
        </td>
      </tr>
    `;
    $tbody.append(row);
  });
}

async function renderRecords() {
  if (isFetching) return;
  isFetching = true;
  
  const $tbody = $("#records-tbody");
  $tbody.html('<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">正在從雲端數據庫檢索中...</td></tr>');

  const mapFilter = $("#filter-map").val();
  const hunterFilter = $("#filter-hunter").val();
  const data = await fetchRecordsAPI(currentPage, mapFilter, hunterFilter);
  
  $tbody.empty();
  
  if (data.records.length === 0) {
    $tbody.html('<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">查無符合條件的數據</td></tr>');
  } else {
    data.records.forEach(r => {
      let bans = [];
      try { bans = Array.isArray(r.ban_survivors) ? r.ban_survivors : JSON.parse(r.ban_survivors || "[]"); } catch(e) {}
      
      const row = `
        <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5">
          <td class="px-6 py-4 text-white font-medium">${r.map_name}</td>
          <td class="px-6 py-4">
            <div class="flex flex-wrap gap-1">
              ${bans.map(b => `<span class="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold">${b}</span>`).join('')}
            </div>
          </td>
          <td class="px-6 py-4 text-amber-400 font-bold">${r.hunter_name}</td>
          <td class="px-6 py-4 text-slate-400 text-xs">${r.badge_level || 'C'}</td>
          <td class="px-6 py-4"><span class="bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">${r.version}</span></td>
          <td class="px-6 py-4">
            <button class="delete-record-btn p-2 text-slate-500 hover:text-red-500 transition-colors" data-id="${r.id}">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </td>
        </tr>
      `;
      $tbody.append(row);
    });
  }

  $("#page-info").text(`Page ${currentPage}`);
  $("#btn-prev-page").prop("disabled", currentPage === 1);
  $("#btn-next-page").prop("disabled", !data.hasMore);
  isFetching = false;
}

async function renderConfigs() {
  const version = await fetchCurrentVersion();
  $("#input-version").val(version);
}

// --- 事件監聽 ---

function setupEventListeners() {
  // 側邊欄切換
  $(".sidebar-item").on("click", function() {
    const id = $(this).attr("id").replace("nav-", "");
    showPanel(id);
  });

  // 戰績篩選
  $("#filter-map, #filter-hunter").on("change", () => {
    currentPage = 1;
    renderRecords();
  });

  // 分頁
  $("#btn-prev-page").on("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderRecords();
    }
  });

  $("#btn-next-page").on("click", () => {
    currentPage++;
    renderRecords();
  });

  // 儲存版本
  $("#btn-save-version").on("click", async function() {
    const $btn = $(this);
    const v = $("#input-version").val();
    $btn.prop("disabled", true).text("更新中...");
    
    if (await updateVersionAPI(v)) {
      alert("全域版本號已成功更新至：" + v);
    } else {
      alert("更新失敗，請檢查權限或網絡狀態。");
    }
    $btn.prop("disabled", false).text("更新部署版本");
  });

  // 修復數據 (Firestore 維護工具)
  $("#btn-fix-data").on("click", async function() {
    if (!confirm("這將會掃描所有舊版戰績並將其標記為目前的 Season 41。確定執行？")) return;
    const $btn = $(this);
    $btn.prop("disabled", true).text("掃描修復中...");
    
    try {
      const colRef = collection(db, "match_records");
      const snapshots = await Promise.all([
        getDocs(query(colRef, where("version", "==", "2024.12.30"))),
        getDocs(query(colRef, where("version", "==", "unknown")))
      ]);
      let count = 0;
      for (const snap of snapshots) {
        for (const d of snap.docs) {
          await updateDoc(doc(db, "match_records", d.id), { version: "Season 41" });
          count++;
        }
      }
      alert(`完成！已修復 ${count} 筆數據。`);
    } catch (e) { alert("執行過程中出錯。"); }
    $btn.prop("disabled", false).text("修復歷史版本數據");
  });

  // 刪除戰績 (D1 API)
  $(document).on("click", ".delete-record-btn", async function() {
    const id = $(this).data("id");
    if (!confirm("確定要永久刪除這筆雲端戰績嗎？此操作無法撤銷。")) return;
    
    const $row = $(this).closest("tr");
    if (await deleteRecordAPI(id)) {
      $row.addClass("opacity-30 pointer-events-none");
      $row.fadeOut(300, () => $row.remove());
    } else {
      alert("刪除失敗。");
    }
  });

  // 切換權限 (Firestore)
  $(document).on("click", ".change-role-btn", async function() {
    const id = $(this).data("id");
    const currentRole = $(this).data("role");
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    if (confirm(`確定要變更權限為 ${newRole} 嗎？`)) {
      if (await updateUserRole(id, newRole)) {
        renderUsers();
      }
    }
  });

  $("#btn-logout").on("click", () => auth.signOut());
}

// --- 權限哨兵與啟動 ---

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      
      if (userData && userData.role === "ADMIN") {
        $("#user-name").text(user.displayName || user.email.split('@')[0]);
        if (user.photoURL) $("#user-avatar").attr("src", user.photoURL);
        
        setupEventListeners();
        showPanel("users"); // 預設進場分頁
        
        // 隱藏加載層 (如果有)
        $("#admin-loading")?.fadeOut();
      } else {
        window.location.href = "../index.html";
      }
    } catch (e) {
      console.error("Admin Auth Error:", e);
      window.location.href = "../index.html";
    }
  } else {
    window.location.href = "../index.html";
  }
});
