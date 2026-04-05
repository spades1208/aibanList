/**
 * GET /api/options?map=...
 * 抓取地圖、角色清單、熱門狀態及全站版本號 (Trigger Deploy)
 */
export async function onRequest(context) {
  const { env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: "D1 database binding 'DB' not found." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 取得 URL 參數 (用於特定地圖的熱門度計算)
    const url = new URL(context.request.url);
    const activeMapName = url.searchParams.get("map");

    // 1. 並行執行資料庫查詢
    const [mapsRes, survivorsRes, huntersRes, configRes, hotRecordsRes] = await Promise.all([
      db.prepare("SELECT name FROM maps ORDER BY name ASC").all(),
      db.prepare("SELECT name FROM survivors").all(),
      db.prepare("SELECT name FROM hunters").all(),
      db.prepare("SELECT value FROM configs WHERE key = 'current_version' LIMIT 1").first(),
      db.prepare("SELECT map_name, ban_survivors FROM match_records ORDER BY reported_at DESC LIMIT 50").all()
    ]);

    const survivorsList = (survivorsRes.results || []).map(s => ({ name: s.name, is_hot: false }));
    const huntersList = (huntersRes.results || []).map(h => ({ name: h.name, is_hot: false }));

    // 2. 處理「熱門求生者」邏輯 (僅限最新 50 筆)
    if (hotRecordsRes.results && hotRecordsRes.results.length > 0) {
      const gC = {}; // 全局計數
      const mC = {}; // 本地圖計數
      
      hotRecordsRes.results.forEach(r => {
        let bans = [];
        try {
          bans = JSON.parse(r.ban_survivors || "[]");
        } catch (e) {
          // 如果格式不是 JSON，嘗試簡單拆分或忽略
          bans = (r.ban_survivors || "").split(",").map(b => b.trim());
        }

        bans.forEach(b => {
          if (!b) return;
          gC[b] = (gC[b] || 0) + 1;
          if (activeMapName && r.map_name === activeMapName) {
            mC[b] = (mC[b] || 0) + 1;
          }
        });
      });

      const survivorsDict = {};
      survivorsList.forEach(s => survivorsDict[s.name] = s);

      // 標註前 5 名熱門角色
      const calculateHot = (countsMap) => {
        return Object.entries(countsMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name]) => name);
      };

      const mapHotCount = Object.values(mC).reduce((a, b) => a + b, 0);
      const hotNames = calculateHot(mapHotCount >= 2 ? mC : gC);
      
      hotNames.forEach(name => {
        if (survivorsDict[name]) survivorsDict[name].is_hot = true;
      });
    }

    return new Response(JSON.stringify({
      maps: (mapsRes.results || []).map(m => m.name),
      survivors: Object.values(survivorsList),
      hunters: huntersList,
      version: configRes ? configRes.value : "Season 41"
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60" // 允許瀏覽器快取 1 分鐘
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
