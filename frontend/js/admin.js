import { auth, db } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- 全域狀態 ---
let currentTab = "users";
let currentOffset = 0;
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

async function fetchRecordsAPI(offset = 0, map = "", hunter = "") {
  try {
    const url = new URL('/api/match', window.location.origin);
    url.searchParams.set("limit", 15);
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

function showSection(tabId) {
  currentTab = tabId;
  $(".admin-section").addClass("hidden");
  $(`#section-${tabId}`).removeClass("hidden");
  $(".menu-item").removeClass("bg-indigo-500/10 text-indigo-400 border-indigo-500").addClass("text-slate-400 border-transparent");
  $(`[data-tab="${tabId}"]`).addClass("bg-indigo-500/10 text-indigo-400 border-indigo-500").removeClass("text-slate-400 border-transparent");
  
  loadTabData(tabId);
}

async function loadTabData(tabId) {
  if (tabId === "users") renderUsers();
  if (tabId === "records") {
    currentOffset = 0;
    renderRecords();
  }
  if (tabId === "configs") renderConfigs();
}

async function renderUsers() {
  const $tbody = $("#users-list");
  $tbody.html('<tr><td colspan="4" class="p-8 text-center text-slate-500">載入中...</td></tr>');
  const users = await fetchUsers();
  $tbody.empty();
  
  users.forEach(u => {
    const row = `
      <tr class="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
        <td class="p-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">${(u.displayName || u.email || "?")[0].toUpperCase()}</div>
            <span class="font-medium text-slate-200">${u.displayName || "未設定名稱"}</span>
          </div>
        </td>
        <td class="p-4 text-slate-400 text-sm font-mono">${u.email || u.id}</td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded text-xs font-bold ${u.role === 'ADMIN' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}">${u.role || "USER"}</span>
        </td>
        <td class="p-4">
          <button class="change-role-btn text-xs text-indigo-400 hover:underline" data-id="${u.id}" data-role="${u.role || 'USER'}">切換權限</button>
        </td>
      </tr>
    `;
    $tbody.append(row);
  });
}

async function renderRecords(isNext = false) {
  if (isFetching) return;
  isFetching = true;
  
  const $tbody = $("#records-list");
  if (!isNext) {
    currentOffset = 0;
    $tbody.html('<tr><td colspan="6" class="p-8 text-center text-slate-500">載入中...</td></tr>');
  }

  const mapFilter = $("#filter-map").val();
  const data = await fetchRecordsAPI(currentOffset, mapFilter);
  
  if (!isNext) $tbody.empty();
  
  data.records.forEach(r => {
    let bans = [];
    try { bans = Array.isArray(r.ban_survivors) ? r.ban_survivors : JSON.parse(r.ban_survivors || "[]"); } catch(e) {}
    
    const row = `
      <tr class="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors text-sm">
        <td class="p-3 text-slate-400 font-mono">${r.reported_at ? r.reported_at.split('T')[0] : '---'}</td>
        <td class="p-3 text-slate-200">${r.map_name}</td>
        <td class="p-3 text-emerald-400">${bans.join(", ")}</td>
        <td class="p-3 text-amber-400">${r.hunter_name}</td>
        <td class="p-3"><span class="text-xs bg-slate-700 px-1.5 py-0.5 rounded">${r.version}</span></td>
        <td class="p-3">
          <button class="delete-record-btn text-red-500 hover:text-red-400" data-id="${r.id}"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
    $tbody.append(row);
  });

  $("#btn-next-records").toggleClass("hidden", !data.hasMore);
  isFetching = false;
}

async function renderConfigs() {
  const version = await fetchCurrentVersion();
  $("#input-current-version").val(version);
}

// --- 事件監聽 ---

function setupEventListeners() {
  // 側邊欄
  $(".menu-item").on("click", function() {
    showSection($(this).data("tab"));
  });

  // 戰績分頁與過濾
  $("#btn-next-records").on("click", function() {
    currentOffset += 15;
    renderRecords(true);
  });

  $("#filter-map").on("change", function() {
    currentOffset = 0;
    renderRecords();
  });

  // 刪除戰績
  $(document).on("click", ".delete-record-btn", async function() {
    const id = $(this).data("id");
    if (confirm("確定要刪除這筆戰績嗎？")) {
      if (await deleteRecordAPI(id)) {
        $(this).closest("tr").fadeOut();
      }
    }
  });

  // 更新版本
  $("#btn-save-version").on("click", async function() {
    const v = $("#input-current-version").val();
    if (await updateVersionAPI(v)) {
      alert("版本更新成功");
    }
  });

  // 切換權限 (Firestore)
  $(document).on("click", ".change-role-btn", async function() {
    const id = $(this).data("id");
    const currentRole = $(this).data("role");
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    if (confirm(`確定要將該用戶權限改為 ${newRole} 嗎？`)) {
      if (await updateUserRole(id, newRole)) {
        renderUsers();
      }
    }
  });
  
  // 登出
  $("#btn-sign-out").on("click", () => auth.signOut());
}

// --- 初始化 ---

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // 檢查管理員權限
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.data();
    
    if (userData && userData.role === "ADMIN") {
      $("#admin-name-display").text(user.displayName || user.email.split('@')[0]);
      $("#loading-overlay").fadeOut();
      setupEventListeners();
      showSection("users"); // 預設顯示使用者管理
    } else {
      window.location.href = "index.html"; // 非管理員踢回首頁
    }
  } else {
    window.location.href = "index.html"; // 未登入踢回首頁
  }
});
