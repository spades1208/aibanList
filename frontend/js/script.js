import { auth, signInWithGoogle, onAuthStateChanged, getIdToken } from "./auth.js";

// --- API Helper ---
const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? `https://aibanlist.pages.dev/api`
  : "/api"; 

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(errorBody.detail || "API Request Failed");
  }
  return res.json();
}

// --- Data Weights & Algorithms ---
const MAP_BASE_SCORES = {
  "里奧的回憶": { "隱士": 10.0, "歌劇演員": 10.0, "『使徒』": 5.0 },
  "永眠鎮": { "隱士": 10.0, "宿傘之魂": 8.0, "守夜人": 8.0 },
  "紅教堂": { "紅蝶": 10.0, "守夜人": 10.0, "漁女": 5.0 },
  "聖心醫院": { "時空之影": 10.0, "雕刻家": 10.0, "夢之女巫": 5.0 },
  "軍工廠": { "歌劇演員": 10.0, "漁女": 10.0, "廠長": 5.0 },
  "月亮河公園": { "『傑克』": 8.0, "蜘蛛": 8.0, "宿傘之魂": 5.0 },
  "湖景村": { "漁女": 12.0, "黃衣之主": 8.0, "『使徒』": 5.0 },
};
const FALLBACK_MAPS = ["軍工廠", "紅教堂", "聖心醫院", "湖景村", "永眠鎮", "月亮河公園", "唐人街", "里奧的回憶"];
const FALLBACK_SURVIVORS = ["古董商", "空軍", "傭兵", "先知", "咒術師", "雜技演員", "小女孩", "昆蟲學者", "心理學家", "病患", "調酒師", "入殮師", "勘探員", "大副", "野人", "守墓人", "舞女", "機械師", "牛仔", "盲女", "祭司", "前鋒", "醫生", "律師", "慈善家", "園丁", "冒險家", "魔術師", "教授"];
const FALLBACK_HUNTERS = ["歌劇演員", "時空之影", "隱士", "夢之女巫", "雕刻家", "紅蝶", "漁女", "守夜人", "宿傘之魂", "『公投』", "『使徒』", "蜘蛛", "『傑克』", "黃衣之主", "紅夫人", "愛哭鬼", "瘋眼", "攝影師", "蠟像師", "噩夢", "小提琴家", "破輪", "博士", "記錄員", "廠長", "鹿頭", "小丑"];

// --- Cache Helpers ---
const CACHE_TTL = 24 * 60 * 60 * 1000;
function getCachedData(key) {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  const { data, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > CACHE_TTL) return null;
  return data;
}
function setCachedData(key, data) {
  localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
}

// --- Main Prediction Logic ---
export async function executePredictionLogic(mapName, banSurvivors) {
  if (!mapName) return null;
  try {
    return await apiFetch('/predict', {
      method: "POST",
      body: JSON.stringify({ map_name: mapName, ban_survivors: banSurvivors.filter(b => b) })
    });
  } catch (err) { 
    console.error("[Prediction Error]", err);
    return { predictions: [], precision_label: "Connection Error" }; 
  }
}

export async function submitMatchFeedback(mapName, banSurvivors, hunterName, badgeLevel) {
  try {
    return await apiFetch('/submit-match', {
      method: "POST",
      body: JSON.stringify({ map_name: mapName, ban_survivors: banSurvivors.filter(b => b), hunter_name: hunterName, badge_level: badgeLevel || "C" })
    });
  } catch (err) { throw err; }
}

export async function fetchOptionsData(activeMapName = "") {
  try {
    let url = "/options";
    if (activeMapName) url += `?map_name=${encodeURIComponent(activeMapName)}`;
    const data = await apiFetch(url);
    if (data.current_version) {
      window.siteVersion = data.current_version;
      $("#app-version-display").text(window.siteVersion);
    }
    const res = { 
      maps: data.maps || FALLBACK_MAPS, 
      survivors: data.survivors || FALLBACK_SURVIVORS.map(n => ({ name: n, is_hot: false })), 
      hunters: data.hunters || FALLBACK_HUNTERS.map(n => ({ name: n, is_hot: false })),
      version: data.current_version || "Season 41"
    };
    window.allHunters = res.hunters;
    return res;
  } catch (err) {
    return { maps: FALLBACK_MAPS, survivors: FALLBACK_SURVIVORS.map(n => ({name: n, is_hot: false})), hunters: FALLBACK_HUNTERS.map(n => ({name: n, is_hot: false})) };
  }
}

// --- UI Helpers ---
export function renderOptions(selector, items, placeholder) {
  const $el = $(selector);
  $el.empty().append(new Option(placeholder, ""));
  const hots = items.filter(i => i.is_hot);
  const others = items.filter(i => !i.is_hot);
  if (hots.length > 0) {
    const g = $('<optgroup label="🔥 熱門推薦"></optgroup>');
    hots.forEach(i => { g.append(new Option(`🔥 ${i.name}`, i.name)); });
    $el.append(g);
  }
  const gAll = $('<optgroup label="所有角色"></optgroup>');
  others.forEach(i => gAll.append(new Option(i.name, i.name)));
  $el.append(gAll);
  $el.select2({ placeholder, width: '100%', allowClear: true });
}

async function executePrediction() {
  const map = $("#predict-map").val();
  if (!map) return;
  const bans = $(".survivor-select").map((i, el) => $(el).val()).get().filter(v => v);
  $("#predict-results").removeClass("hidden").show();
  $("#results-placeholder").hide();
  try {
    const d = await executePredictionLogic(map, bans);
    const $l = $("#results-list").empty();
    $("#precision-tag").text(d.precision_label);
    if (d.predictions?.length > 0) {
      d.predictions.forEach((p, i) => {
        $l.append(`
          <div class="glass p-6 rounded-[2rem] border border-white/5 flex items-center justify-between transition hover:border-indigo-500/30">
            <div class="flex items-center gap-4">
              <span class="text-indigo-500 font-black text-xl">${i+1}</span>
              <span class="text-slate-100 font-bold text-lg">${p.hunter_name}</span>
            </div>
            <div class="text-indigo-400 font-black text-xl tracking-tighter">${p.percentage}</div>
          </div>
        `);
        if (i === 0) {
            $l.append(`<div id="feedback-inline-box" class="feedback-inline p-4"><p class="text-center text-slate-500 text-[10px] mb-2 uppercase">資料是否正確？</p><div class="flex gap-2"><button id="f-yes" class="flex-1 bg-emerald-500/10 py-3 rounded-xl text-emerald-400 font-bold text-xs">是</button><button id="f-no" class="flex-1 bg-red-500/10 py-3 rounded-xl text-red-400 font-bold text-xs">否</button></div></div>`);
            $("#f-yes").on("click", async () => {
                await submitMatchFeedback(map, bans, p.hunter_name, "C");
                $("#feedback-inline-box").html('<p class="text-center text-emerald-400 font-bold text-xs py-2">感謝您的配合與貢獻！</p>');
            });
            $("#f-no").on("click", async () => {
                const hunterOptions = (window.allHunters || []).map(h => `<option value="${h.name}">${h.name}</option>`).join('');
                const { value: formValues } = await Swal.fire({
                  title: '手動更正數據',
                  html: `
                    <div class="text-left space-y-4">
                      <div>
                        <label class="text-[10px] uppercase font-black text-slate-500 mb-2 block">實際監管者</label>
                        <select id="swal-hunter" class="swal2-select w-full m-0">${hunterOptions}</select>
                      </div>
                      <div>
                        <label class="text-[10px] uppercase font-black text-slate-500 mb-2 block">徽章等級</label>
                        <select id="swal-badge" class="swal2-select w-full m-0">
                          <option value="">無 (或是 C 級以下)</option>
                          <option value="S">S 級徽章</option>
                          <option value="A">A 級徽章</option>
                          <option value="B">B 級徽章</option>
                          <option value="C">C 級徽章</option>
                        </select>
                      </div>
                    </div>
                  `,
                  focusConfirm: false,
                  showCancelButton: true,
                  confirmButtonText: '提交更正',
                  cancelButtonText: '取消',
                  preConfirm: () => {
                    return {
                      hunter: document.getElementById('swal-hunter').value,
                      badge: document.getElementById('swal-badge').value
                    }
                  }
                });
                
                if (formValues && formValues.hunter) {
                  await submitMatchFeedback(map, bans, formValues.hunter, formValues.badge || "C");
                  $("#feedback-inline-box").html('<p class="text-center text-indigo-400 font-bold text-xs py-2">已提交更正，感謝您的貢獻！</p>');
                }
            });
        }
      });
    }
  } catch(e) { console.error(e); }
}

async function loadInitialData(mapName = null) {
  const d = await fetchOptionsData(mapName);
  if (!mapName && d.maps) renderOptions("#predict-map", d.maps.map(m => ({name: m})), "-- 請選擇地圖 --");
  if (d.survivors) renderOptions(".survivor-select", d.survivors, "(無 Ban 位)");
}

// --- UI Mutex (Prevent duplicate picks) ---
function updateExclusion() {
  const $selects = $(".survivor-select");
  const allSelected = $selects.map((i, el) => $(el).val()).get().filter(v => v);

  $selects.each(function() {
    const $this = $(this);
    const myCurrentVal = $this.val();
    $this.find("option").each(function() {
      const optVal = $(this).val();
      if (!optVal) return; 
      const isUsedByOthers = allSelected.includes(optVal) && optVal !== myCurrentVal;
      $(this).prop("disabled", isUsedByOthers);
    });
    $this.trigger('change.select2');
  });
}

// --- Init ---
$(() => {
  $("#predict-map").on("change", function() {
    const val = $(this).val();
    if(val) {
      $("#ban-container").removeClass("opacity-50 pointer-events-none");
      $(".survivor-select").val(null).trigger("change.select2");
      loadInitialData(val);
      executePrediction();
    }
  });

  $(document).on("change", ".survivor-select", () => {
    updateExclusion();
    executePrediction();
  });

  $("#btn-google-login").on("click", async () => {
    console.log("[Auth] Google Login Clicked");
    try {
      await signInWithGoogle();
    } catch(e) {
      console.error(e);
      alert("Login Error: " + e.message);
    }
  });

  $("#btn-header-logout").on("click", async () => {
    const { logout } = await import("./auth.js");
    await logout();
  });

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      $("#login-section").addClass("hidden"); 
      $("#main-feature-section").removeClass("hidden");
      $("#user-profile").removeClass("hidden").addClass("flex");
      $("#profile-name").text(u.displayName || "User");
      $("#profile-avatar").attr("src", u.photoURL || "");
      
      try {
        const idToken = await u.getIdToken(true);
        const userData = await apiFetch('/auth/verify', { method: "POST", body: JSON.stringify({ id_token: idToken }) });
        if (userData.role?.toLowerCase() === "admin") {
          $("#admin-tag-container").html(`<a href="./admin.html" class="bg-indigo-600 text-white text-[10px] px-2 py-1 rounded shadow-lg shadow-indigo-500/30">管理後台</a>`);
        }
      } catch (err) { console.error(err); }
      await loadInitialData();
    } else {
      $("#login-section").removeClass("hidden"); 
      $("#main-feature-section").addClass("hidden");
      $("#user-profile").addClass("hidden");
    }
  });
});
