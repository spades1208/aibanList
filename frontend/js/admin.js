import { auth, getIdToken } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// --- API Helper ---
const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : ""; 

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...options.headers
  };
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(errorBody.detail || "API Request Failed");
  }
  return res.json();
}

// --- 全域狀態 ---
let currentPage = 1;
let isFetching = false;

// --- API 函數 (D1 / Config) ---

async function fetchCurrentVersion() {
  try {
    const data = await apiFetch('/options');
    // 從 config 取得 current_version 或回傳預設
    return data.current_version || "Season 41";
  } catch (e) { return "Season 41"; }
}

async function updateVersionAPI(newVersion) {
  try {
    await apiFetch('/admin/update_version', {
      method: 'POST',
      body: JSON.stringify({ new_version: newVersion })
    });
    return true;
  } catch (e) { return false; }
}

async function fetchRecordsAPI(page = 1, map_name = "", hunter_name = "") {
  try {
    const page_size = 15;
    let url = `/admin/records?page=${page}&page_size=${page_size}`;
    if (map_name) url += `&map_name=${encodeURIComponent(map_name)}`;
    if (hunter_name) url += `&hunter_name=${encodeURIComponent(hunter_name)}`;

    return await apiFetch(url);
  } catch (e) { return { records: [], total_count: 0 }; }
}

async function deleteRecordAPI(id) {
  try {
    await apiFetch(`/admin/records/${id}`, { method: 'DELETE' });
    return true;
  } catch (e) { return false; }
}

// --- Firestore 函數 (Users) ---

async function fetchUsers() {
  try {
    return await apiFetch('/admin/users');
  } catch (e) { return []; }
}

async function updateUserRole(userId, newRole) {
  try {
    await apiFetch(`/admin/users/${userId}/role?role=${newRole}`, { method: 'PATCH' });
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
  if (panelId === "banlist") renderBanlist();
}

async function loadFilters() {
  try {
    const data = await apiFetch('/options');
    
    const $mapSelect = $("#filter-map");
    const $hunterSelect = $("#filter-hunter");
    
    if ($mapSelect.children().length <= 1) {
      $mapSelect.html('<option value="">所有地圖</option>');
      // maps 可能是字串清單或物件清單，相容處理
      data.maps.forEach(m => {
        const name = typeof m === 'string' ? m : m.name;
        $mapSelect.append(`<option value="${name}">${name}</option>`);
      });
    }
    
    if ($hunterSelect.children().length <= 1) {
      $hunterSelect.html('<option value="">所有監管者</option>');
      data.hunters.forEach(h => {
        const name = typeof h === 'string' ? h : h.name;
        $hunterSelect.append(`<option value="${name}">${name}</option>`);
      });
    }
  } catch (e) { console.error("Load Filters Error:", e); }
}

async function renderUsers() {
  const $tbody = $("#users-tbody");
  $tbody.html('<tr><td colspan="4" class="p-8 text-center text-slate-500 italic">載入資料中...</td></tr>');
  const users = await fetchUsers();
  $tbody.empty();
  
  users.forEach(u => {
    const initial = (u.display_name || u.email || "?")[0].toUpperCase();
    const row = `
      <tr class="hover:bg-white/[0.02] transition-colors">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
               ${u.photo_url ? `<img src="${u.photo_url}" class="w-full h-full rounded-full" />` : initial}
            </div>
            <span class="font-bold text-white">${u.display_name || "Anonymous"}</span>
          </div>
        </td>
        <td class="px-6 py-4 text-slate-500 font-mono text-xs">${u.email || u.id}</td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${u.role?.toLowerCase() === 'admin' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}">${u.role || "USER"}</span>
        </td>
        <td class="px-6 py-4">
          <button class="change-role-btn text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest transition-colors" data-id="${u.id}" data-role="${u.role || 'user'}">Toggle Role</button>
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
      const dateStr = r.reported_at ? new Date(r.reported_at).toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).replace(/\//g, '-') : "N/A";

      $tbody.append(`
        <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/[0.05]">
          <td class="px-6 py-4 text-white font-medium">${r.map_name}</td>
          <td class="px-6 py-4 flex flex-wrap gap-1">
            ${r.ban_survivors.map(s => `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">${s}</span>`).join('')}
          </td>
          <td class="px-6 py-4 text-indigo-400 font-bold">${r.hunter_name}</td>
          <td class="px-6 py-4 text-slate-500 text-xs">${r.added_by_name || "系統預設"}</td>
          <td class="px-6 py-4 text-slate-500 text-[10px] font-mono">${dateStr}</td>
          <td class="px-6 py-4 text-right">
            <button class="delete-record-btn text-red-500/50 hover:text-red-500 transition-colors" data-id="${r.id}">
              <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </td>
        </tr>
      `);
    });
  }

  $("#page-info").text(`Page ${currentPage}`);
  $("#btn-prev-page").prop("disabled", currentPage === 1);
  const total_pages = Math.ceil(data.total_count / 15);
  $("#btn-next-page").prop("disabled", currentPage >= total_pages);
  isFetching = false;
}

async function renderConfigs() {
  const version = await fetchCurrentVersion();
  $("#input-version").val(version);
}

async function renderBanlist() {
  const $tbody = $("#banlist-tbody");
  $tbody.html('<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">載入資料中...</td></tr>');
  try {
    const list = await apiFetch('/admin/banlist');
    $tbody.empty();
    if (list.length === 0) {
      $tbody.html('<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">目前無封鎖記錄</td></tr>');
    } else {
      list.forEach(b => {
        const dateStr = b.banned_at ? new Date(b.banned_at).toLocaleString('zh-TW', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/\//g, '-') : "N/A";

        const row = `
          <tr class="hover:bg-white/[0.02] transition-colors">
            <td class="px-6 py-4 font-mono text-xs text-slate-400">${b.user_id}</td>
            <td class="px-6 py-4 text-white">${b.reason || "無理由"}</td>
            <td class="px-6 py-4 text-slate-500 text-[10px]">${dateStr}</td>
            <td class="px-6 py-4">
              <span class="px-2 py-1 rounded text-[10px] font-black uppercase ${b.is_active ? 'bg-red-500/10 text-red-400' : 'bg-slate-800 text-slate-500'}">${b.is_active ? 'Active' : 'Lifted'}</span>
            </td>
            <td class="px-6 py-4">
              <button class="unban-btn text-indigo-400 hover:text-white text-[10px] font-black uppercase" data-id="${b.id}">Toggle</button>
            </td>
          </tr>
        `;
        $tbody.append(row);
      });
    }
  } catch (e) { $tbody.html('<tr><td colspan="5" class="p-8 text-center text-red-400 italic">載入失敗</td></tr>'); }
}

// --- UI 切換與數據載入整合 ---
function showPanel(id) {
  // 1. 切換面板顯示
  $("section[id^='panel-']").addClass("hidden");
  $(`#panel-${id}`).removeClass("hidden");
  
  // 2. 切換導航連動狀態
  $(".sidebar-item").removeClass("active");
  $(`#nav-${id}`).addClass("active");
  
  console.log(`[Admin] Switching to Panel: ${id}`);
  
  // 3. 根據面板 ID 主動刷新數據
  if (id === 'users') renderUsers();
  if (id === 'config') loadFilters();
  if (id === 'banlist') renderBanlist();
  if (id === 'records') renderRecords();
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

  // 修復數據按鈕已停用 (遷移至 D1 完成)
  $("#btn-fix-data").on("click", function() {
    alert("此功能已隨 Firestore 遷移而停用。請使用後端數據腳本進行數據維護。");
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
    const currentRole = $(this).data("role")?.toLowerCase();
    const newRole = currentRole === "admin" ? "user" : "admin";
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
      // 改向後端驗證權限，並同步 D1 使用者資料
      const idToken = await user.getIdToken(true);
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken })
      });
      
      if (!res.ok) throw new Error("Auth failed");
      const userData = await res.json();
      
      if (userData && userData.role.toLowerCase() === "admin") {
        $("#user-name").text(userData.display_name || userData.email.split('@')[0]);
        if (userData.photo_url) $("#user-avatar").attr("src", userData.photo_url);
        
        setupEventListeners();
        showPanel("users"); // 改為預設顯示使用者頁面
        
        // 隱藏加載層
        $("#admin-loading")?.fadeOut();
      } else {
        alert("權限不足，將返回首頁。");
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
