import { db } from "./auth.js";
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 地圖基礎強勢分 (底層邏輯)
const MAP_BASE_SCORES = {
  "里奧的回憶": { "隱士": 10.0, "歌劇演員": 10.0, "『使徒』": 5.0 },
  "永眠鎮": { "隱士": 10.0, "宿傘之魂": 8.0, "守夜人": 8.0 },
  "紅教堂": { "紅蝶": 10.0, "守夜人": 10.0, "漁女": 5.0 },
  "聖心醫院": { "時空之影": 10.0, "雕刻家": 10.0, "夢之女巫": 5.0 },
  "軍工廠": { "歌劇演員": 10.0, "漁女": 10.0, "廠長": 5.0 },
  "月亮河公園": { "『傑克』": 8.0, "蜘蛛": 8.0, "宿傘之魂": 5.0 },
  "湖景村": { "漁女": 12.0, "黃衣之主": 8.0, "『使徒』": 5.0 },
};

// 權重常數
const BADGE_WEIGHTS = { "S": 5.0, "A": 3.0, "B": 1.5, "C": 1.0, "unknown": 1.0 };
const MATCH_WEIGHTS = { 3: 1.0, 2: 0.6, 1: 0.3 };

/**
 * 執行加權推演預測
 * @param {string} mapName 地圖名稱
 * @param {string[]} banSurvivors 被禁用的求生者
 */
export async function executePredictionLogic(mapName, banSurvivors) {
  if (!mapName) return null;

  try {
    // 1. 從 Firestore 抓取目標地圖的全量數據
    const q = query(collection(db, "match_records"), where("map_name", "==", mapName));
    const querySnapshot = await getDocs(q);

    // 2. 初始化計數器與基礎分
    let counts = {};
    const baseData = MAP_BASE_SCORES[mapName] || {};
    for (const [hunter, score] of Object.entries(baseData)) {
      counts[hunter] = parseFloat(score);
    }
    
    let totalScore = Object.values(counts).reduce((sum, s) => sum + s, 0);

    const inputBans = new Set(banSurvivors.filter(b => b));
    let maxMatchesFound = 0;

    // 3. 疊加實戰數據分
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const recordBans = new Set(data.ban_survivors || []);
      
      // 計算 Ban 位交集
      let matchCount = 0;
      for (const ban of inputBans) {
        if (recordBans.has(ban)) matchCount++;
      }

      // 如果有任何匹配，或是完全無輸入 Ban 位（純參考地圖）
      if (matchCount > 0 || inputBans.size === 0) {
        const weightTier = inputBans.size > 0 ? (MATCH_WEIGHTS[matchCount] || 1.0) : 1.0;
        
        if (matchCount > maxMatchesFound) {
          maxMatchesFound = matchCount;
        }

        const hunter = data.hunter_name || "未知監管者";
        const badge = data.badge_level || "unknown";

        // 推演公式：匹配信心 * 徽章強度
        const dataContribution = weightTier * (BADGE_WEIGHTS[badge] || 1.0);
        
        counts[hunter] = (counts[hunter] || 0.0) + dataContribution;
        totalScore += dataContribution;
      }
    });

    if (totalScore === 0) {
      return { predictions: [], message: "目前尚無任何符合或相關聯的數據。" };
    }

    // 4. 排序並計算加權百分比
    const sortedHunters = Object.entries(counts)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);

    const results = sortedHunters.slice(0, 10).map(([hName, score]) => {
      const perc = (score / totalScore) * 100;
      return {
        hunter_name: hName,
        score: parseFloat(score.toFixed(1)),
        percentage: `${perc.toFixed(1)}%`
      };
    });

    // 5. 標籤配置
    let precisionLabel = "數據精準 (Tier 1)";
    if (maxMatchesFound === 2) precisionLabel = "廣泛參考 (Tier 2)";
    if (maxMatchesFound === 1) precisionLabel = "趨勢預估 (Tier 3)";
    if (inputBans.size === 0) precisionLabel = "地圖原生排名";

    return {
      predictions: results,
      total_score: parseFloat(totalScore.toFixed(1)),
      precision_label: precisionLabel
    };

  } catch (err) {
    console.error("Prediction Logic Error:", err);
    throw err;
  }
}

// 預設版本號 (當資料庫 configs/current_status 內容為空時使用)
const DEFAULT_VERSION = "2024.12.30";

/**
 * 提交戰績回饋
 */
export async function submitMatchFeedback(mapName, banSurvivors, hunterName, badgeLevel) {
  try {
    let currentVersion = DEFAULT_VERSION;
    try {
      const configSnap = await getDoc(doc(db, "configs", "current_status"));
      if (configSnap.exists()) currentVersion = configSnap.data().current_version || "unknown";
    } catch (e) {
      console.warn("Could not fetch current version:", e);
    }

    await addDoc(collection(db, "match_records"), {
      map_name: mapName,
      ban_survivors: banSurvivors,
      hunter_name: hunterName,
      version: currentVersion,
      badge_level: badgeLevel || "C",
      reported_at: serverTimestamp(),
      source: "feedback_frontend"
    });

    return true;
  } catch (err) {
    console.error("Submit Feedback Error:", err);
    throw err;
  }
}

/**
 * 抓取全量篩選數據 (Options) - 純前端實現
 */
export async function fetchOptionsData(activeMapName = "") {
  // 安全保底：基本地圖清單
  const FALLBACK_MAPS = ["軍工廠", "紅教堂", "聖心醫院", "湖景村", "永眠鎮", "月亮河公園", "唐人街", "里奧的回憶"];
  const FALLBACK_SURVIVORS = ["門修士", "古董商", "空軍", "傭兵", "先知", "咒術師", "雜技演員", "小女孩", "昆蟲學者", "心理學家", "病患", "調酒師", "入殮師", "勘探員", "大副", "野人", "守墓人", "舞女", "機械師", "牛仔", "盲女", "祭司", "前鋒", "醫生", "律師", "慈善家", "園丁", "冒險家", "魔術師", "教授"];
  const FALLBACK_HUNTERS = ["歌劇演員", "時空之影", "隱士", "夢之女巫", "雕刻家", "紅蝶", "漁女", "守夜人", "宿傘之魂", "『公投』", "『使徒』", "蜘蛛", "『傑克』", "黃衣之主", "紅夫人", "愛哭鬼", "瘋眼", "攝影師", "蠟像師", "噩夢", "小提琴家", "破輪", "博士", "記錄員", "廠長", "鹿頭", "小丑"];

  try {
    // 讀取基礎設定
    const [mapsSnap, survsSnap, huntsSnap, recordsSnap] = await Promise.all([
      getDocs(collection(db, "maps")),
      getDocs(collection(db, "survivors")),
      getDocs(collection(db, "hunters")),
      getDocs(collection(db, "match_records"))
    ]);

    let maps = mapsSnap.docs.map(d => d.data().name).filter(n => n);
    if (maps.length === 0) maps = FALLBACK_MAPS;
    maps = [...new Set(maps)].sort();
    
    // 初始化字典
    let survivorsDict = {};
    if (survsSnap.empty) {
      FALLBACK_SURVIVORS.forEach(name => survivorsDict[name] = { name, is_hot: false, is_map_specific: false });
    } else {
      survsSnap.docs.forEach(d => {
        const name = d.data().name;
        if (name) survivorsDict[name] = { name, is_hot: false, is_map_specific: false };
      });
    }
    
    // 依照使用者要求確保 "門修士" 存在於基礎列表
    if (!survivorsDict["門修士"]) survivorsDict["門修士"] = { name: "門修士", is_hot: false, is_map_specific: false };

    let huntersDict = {};
    if (huntsSnap.empty) {
      FALLBACK_HUNTERS.forEach(name => huntersDict[name] = { name, is_hot: false, is_map_specific: false });
    } else {
      huntsSnap.docs.forEach(d => {
        const name = d.data().name;
        if (name) huntersDict[name] = { name, is_hot: false, is_map_specific: false };
      });
    }

    // 全局與本地圖計數
    let mapCounts = { surv: {}, hunt: {} };
    let globalCounts = { surv: {}, hunt: {} };

    recordsSnap.docs.forEach(d => {
      const data = d.data();
      const mName = data.map_name;
      const hName = data.hunter_name;
      const bans = data.ban_survivors || [];

      if (hName) globalCounts.hunt[hName] = (globalCounts.hunt[hName] || 0) + 1;
      bans.forEach(b => globalCounts.surv[b] = (globalCounts.surv[b] || 0) + 1);

      if (activeMapName && mName === activeMapName) {
        if (hName) mapCounts.hunt[hName] = (mapCounts.hunt[hName] || 0) + 1;
        bans.forEach(b => mapCounts.surv[b] = (mapCounts.surv[b] || 0) + 1);
      }
    });

    // 熱門角色標記邏輯
    function markHot(targetDict, mCount, gCount) {
      const mEntries = Object.entries(mCount).sort((a,b) => b[1] - a[1]);
      const mTotal = Object.values(mCount).reduce((a,b)=>a+b, 0);
      
      let hotList = [];
      let isMap = false;

      if (mTotal >= 3) {
        hotList = mEntries.slice(0, 5);
        isMap = true;
      } else {
        hotList = Object.entries(gCount).sort((a,b) => b[1] - a[1]).slice(0, 5);
      }

      hotList.forEach(([name, _]) => {
        if (targetDict[name]) {
          targetDict[name].is_hot = true;
          targetDict[name].is_map_specific = isMap;
        }
      });
    }

    markHot(survivorsDict, mapCounts.surv, globalCounts.surv);
    markHot(huntersDict, mapCounts.hunt, globalCounts.hunt);

    return {
      maps,
      survivors: Object.values(survivorsDict).sort((a,b) => a.name.localeCompare(b.name, "zh-Hant")),
      hunters: Object.values(huntersDict).sort((a,b) => a.name.localeCompare(b.name, "zh-Hant"))
    };

  } catch (err) {
    console.error("Options Logic Error:", err);
    // 發生嚴重錯誤時返回純保底數據
    return {
      maps: FALLBACK_MAPS,
      survivors: FALLBACK_SURVIVORS.map(n => ({ name: n, is_hot: false })),
      hunters: FALLBACK_HUNTERS.map(n => ({ name: n, is_hot: false }))
    };
  }
}
