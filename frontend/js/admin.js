import { auth, getIdToken } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : "/api"; 

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...options.headers
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) throw new Error("API Request Failed");
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
    // We'll use a query param for simpler routing in Cloudflare Functions
    await apiFetch(`/admin/records?id=${id}`, { method: 'DELETE' });
    return true;
  } catch (e) { return false; }
}

async function fetchUsers() {
  try {
    return await apiFetch('/admin/users');
  } catch (e) { return []; }
}

async function updateUserRole(userId, newRole) {
  try {
    await apiFetch(`/admin/users?uid=${userId}&role=${newRole}`, { method: 'PATCH' });
    return true;
  } catch (e) { return false; }
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
}

async function loadFilters() {
  try {
    const data = await apiFetch('/options');
    const $m = $("#filter-map"); const $h = $("#filter-hunter");
    if ($m.children().length <= 1) {
      $m.html('<option value="">All Maps</option>');
      data.maps.forEach(n => $m.append(new Option(n, n)));
    }
    if ($h.children().length <= 1) {
      $h.html('<option value="">All Hunters</option>');
      data.hunters.forEach(i => $h.append(new Option(i.name, i.name)));
    }
  } catch (e) { console.error(e); }
}

async function renderUsers() {
  const users = await fetchUsers();
  const $t = $("#users-tbody").empty();
  users.forEach(u => {
    $t.append(`<tr><td class="px-6 py-4">${u.display_name || "N/A"}</td><td class="px-6 py-4 text-xs text-slate-500">${u.email}</td><td class="px-6 py-4"><span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-800">${u.role}</span></td><td class="px-6 py-4"><button class="change-role-btn text-indigo-400 text-xs font-bold" data-id="${u.id}" data-role="${u.role}">Toggle Role</button></td></tr>`);
  });
}

async function renderRecords() {
  if (isFetching) return;
  isFetching = true;
  const mapFilter = $("#filter-map").val();
  const hunterFilter = $("#filter-hunter").val();
  const data = await fetchRecordsAPI(currentPage, mapFilter, hunterFilter);
  const $t = $("#records-tbody").empty();
  
  if (data.records.length === 0) {
    $t.append('<tr><td colspan="6" class="p-8 text-center text-slate-600 italic">No records found.</td></tr>');
  } else {
    data.records.forEach(r => {
      const bans = (r.ban_survivors || []).map(s => `<span class="bg-slate-800 px-1 rounded text-[9px] mr-1">${s}</span>`).join('');
      const dateStr = r.reported_at ? new Date(r.reported_at).toLocaleString() : "N/A";
      
      $t.append(`
        <tr class="hover:bg-white/[0.02] border-b border-white/5 transition-colors text-xs">
          <td class="px-6 py-4 text-white">${r.map_name}</td>
          <td class="px-6 py-4">${bans}</td>
          <td class="px-6 py-4 text-indigo-400 font-bold">${r.hunter_name}</td>
          <td class="px-6 py-4 text-slate-500">${r.added_by_name || "System"}</td>
          <td class="px-6 py-4 text-[10px] font-mono text-slate-600">${dateStr}</td>
          <td class="px-6 py-4 text-right">
            <button class="delete-record-btn text-red-500/50 hover:text-red-500" data-id="${r.id}">
              Delete
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

  $("#btn-logout").on("click", () => auth.signOut());
  
  $("#btn-save-version").on("click", async function() {
    const v = $("#input-version").val();
    if (await updateVersionAPI(v)) alert("Version updated: " + v);
    else alert("Failed to update version.");
  });

  $(document).on("click", ".delete-record-btn", async function() {
    if (confirm("Permanently delete this cloud record?")) {
      if (await deleteRecordAPI($(this).data("id"))) renderRecords();
      else alert("Delete failed.");
    }
  });

  $(document).on("click", ".change-role-btn", async function() {
    const id = $(this).data("id");
    const role = $(this).data("role") === "admin" ? "user" : "admin";
    if (confirm(`Change role to ${role}?`)) {
      if (await updateUserRole(id, role)) renderUsers();
    }
  });
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
        alert("Unauthorized access.");
        window.location.href = "../index.html";
      }
    } catch (e) { window.location.href = "../index.html"; }
  } else {
    window.location.href = "../index.html";
  }
});
