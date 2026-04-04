import { auth, db, signInWithGoogle, onAuthStateChanged } from "./auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { executePredictionLogic, submitMatchFeedback, fetchOptionsData } from "./prediction-logic.js";

let selectedBadge = "C";
let predictTimeout = null;

// --- 輔助：防震觸發 (Debounce) ---
function triggerAutoPredict() {
  if (predictTimeout) clearTimeout(predictTimeout);
  predictTimeout = setTimeout(() => executePrediction(), 350);
}

function showMsg(text, isError = false) {
  const msg = $("#status-msg");
  msg.text(text).removeClass("bg-red-500/10 bg-emerald-500/10 text-red-400 text-emerald-400")
     .addClass(isError ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400").fadeIn();
  setTimeout(() => msg.fadeOut(), 3000);
}

// 選單渲染
export function renderOptions(selector, items, placeholder) {
  const $el = $(selector);
  $el.empty().append(new Option(placeholder, ""));

  const hots = items.filter(i => i.is_hot);
  const others = items.filter(i => !i.is_hot);

  if (hots.length > 0) {
    const g = $('<optgroup label="🔥 本地圖熱門"></optgroup>');
    hots.forEach(i => {
       const o = new Option(`🔥 ${i.name}`, i.name);
       $(o).data('hot', true);
       g.append(o);
    });
    $el.append(g);
  }

  const gAll = $('<optgroup label="所有角色"></optgroup>');
  others.forEach(i => gAll.append(new Option(i.name, i.name)));
  $el.append(gAll);

  $el.select2({ 
    placeholder, width: '100%', allowClear: true,
    templateResult: (data) => {
      // 如果該選項已被禁用 (互斥)，則隱藏處理
      if (data.disabled) return null;
      
      const $el = $(data.element);
      if ($el.data('hot')) {
        return $(`<div class="hot-item px-2 py-1">${data.text}</div>`);
      }
      return data.text;
    }
  });
}

// 核心演算執行
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

        // --- 嵌入回饋區 (在第一名下方) ---
        if (i === 0) {
          $l.append(`
            <div id="feedback-inline-box" class="feedback-inline">
              <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 text-center">這場預測準嗎？</p>
              <div class="flex gap-3">
                <button id="f-yes" class="btn-feedback flex-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white py-4 rounded-2xl font-black text-xs transition-all">✅ 正確, 就是 ${p.hunter_name}</button>
                <button id="f-no" class="btn-feedback flex-1 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white py-4 rounded-2xl font-black text-xs transition-all">❌ 誤差, 是別人</button>
              </div>
              <div id="f-form" class="hidden mt-6 pt-6 border-t border-indigo-500/10 space-y-6">
                 <div id="f-hunter-box" class="hidden menu-block">
                    <label>實際出現的角色</label>
                    <select id="f-hunter-select" class="w-full"></select>
                 </div>
                 <div class="space-y-3">
                    <label class="block text-center text-[9px] font-black text-slate-600 uppercase tracking-widest">對手徽章等級</label>
                    <div class="badge-grid">
                       ${['S','A','B','C'].map(b => `<button class="badge-btn ${b==='C'?'active':''}" data-badge="${b}"><span class="font-black">${b}</span></button>`).join('')}
                    </div>
                 </div>
                 <button id="f-confirm" class="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition">確認修正並貢獻</button>
              </div>
            </div>
          `);
          
          bindFeedbackEvents(p.hunter_name, map, bans);
        }
      });
    }
  } catch(e) { console.error("演算法執行失敗", e); }
}

function bindFeedbackEvents(topHunter, map, bans) {
  $("#f-yes").on("click", () => { $("#f-hunter-box").hide(); $("#f-form").slideDown(); });
  $("#f-no").on("click", async () => {
    $("#f-hunter-box").show();
    const opt = await fetchOptionsData(map);
    const filteredHunters = opt.hunters.filter(h => h.name !== topHunter);
    renderOptions("#f-hunter-select", filteredHunters, "-- 選擇角色 --");
    $("#f-form").slideDown();
  });

  $(".badge-btn").on("click", function() {
    $(".badge-btn").removeClass("active"); $(this).addClass("active");
    selectedBadge = $(this).data("badge");
  });

  $("#f-confirm").on("click", async function() {
    const hunter = $("#f-hunter-box").is(":visible") ? $("#f-hunter-select").val() : topHunter;
    if(!hunter) return alert("請選定角色");
    
    const $btn = $(this);
    $btn.prop("disabled", true).text("🚚 傳送中...");
    
    try {
      await submitMatchFeedback(map, bans, hunter, selectedBadge);
      $("#feedback-inline-box").html('<p class="text-center text-emerald-400 font-black text-[10px] uppercase tracking-[0.4em] py-4">✨ 貢獻完成 · 演算已優化</p>');
    } catch(e) { 
      showMsg("儲存失敗", true); 
      $btn.prop("disabled", false).text("再次嘗試"); 
    }
  });
}

async function loadInitialData(mapName = null) {
  try {
    const d = await fetchOptionsData(mapName);
    
    if (!mapName && d.maps) {
      renderOptions("#predict-map", d.maps.map(m => ({name: m})), "-- 定位地圖 --");
    }
    
    if (d.survivors) {
      renderOptions(".survivor-select", d.survivors, "(無 Ban 位)");
    }
    
    updateExclusion();
  } catch (err) {
    console.error("Initial data load failed:", err);
  }
}

// --- 互斥功能 (防止重複選取相同角色) ---
function updateExclusion() {
  const $selects = $(".survivor-select");
  // 收集目前所有已選取的值 (排除空值)
  const allSelected = $selects.map((i, el) => $(el).val()).get().filter(v => v);

  $selects.each(function() {
    const $this = $(this);
    const myCurrentVal = $this.val();

    $this.find("option").each(function() {
      const optVal = $(this).val();
      if (!optVal) return; 
      
      // 如果這個角色被其他位置選走了，就禁用它
      const isUsedByOthers = allSelected.includes(optVal) && optVal !== myCurrentVal;
      $(this).prop("disabled", isUsedByOthers);
    });

    // 通知 Select2 重新抓取選項狀態並渲染
    $this.trigger('change.select2');
  });
}

// --- 初始化事件綁定 ---
$(() => {
  $("#predict-map").on("change", function() {
    const val = $(this).val();
    if(val) {
      $("#ban-container").removeClass("opacity-50 pointer-events-none");
      // 核心連動：換地圖清空 Ban 位
      $(".survivor-select").val(null).trigger("change.select2");
      loadInitialData(val);
      triggerAutoPredict(); // 立即觸發地圖預測
    }
  });

  $(document).on("change", ".survivor-select", () => {
     updateExclusion();
     triggerAutoPredict();
  });

  $("#btn-google-login").on("click", async () => {
    try {
      showMsg("正在啟動 Google 授權...", false);
      const u = await signInWithGoogle();
      // 登入後 onAuthStateChanged 會自動觸發 UI 更新，不需要 reload
    } catch(e) { 
      console.error(e);
      showMsg("登入或連線失敗: " + e.message, true); 
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
      
      $("#profile-name").text(u.displayName || "使用者");
      $("#profile-avatar").attr("src", u.photoURL || "https://ui-avatars.com/api/?name=User&background=6366f1&color=fff");
      
      // 即時連線確認角色 (解決 Admin 消失問題)
      try {
        const userRef = doc(db, "users", u.uid);
        let userSnap = await getDoc(userRef);
        
        // 緊急修復：如果使用者文件不存在，自動建立一個預設文件
        if (!userSnap.exists()) {
          console.warn("User profile missing locally, auto-provisioning...");
          const newUser = {
            id: u.uid,
            email: u.email,
            display_name: u.displayName,
            photo_url: u.photoURL,
            role: "user", 
            created_at: new Date().toISOString()
          };
          await setDoc(userRef, newUser);
          userSnap = { data: () => newUser }; // 模擬 snap
        }

        const role = userSnap.data().role || "user";
        localStorage.setItem("userRole", role);

        if (role === "admin") {
          $("#admin-tag-container").html(`
            <a href="./admin.html" class="mt-1 flex items-center justify-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-full font-black tracking-wider transition-all shadow-lg active:scale-95">
               <span>進入後台</span>
               <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7-7 7" /></svg>
            </a>
          `);
        } else {
          $("#admin-tag-container").html('<p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Authorized User</p>');
        }
      } catch (err) {
        console.error("Role Verification Error:", err);
      }
      
      await loadInitialData();
    } else {
      $("#login-section").removeClass("hidden"); 
      $("#main-feature-section").addClass("hidden");
      $("#user-profile").addClass("hidden");
    }
  });
});
