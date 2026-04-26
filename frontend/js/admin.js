import { auth, getIdToken } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? `http://localhost:8000`
  : "/api"; 

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...options.headers
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "Unknown error");
    throw new Error(`[HTTP ${res.status}] ${res.statusText}: ${errorBody}`);
  }
  return res.json();
}

let currentPage = 1;
let isFetching = false;

async function fetchCurrentVersion() {
  try {
    const data = await apiFetch('/options');
    return data.current_version || "Season 41";
  } catch (e) { return "Season 41"; }
}

async function updateVersionAPI(newVersion) {
  try {
    await apiFetch('/admin/update_version', { method: 'POST', body: JSON.stringify({ new_version: newVersion }) });
    return true;
  } catch (e) { return false; }
}

async function fixRecordsAPI() {
  try {
    return await apiFetch('/admin/fix_records', { method: 'POST' });
  } catch (e) { 
    console.error("fixRecordsAPI failed:", e);
    return { success: false, error: e.message }; 
  }
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

async function verifyRecordAPI(id) {
  try {
    return await apiFetch(`/admin/records/${id}/verify`, { method: 'PATCH' });
  } catch (e) { return false; }
}

async function flagRecordAPI(id) {
  try {
    return await apiFetch(`/admin/records/${id}/flag`, { method: 'POST' });
  } catch (e) { return false; }
}

async function batchVerifyAPI(ids) {
  try {
    return await apiFetch('/admin/records/batch_verify', { method: 'POST', body: JSON.stringify({ record_ids: ids }) });
  } catch (e) { return false; }
}

async function restoreReputationAPI(uid) {
  try {
    return await apiFetch(`/admin/users/${uid}/restore_reputation`, { method: 'POST' });
  } catch (e) { return false; }
}

async function fetchUsers(page = 1, isBlacklisted = null) {
  try {
    let url = `/admin/users?page=${page}&page_size=20`;
    if (isBlacklisted !== null) url += `&is_blacklisted=${isBlacklisted ? 1 : 0}`;
    return await apiFetch(url);
  } catch (e) { 
    console.error("fetchUsers failed:", e);
    return { users: [], total_count: 0 }; 
  }
}

async function updateUserRole(userId, newRole) {
  try {
    await apiFetch(`/admin/users?uid=${userId}&role=${newRole}`, { method: 'PATCH' });
    return true;
  } catch (e) { 
    console.error("updateUserRole failed:", e);
    return false; 
  }
}

async function updateUserBlacklistAPI(userId, isBlacklisted) {
  try {
    await apiFetch(`/admin/users/blacklist?uid=${userId}&is_blacklisted=${isBlacklisted}`, { method: 'PATCH' });
    return true;
  } catch (e) { 
    console.error("updateUserBlacklistAPI failed:", e);
    return false; 
  }
}

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
    const $m = $("#filter-map"); const $h = $("#filter-hunter");
    if ($m.children().length <= 1) {
      $m.html('<option value="">所有地圖</option>');
      data.maps.forEach(n => $m.append(new Option(n, n)));
    }
    if ($h.children().length <= 1) {
      $h.html('<option value="">所有監管者</option>');
      data.hunters.forEach(i => $h.append(new Option(i.name, i.name)));
    }
  } catch (e) { console.error(e); }
}

let userPage = 1;
async function renderUsers() {
  const data = await fetchUsers(userPage);
  // 相容性處理：如果回傳的是陣列(舊版)，直接使用；如果是物件(新版)，取其 users 屬性
  const users = Array.isArray(data) ? data : (data.users || []);
  const totalCount = Array.isArray(data) ? data.length : (data.total_count || 0);
  
  const $t = $("#users-tbody").empty();
  users.forEach(u => {
    const statusLabel = u.is_blacklisted 
      ? `<span class="px-2 py-0.5 rounded text-[9px] bg-red-500/10 text-red-500 border border-red-500/20">隱蔽封鎖中</span>`
      : `<span class="px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">正常運作</span>`;

    const repColor = u.reputation < 60 ? 'text-red-500' : 'text-emerald-500';
    const restoreBtn = (u.reputation < 100) 
      ? `<button class="restore-rep-btn text-amber-500 text-[10px] font-bold hover:underline" data-uid="${u.id}">審核恢復</button>` 
      : '';

    $t.append(`
      <tr class="hover:bg-white/[0.02] border-b border-white/5 transition-colors text-xs">
        <td class="px-6 py-4 text-white">${u.display_name || "N/A"}<div class="text-[9px] text-slate-600 font-mono mt-1">${u.id}</div></td>
        <td class="px-6 py-4 text-slate-500">${u.email}</td>
        <td class="px-6 py-4">${statusLabel}</td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold ${repColor}">${u.reputation || 100}</span>
            ${restoreBtn}
          </div>
        </td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-800 text-indigo-400">
            ${u.role}
          </span>
        </td>
        <td class="px-6 py-4 flex gap-4">
          <button class="change-role-btn text-indigo-400 text-xs font-bold hover:text-indigo-300" data-id="${u.id}" data-role="${String(u.role).toLowerCase()}">權限</button>
          <button class="toggle-blacklist-btn ${u.is_blacklisted ? 'text-emerald-400' : 'text-red-400'} text-xs font-bold hover:opacity-80" data-id="${u.id}" data-status="${u.is_blacklisted}">
            ${u.is_blacklisted ? '解除封鎖' : '影子封鎖'}
          </button>
        </td>
      </tr>
    `);
  });

  // 更新分頁資訊 (如果總數為 0 則隱藏分頁)
  const total_pages = Math.ceil(totalCount / 20);
  if (totalCount <= 20 && userPage === 1) {
    $("#users-pagination").hide();
  } else {
    $("#users-pagination").show();
    $("#user-page-info").text(`第 ${userPage} 頁 / 共 ${total_pages} 頁`);
    $("#btn-user-prev").prop("disabled", userPage === 1);
    $("#btn-user-next").prop("disabled", userPage >= total_pages || total_pages === 0);
  }
}

async function renderBanlist() {
  // 只請求黑名單用戶，這裡暫不實作黑名單頁面的分頁(通常人數較少)
  const data = await fetchUsers(1, true); 
  const blacklisted = data.users || [];
  const $t = $("#banlist-tbody").empty();
  
  if (blacklisted.length === 0) {
    $t.append('<tr><td colspan="3" class="p-8 text-center text-slate-600 italic">目前沒有用戶在影子黑名單中。</td></tr>');
    return;
  }

  blacklisted.forEach(u => {
    $t.append(`
      <tr class="hover:bg-white/[0.02] border-b border-white/5 transition-colors text-xs">
        <td class="px-6 py-4 text-white">${u.display_name || "N/A"}<div class="text-[9px] text-slate-600 font-mono mt-1">${u.id}</div></td>
        <td class="px-6 py-4 text-slate-500">${u.email}</td>
        <td class="px-6 py-4">
          <button class="toggle-blacklist-btn text-emerald-400 text-xs font-bold hover:text-emerald-300" data-id="${u.id}" data-status="1">
            從名單中移除
          </button>
        </td>
      </tr>
    `);
  });
}

async function renderRecords() {
  if (isFetching) return;
  isFetching = true;
  
  // 重置批量勾選狀態
  $("#check-all-records").prop("checked", false);
  updateBatchButton();

  const mapFilter = $("#filter-map").val();
  const hunterFilter = $("#filter-hunter").val();
  const data = await fetchRecordsAPI(currentPage, mapFilter, hunterFilter);
  const $t = $("#records-tbody").empty();
  
  if (data.records.length === 0) {
    $t.append('<tr><td colspan="6" class="p-8 text-center text-slate-600 italic">找不到相關戰績數據。</td></tr>');
  } else {
    data.records.forEach(r => {
      const bans = (r.ban_survivors || []).map(s => `<span class="bg-slate-800 px-1 rounded text-[9px] mr-1">${s}</span>`).join('');
      
      let dateStr = "N/A";
      if (r.reported_at) {
        const d = new Date(r.reported_at + (r.reported_at.endsWith('Z') ? '' : 'Z'));
        const pad = (n) => n.toString().padStart(2, '0');
        dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      
      const contributor = r.is_blacklisted 
        ? `<span class="text-red-500 font-bold decoration-wavy underline decoration-red-900/50" title="數據已失效">${r.added_by_name || "System"}</span> <span class="text-[8px] bg-red-950/30 text-red-500 px-1 rounded ml-1">無效</span>`
        : `<span class="text-slate-200 font-medium">${r.added_by_name || "System"}</span>`;
      
      const repTag = r.reputation < 60 ? '<span class="text-red-500 font-black ml-1">⚠️</span>' : '';
      
      const badgeIcon = (r.badge_level && r.badge_level !== 'unknown')
        ? `<img src="/static/images/badges/${r.badge_level}.png" class="w-4 h-4 inline-block ml-1" title="${r.badge_level}級勳章">`
        : '';

      const verifyStatus = r.is_verified 
        ? `<span class="text-emerald-400 font-black flex items-center gap-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>已驗證</span>`
        : `<span class="text-orange-500/50 font-bold italic">待核實</span>`;

      $t.append(`
        <tr class="hover:bg-white/[0.02] border-b border-white/5 transition-colors text-xs ${r.is_blacklisted ? 'opacity-40 grayscale-[0.5]' : ''}">
          <td class="px-6 py-4">
            <input type="checkbox" class="record-checkbox w-4 h-4 rounded border-white/10 bg-slate-800 accent-indigo-600" data-id="${r.id}" />
          </td>
          <td class="px-6 py-4 text-white">${r.map_name}</td>
          <td class="px-6 py-4">${bans}</td>
          <td class="px-6 py-4 text-indigo-400 font-bold flex items-center gap-1">${r.hunter_name} ${badgeIcon}</td>
          <td class="px-6 py-4">${contributor} <span class="text-[9px] text-slate-600">(${r.reputation || 100})${repTag}</span></td>
          <td class="px-6 py-4 text-[10px] font-mono text-slate-600">${dateStr}</td>
          <td class="px-6 py-4">${verifyStatus}</td>
          <td class="px-6 py-4 flex gap-3 justify-end items-center">
            <button class="verify-record-btn text-emerald-500/70 hover:text-emerald-400 font-black" data-id="${r.id}">
              ${r.is_verified ? '撤銷' : '驗證'}
            </button>
            <button class="flag-record-btn text-orange-500/70 hover:text-orange-500 font-black" data-id="${r.id}" title="標記惡意數據並扣除信譽">
              舉報
            </button>
            <button class="delete-record-btn text-red-500/30 hover:text-red-500" data-id="${r.id}">
              刪除
            </button>
          </td>
        </tr>
      `);
    });
  }
  
  $("#page-info").text(`第 ${currentPage} 頁`);
  $("#btn-prev-page").prop("disabled", currentPage === 1);
  const total_pages = Math.ceil(data.total_count / 15);
  $("#btn-next-page").prop("disabled", currentPage >= total_pages);
  isFetching = false;
}

async function renderConfigs() {
  const version = await fetchCurrentVersion();
  $("#input-version").val(version);
  $("#btn-fix-data").text(`修復版本數據 (將所有數據轉為 ${version})`);
}

function setupEventListeners() {
  $(".sidebar-item").on("click", function() {
    showPanel($(this).attr("id").replace("nav-", ""));
  });
  
  $("#filter-map, #filter-hunter").on("change", () => {
    currentPage = 1;
    renderRecords();
  });
  
  $("#btn-prev-page").on("click", () => { if (currentPage > 1) { currentPage--; renderRecords(); } });
  $("#btn-next-page").on("click", () => { currentPage++; renderRecords(); });

  $("#btn-user-prev").on("click", () => { if (userPage > 1) { userPage--; renderUsers(); } });
  $("#btn-user-next").on("click", () => { userPage++; renderUsers(); });

  $("#btn-logout").on("click", () => auth.signOut());
  
  $("#btn-save-version").on("click", async function() {
    const v = $("#input-version").val();
    if (await updateVersionAPI(v)) {
      alert("版本號已成功更新至：" + v);
      renderConfigs(); // 同步更新修復按鈕文字
    } else {
      alert("版本更新失敗。");
    }
  });

  $("#btn-fix-data").on("click", async function() {
    const version = $("#input-version").val();
    if (confirm(`⚠️ 危險操作確認\n\n確定要將數據庫中「所有」舊版本的戰績記錄，一次性轉為當前版本「${version}」嗎？\n\n此操作不可逆，請確認版本號是否正確。`)) {
      const $btn = $(this);
      const originalText = $btn.text();
      $btn.prop("disabled", true).text("處理中...");
      
      const result = await fixRecordsAPI();
      if (result.success) {
        alert(result.message || "數據修復完成！");
      } else {
        alert("修復失敗：" + (result.error || "未知錯誤"));
      }
      
      $btn.prop("disabled", false).text(originalText);
    }
  });

  $(document).on("click", ".delete-record-btn", async function() {
    if (confirm("確定要永久刪除此雲端記錄嗎？")) {
      if (await deleteRecordAPI($(this).data("id"))) renderRecords();
      else alert("刪除失敗。");
    }
  });

  $(document).on("click", ".change-role-btn", async function() {
    const id = $(this).data("id");
    const currentRole = String($(this).data("role") || "").toLowerCase();
    const role = currentRole === "admin" ? "user" : "admin";
    
    if (confirm(`確定要將此用戶的權限切換為 ${role} 嗎？`)) {
      if (await updateUserRole(id, role)) renderUsers();
    }
  });

  $(document).on("click", ".toggle-blacklist-btn", async function() {
    const id = $(this).data("id");
    const isCurrentlyBlacklisted = $(this).data("status") == 1;
    const newStatus = !isCurrentlyBlacklisted;
    const action = newStatus ? "執行影子封鎖" : "解除影子封鎖";
    
    if (confirm(`確定要對此用戶${action}嗎？\n\n注意：該用戶提交的所有數據將會被標註為無效，且不計入預測推演。`)) {
      if (await updateUserBlacklistAPI(id, newStatus)) {
        // Refresh whatever panel we are on
        const currentPanel = $(".sidebar-item.active").attr("id").replace("nav-", "");
        loadPanelData(currentPanel);
      } else {
        alert("操作失敗，請檢查網路連線或權限。");
      }
    }
  });

  $(document).on("click", ".verify-record-btn", async function() {
    const id = $(this).data("id");
    if (await verifyRecordAPI(id)) renderRecords();
    else alert("驗證操作失敗。");
  });

  $(document).on("click", ".flag-record-btn", async function() {
    const id = $(this).data("id");
    if (confirm("⚠️ 惡意數據警告\n\n您確定要標記此數據為『惡意/誤導性』嗎？\n\n這將會：\n1. 永久刪除此條戰績。\n2. 自動扣除該貢獻者 20 點信譽分。")) {
      if (await flagRecordAPI(id)) renderRecords();
      else alert("操作失敗。");
    }
  });

  $(document).on("click", ".restore-rep-btn", async function() {
    const uid = $(this).data("uid");
    if (confirm("🛡️ 人工信譽恢復\n\n確定已完成對該用戶的審核，並將其信譽分恢復至 100 嗎？")) {
      if (await restoreReputationAPI(uid)) renderUsers();
      else alert("恢復失敗。");
    }
  });

  // 批量選取邏輯
  $("#check-all-records").on("change", function() {
    $(".record-checkbox").prop("checked", $(this).prop("checked"));
    updateBatchButton();
  });

  $(document).on("change", ".record-checkbox", updateBatchButton);

  $("#btn-batch-verify").on("click", async function() {
    const selectedIds = $(".record-checkbox:checked").map((_, el) => $(el).data("id")).get();
    if (selectedIds.length === 0) return;

    if (confirm(`確定要批量驗證選中的 ${selectedIds.length} 筆戰績嗎？`)) {
      const result = await batchVerifyAPI(selectedIds);
      if (result && result.status === "success") {
        alert(result.message);
        renderRecords();
      } else {
        alert("批量驗證失敗。");
      }
    }
  });
}

function updateBatchButton() {
  const count = $(".record-checkbox:checked").length;
  if (count > 0) {
    $("#btn-batch-verify").removeClass("hidden").css('display', 'flex');
    $("#selected-count").text(count);
  } else {
    $("#btn-batch-verify").addClass("hidden").css('display', 'none');
  }
}

onAuthStateChanged(auth, async (u) => {
  if (u) {
    try {
      const idToken = await u.getIdToken(true);
      const userData = await apiFetch('/auth/verify', { method: "POST", body: JSON.stringify({ id_token: idToken }) });
      if (userData.role?.toLowerCase() === "admin") {
        $("#user-name").text(userData.display_name || "Admin");
        if (userData.photo_url) $("#user-avatar").attr("src", userData.photo_url);
        setupEventListeners();
        showPanel("users");
        $("#admin-loading")?.fadeOut();
      } else {
        alert("權限不足：您在本地資料庫中的角色不是管理員 (admin)。\n目前的角色為：" + userData.role);
        window.location.href = "./index.html";
      }
    } catch (e) { 
      console.error(e);
      alert("無法登入後台：\n1. 請確認 Python 後端 (8000 埠) 是否已啟動。\n2. 錯誤訊息：" + e.message);
      window.location.href = "./index.html"; 
    }
  } else {
    window.location.href = "./index.html";
  }
});
