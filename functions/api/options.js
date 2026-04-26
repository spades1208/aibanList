/**
 * GET /api/options
 */
export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;
  try {
    const url = new URL(context.request.url);
    const activeMapName = url.searchParams.get("map_name");

    const [mapsRes, survivorsRes, huntersRes, configRes, hotRecordsRes] = await Promise.all([
      db.prepare("SELECT name FROM maps ORDER BY name ASC").all(),
      db.prepare("SELECT name FROM survivors").all(),
      db.prepare("SELECT name FROM hunters").all(),
      db.prepare("SELECT value FROM configs WHERE key = 'current_version' LIMIT 1").first(),
      db.prepare(`
        SELECT r.map_name, r.ban_survivors 
        FROM match_records r
        LEFT JOIN users u ON r.added_by_uid = u.id
        WHERE (u.is_blacklisted IS NULL OR u.is_blacklisted = 0)
        ORDER BY r.reported_at DESC LIMIT 50
      `).all()
    ]);

    const getPortrait = (name) => {
      const encodedName = encodeURIComponent(name);
      return { 
        name, 
        is_hot: false, 
        portrait: `/static/images/char/${encodedName}.png` 
      };
    };

    let survivorsList = (survivorsRes.results || []).map(s => getPortrait(s.name));
    let huntersList = (huntersRes.results || []).map(h => getPortrait(h.name));

    const gC = { surv: {}, hunt: {} }; 
    const mC = { surv: {}, hunt: {} };

    if (hotRecordsRes.results && hotRecordsRes.results.length > 0) {
      hotRecordsRes.results.forEach(r => {
        let bans = [];
        try { bans = JSON.parse(r.ban_survivors || "[]"); } 
        catch (e) { bans = (r.ban_survivors || "").split(",").map(b => b.trim()); }
        
        bans.forEach(b => {
          if (!b) return;
          gC.surv[b] = (gC.surv[b] || 0) + 1;
          if (activeMapName && r.map_name === activeMapName) mC.surv[b] = (mC.surv[b] || 0) + 1;
        });

        const hName = r.hunter_name;
        if (hName) {
          gC.hunt[hName] = (gC.hunt[hName] || 0) + 1;
          if (activeMapName && r.map_name === activeMapName) mC.hunt[hName] = (mC.hunt[hName] || 0) + 1;
        }
      });

      // 標註熱門標籤 (Top 5)
      const markHot = (list, mCount, gCount) => {
        const counts = Object.values(mCount).reduce((a, b) => a + b, 0) >= 2 ? mCount : gCount;
        const hotNames = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
        list.forEach(item => {
          if (hotNames.includes(item.name)) item.is_hot = true;
        });
      };

      markHot(survivorsList, mC.surv, gC.surv);
      markHot(huntersList, mC.hunt, gC.hunt);

      // 實作排序：本地圖次數 > 全局次數 > 名稱 (ASC)
      const sortList = (list, mCount, gCount) => {
        return list.sort((a, b) => {
          const ma = mCount[a.name] || 0;
          const mb = mCount[b.name] || 0;
          if (ma !== mb) return mb - ma;
          
          const ga = gCount[a.name] || 0;
          const gb = gCount[b.name] || 0;
          if (ga !== gb) return gb - ga;
          
          return a.name.localeCompare(b.name, "zh-Hant");
        });
      };

      survivorsList = sortList(survivorsList, mC.surv, gC.surv);
      huntersList = sortList(huntersList, mC.hunt, gC.hunt);
    }

    return new Response(JSON.stringify({
      maps: (mapsRes.results || []).map(m => m.name),
      survivors: survivorsList,
      hunters: huntersList,
      current_version: configRes ? configRes.value : "Season 41"
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}
