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

    const survivorsList = (survivorsRes.results || []).map(s => ({ name: s.name, is_hot: false }));
    const huntersList = (huntersRes.results || []).map(h => ({ name: h.name, is_hot: false }));

    if (hotRecordsRes.results && hotRecordsRes.results.length > 0) {
      const gC = {}; const mC = {};
      hotRecordsRes.results.forEach(r => {
        let bans = [];
        try { bans = JSON.parse(r.ban_survivors || "[]"); } 
        catch (e) { bans = (r.ban_survivors || "").split(",").map(b => b.trim()); }
        bans.forEach(b => {
          if (!b) return;
          gC[b] = (gC[b] || 0) + 1;
          if (activeMapName && r.map_name === activeMapName) mC[b] = (mC[b] || 0) + 1;
        });
      });
      const calculateHot = (countsMap) => Object.entries(countsMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
      const hotNames = calculateHot(Object.values(mC).reduce((a, b) => a + b, 0) >= 2 ? mC : gC);
      const sDict = {}; survivorsList.forEach(s => sDict[s.name] = s);
      hotNames.forEach(name => { if (sDict[name]) sDict[name].is_hot = true; });
    }

    return new Response(JSON.stringify({
      maps: (mapsRes.results || []).map(m => m.name),
      survivors: survivorsList,
      hunters: huntersList,
      current_version: configRes ? configRes.value : "Season 41"
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}
